import { NextResponse } from "next/server";
import { complete, keyFor, anyKeyPresent } from "@/lib/providers";
import { judgeSystem, judgeUserPrompt, parseVerdict } from "@/lib/prompts";
import { demoVerdict } from "@/lib/demo";
import { MODELS, type ProviderId } from "@/lib/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  prompt: string;
  answerA: string;
  answerB: string;
  judge?: { provider: ProviderId; modelId: string };
};

// Picks a live judge model: caller's choice if its key is present, else the
// first live model in the catalog.
function resolveJudge(body: Body): { provider: ProviderId; modelId: string } | null {
  if (body.judge && keyFor(body.judge.provider)) return body.judge;
  const live = MODELS.find((m) => keyFor(m.provider));
  return live ? { provider: live.provider, modelId: live.id } : null;
}

export async function POST(req: Request) {
  const body = (await req.json()) as Body;

  if (!anyKeyPresent()) {
    return NextResponse.json(demoVerdict(body.prompt, body.answerA, body.answerB));
  }

  const judge = resolveJudge(body);
  if (!judge) {
    return NextResponse.json(
      { error: "No judge model available" },
      { status: 400 },
    );
  }

  try {
    const raw = await complete({
      provider: judge.provider,
      modelId: judge.modelId,
      system: judgeSystem(),
      prompt: judgeUserPrompt(body.prompt, body.answerA, body.answerB),
      temperature: 0,
      maxTokens: 700,
    });
    const verdict = parseVerdict(raw, judge.modelId);
    return NextResponse.json(verdict);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "judge failed" },
      { status: 500 },
    );
  }
}
