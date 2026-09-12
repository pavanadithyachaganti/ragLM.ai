// SERVER-ONLY. Reads API keys from process.env. Never import from a client component.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { PROVIDERS, type ProviderId } from "./catalog";

export function keyFor(p: ProviderId): string | undefined {
  return process.env[PROVIDERS[p].envVar];
}

export function liveProviders(): Record<ProviderId, boolean> {
  return {
    groq: !!keyFor("groq"),
    gemini: !!keyFor("gemini"),
    anthropic: !!keyFor("anthropic"),
  };
}

export function anyKeyPresent(): boolean {
  return Object.values(liveProviders()).some(Boolean);
}

type GenArgs = {
  provider: ProviderId;
  modelId: string;
  system: string;
  prompt: string;
  temperature: number;
  signal?: AbortSignal;
  maxTokens?: number;
};

/**
 * Unified streaming interface: yields text deltas as they arrive.
 * Throws on a hard failure (missing key, HTTP error) so callers can surface it.
 */
export async function* streamCompletion(a: GenArgs): AsyncGenerator<string> {
  switch (a.provider) {
    case "groq":
      yield* streamGroq(a);
      return;
    case "gemini":
      yield* streamGemini(a);
      return;
    case "anthropic":
      yield* streamAnthropic(a);
      return;
  }
}

/** Non-streaming full completion — used by the judge. */
export async function complete(a: GenArgs): Promise<string> {
  let out = "";
  for await (const delta of streamCompletion(a)) out += delta;
  return out;
}

/* -------------------- Groq (OpenAI-compatible) -------------------- */

async function* streamGroq(a: GenArgs): AsyncGenerator<string> {
  const key = keyFor("groq");
  if (!key) throw new Error("GROQ_API_KEY is not set");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: a.modelId,
      temperature: a.temperature,
      max_tokens: a.maxTokens ?? 1024,
      stream: true,
      messages: [
        { role: "system", content: a.system },
        { role: "user", content: a.prompt },
      ],
    }),
    signal: a.signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  for await (const data of sse(res.body)) {
    if (data === "[DONE]") return;
    try {
      const j = JSON.parse(data);
      const delta = j?.choices?.[0]?.delta?.content;
      if (delta) yield delta as string;
    } catch {
      /* ignore keepalive / partial */
    }
  }
}

/* -------------------- Gemini -------------------- */

async function* streamGemini(a: GenArgs): AsyncGenerator<string> {
  const key = keyFor("gemini");
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    a.modelId,
  )}:streamGenerateContent?alt=sse&key=${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: a.system }] },
      contents: [{ role: "user", parts: [{ text: a.prompt }] }],
      generationConfig: {
        temperature: a.temperature,
        maxOutputTokens: a.maxTokens ?? 1024,
      },
    }),
    signal: a.signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  for await (const data of sse(res.body)) {
    try {
      const j = JSON.parse(data);
      const parts = j?.candidates?.[0]?.content?.parts;
      if (Array.isArray(parts)) {
        for (const p of parts) if (p?.text) yield p.text as string;
      }
    } catch {
      /* ignore */
    }
  }
}

/* -------------------- Anthropic (official SDK) -------------------- */

async function* streamAnthropic(a: GenArgs): AsyncGenerator<string> {
  const key = keyFor("anthropic");
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic({ apiKey: key });
  // Newer Claude models reject top-level temperature, so we omit it and let the
  // model default. Any difference between responses comes from the model choice.
  const stream = client.messages.stream(
    {
      model: a.modelId,
      max_tokens: a.maxTokens ?? 1024,
      system: a.system,
      messages: [{ role: "user", content: a.prompt }],
    },
    { signal: a.signal },
  );
  for await (const ev of stream) {
    if (
      ev.type === "content_block_delta" &&
      ev.delta.type === "text_delta" &&
      ev.delta.text
    ) {
      yield ev.delta.text;
    }
  }
}

/* -------------------- SSE line parser -------------------- */

// Yields the payload after each "data:" line from a byte stream.
async function* sse(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (line.startsWith("data:")) yield line.slice(5).trim();
    }
  }
}
