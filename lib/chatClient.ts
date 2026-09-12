import type { ModelChoice, Side } from "./types";

type StreamCbs = {
  onToken: (text: string) => void;
  onDone: () => void;
  onError: (msg: string) => void;
  onFirstToken?: () => void;
};

// Calls /api/generate and feeds NDJSON events to the callbacks.
export async function streamGenerate(
  choice: ModelChoice,
  prompt: string,
  side: Side,
  signal: AbortSignal,
  cbs: StreamCbs,
): Promise<void> {
  let sawFirst = false;
  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: choice.provider,
        modelId: choice.modelId,
        prompt,
        side,
      }),
      signal,
    });
    if (!res.ok || !res.body) {
      cbs.onError(`request failed (${res.status})`);
      return;
    }
    const reader = res.body.getReader();
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
        if (!line) continue;
        let ev: any;
        try {
          ev = JSON.parse(line);
        } catch {
          continue;
        }
        if (ev.t === "tok") {
          if (!sawFirst) {
            sawFirst = true;
            cbs.onFirstToken?.();
          }
          cbs.onToken(ev.d as string);
        } else if (ev.t === "done") {
          cbs.onDone();
        } else if (ev.t === "err") {
          cbs.onError(ev.m as string);
        }
      }
    }
    cbs.onDone();
  } catch (e: any) {
    if (e?.name === "AbortError") return;
    cbs.onError(e?.message ?? "stream error");
  }
}

export type ModelsInfo = {
  providers: Record<string, boolean>;
  providerMeta: Record<string, { id: string; label: string; envVar: string; hint: string }>;
  catalog: { id: string; provider: string; label: string; blurb: string }[];
  demo: boolean;
};

export async function fetchModelsInfo(): Promise<ModelsInfo> {
  const res = await fetch("/api/models");
  return (await res.json()) as ModelsInfo;
}
