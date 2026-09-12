import { streamCompletion, keyFor } from "@/lib/providers";
import { CHAT_SYSTEM } from "@/lib/prompts";
import { demoAnswer } from "@/lib/demo";
import type { ProviderId } from "@/lib/catalog";
import type { Side } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  provider: ProviderId;
  modelId: string;
  prompt: string;
  side: Side;
  temperature?: number;
};

// Streams newline-delimited JSON events: {t:"tok",d} | {t:"done"} | {t:"err",m}
export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const { provider, modelId, prompt, side } = body;
  const temperature = typeof body.temperature === "number" ? body.temperature : 0.7;

  const enc = new TextEncoder();
  const useDemo = !keyFor(provider);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
      try {
        if (useDemo) {
          // Simulate streaming so the interface feels alive without keys.
          const words = demoAnswer(side, prompt).split(/(\s+)/);
          for (const w of words) {
            send({ t: "tok", d: w });
            await new Promise((r) => setTimeout(r, side === "A" ? 18 : 12));
          }
          send({ t: "done", demo: true });
        } else {
          for await (const delta of streamCompletion({
            provider,
            modelId,
            system: CHAT_SYSTEM,
            prompt,
            temperature,
            signal: req.signal,
          })) {
            send({ t: "tok", d: delta });
          }
          send({ t: "done" });
        }
      } catch (e: any) {
        send({ t: "err", m: e?.message ?? "generation failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
    },
  });
}
