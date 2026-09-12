import type { ProviderId } from "./catalog";

// A model picked from the catalog, with its provider.
export type ModelChoice = {
  modelId: string;
  provider: ProviderId;
};

// "A"/"B" identify the two response slots for one question.
export type Side = "A" | "B";

/* -------------------- judge (used by /api/judge only) -------------------- */

export type JudgeScores = {
  helpfulness: number;
  correctness: number;
  clarity: number;
  depth: number;
};

export type JudgeVerdict = {
  winner: Side | "tie";
  confidence: number; // 0..1
  scoresA: JudgeScores;
  scoresB: JudgeScores;
  reasoning: string;
  judgeModel: string;
};

/* -------------------- chat types -------------------- */

export type DocItem = { id: string; name: string; size: number };

export type OptStatus = "thinking" | "streaming" | "done" | "error";

// One of the two response options offered for an assistant turn.
export type ResponseOption = {
  choice: ModelChoice;
  label: string; // "Response 1" / "Response 2", or a model label in compare mode
  text: string;
  status: OptStatus;
  error?: string;
  ms?: number;
  firstTokenMs?: number;
};

export type UserTurn = { id: string; role: "user"; text: string };

export type AssistantTurn = {
  id: string;
  role: "assistant";
  prompt: string;
  compare: boolean; // true when the two options come from two different models
  options: [ResponseOption, ResponseOption];
  picked: 0 | 1 | null;
};

export type Turn = UserTurn | AssistantTurn;
