import type { JudgeScores, JudgeVerdict, Side } from "./types";

// System prompt for the chat assistant. Kept identical across responses so any
// difference between two options is about the model, not a hand-tuned persona.
export const CHAT_SYSTEM =
  "You are a helpful assistant that answers questions, optionally grounded in " +
  "the user's uploaded documents. Answer directly and well: be accurate, be " +
  "clear, and match the depth the question deserves.";

// The judge is told which answer is A and which is B, but NOT which model
// produced them, to keep the verdict about substance.
export function judgeSystem(): string {
  return [
    "You are an impartial evaluator scoring two answers (A and B) to the same prompt.",
    "You do not know which model wrote which answer. Judge only the content.",
    "Score each answer 0-10 on four axes:",
    "- helpfulness: does it actually address what was asked?",
    "- correctness: is it factually accurate and free of made-up claims?",
    "- clarity: is it well-organized and easy to follow?",
    "- depth: is the level of detail appropriate (not too thin, not padded)?",
    "Then pick a winner. Use \"tie\" only when they are genuinely indistinguishable.",
    "Reward substance over length. Penalize confident-but-wrong claims heavily.",
    "",
    "Respond with ONLY a JSON object, no markdown fence, in exactly this shape:",
    '{"winner":"A"|"B"|"tie","confidence":0.0-1.0,',
    '"scoresA":{"helpfulness":n,"correctness":n,"clarity":n,"depth":n},',
    '"scoresB":{"helpfulness":n,"correctness":n,"clarity":n,"depth":n},',
    '"reasoning":"2-4 sentences on what decided it"}',
  ].join("\n");
}

export function judgeUserPrompt(prompt: string, answerA: string, answerB: string): string {
  return [
    "PROMPT:",
    prompt,
    "",
    "ANSWER A:",
    answerA || "(empty)",
    "",
    "ANSWER B:",
    answerB || "(empty)",
    "",
    "Return the JSON verdict now.",
  ].join("\n");
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
function clampScore(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!isFinite(v)) return 0;
  return Math.max(0, Math.min(10, v));
}
function coerceScores(o: any): JudgeScores {
  return {
    helpfulness: clampScore(o?.helpfulness),
    correctness: clampScore(o?.correctness),
    clarity: clampScore(o?.clarity),
    depth: clampScore(o?.depth),
  };
}

// Pull a JSON object out of a possibly-noisy judge response and validate it.
export function parseVerdict(raw: string, judgeModel: string): JudgeVerdict {
  let jsonText = raw.trim();
  // strip ```json fences if present
  const fence = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) jsonText = fence[1].trim();
  // otherwise grab the first {...} span
  if (!jsonText.startsWith("{")) {
    const s = jsonText.indexOf("{");
    const e = jsonText.lastIndexOf("}");
    if (s !== -1 && e !== -1) jsonText = jsonText.slice(s, e + 1);
  }
  const o = JSON.parse(jsonText);
  const winner: Side | "tie" =
    o?.winner === "A" || o?.winner === "B" ? o.winner : "tie";
  return {
    winner,
    confidence: clamp01(typeof o?.confidence === "number" ? o.confidence : 0.5),
    scoresA: coerceScores(o?.scoresA),
    scoresB: coerceScores(o?.scoresB),
    reasoning: typeof o?.reasoning === "string" ? o.reasoning : "",
    judgeModel,
  };
}

export function sumScores(s: JudgeScores): number {
  return s.helpfulness + s.correctness + s.clarity + s.depth;
}
