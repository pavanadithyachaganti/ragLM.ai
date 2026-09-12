// Deterministic, offline stand-ins used when no provider keys are configured.
// Purely for previewing the interface. Responses are canned, not real model output.
import type { JudgeScores, JudgeVerdict, Side } from "./types";

function firstLine(prompt: string): string {
  const t = prompt.trim().replace(/\s+/g, " ");
  return t.length > 90 ? t.slice(0, 90) + "…" : t;
}

// Two intentionally different styles so the two response options feel distinct.
export function demoAnswer(side: Side, prompt: string): string {
  const topic = firstLine(prompt);
  if (side === "A") {
    return (
      `Here's a focused take on "${topic}".\n\n` +
      `The short answer is that it comes down to a few clear points:\n\n` +
      `1. Start with what you're really asking, then answer it directly.\n` +
      `2. Ground it in one concrete example so the idea sticks.\n` +
      `3. Flag the single caveat that actually matters, and stop there.\n\n` +
      `This response stays tight and avoids padding. (demo mode — sample text)`
    );
  }
  return (
    `Good question about "${topic}". Let me walk through it a bit more fully.\n\n` +
    `There are a few angles worth considering. First, the broader context helps ` +
    `frame everything that follows. Second, a useful rule of thumb is to look at ` +
    `the trade-offs before committing to one approach. Third, there are some ` +
    `edge cases that are worth keeping in mind as you go deeper.\n\n` +
    `In short, it's a richer topic than it first appears, and a longer look pays ` +
    `off. (demo mode — sample text)`
  );
}

// Retained for the /api/judge route (not used by the current chat UI).
export function demoVerdict(prompt: string, a: string, b: string): JudgeVerdict {
  const scoresA: JudgeScores = { helpfulness: 8, correctness: 9, clarity: 9, depth: 6 };
  const scoresB: JudgeScores = { helpfulness: 8, correctness: 5, clarity: 7, depth: 8 };
  return {
    winner: "A",
    confidence: 0.62,
    scoresA,
    scoresB,
    reasoning: "Demo verdict.",
    judgeModel: "demo-judge",
  };
}
