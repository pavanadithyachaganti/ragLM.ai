// Shared, secret-free catalog of providers and models.
// Safe to import from both client and server. No API keys live here.

export type ProviderId = "groq" | "gemini" | "anthropic";

export type ProviderMeta = {
  id: ProviderId;
  label: string;
  // the env var that must be present (server-side) for this provider to be live
  envVar: string;
  // short line shown in the setup drawer
  hint: string;
};

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  groq: {
    id: "groq",
    label: "Groq",
    envVar: "GROQ_API_KEY",
    hint: "console.groq.com/keys — fast open models (Llama, etc.)",
  },
  gemini: {
    id: "gemini",
    label: "Gemini",
    envVar: "GEMINI_API_KEY",
    hint: "aistudio.google.com/apikey — Google Gemini models",
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    envVar: "ANTHROPIC_API_KEY",
    hint: "console.anthropic.com/settings/keys — Claude models",
  },
};

export type ModelSpec = {
  id: string; // the exact model id sent to the provider
  provider: ProviderId;
  label: string; // short display name
  blurb: string; // one line for the picker
};

// Central catalog. Model ids drift over time; edit here in one place.
export const MODELS: ModelSpec[] = [
  // Groq (OpenAI-compatible endpoint)
  {
    id: "llama-3.3-70b-versatile",
    provider: "groq",
    label: "Llama 3.3 70B",
    blurb: "Strong all-round open model, very fast on Groq",
  },
  {
    id: "llama-3.1-8b-instant",
    provider: "groq",
    label: "Llama 3.1 8B",
    blurb: "Tiny and instant — a useful underdog",
  },
  {
    id: "openai/gpt-oss-120b",
    provider: "groq",
    label: "GPT-OSS 120B",
    blurb: "Large open-weight model served on Groq",
  },
  // Gemini
  {
    id: "gemini-2.0-flash",
    provider: "gemini",
    label: "Gemini 2.0 Flash",
    blurb: "Fast, capable, generous free tier",
  },
  {
    id: "gemini-1.5-pro",
    provider: "gemini",
    label: "Gemini 1.5 Pro",
    blurb: "Higher-quality reasoning, slower",
  },
  // Anthropic
  {
    id: "claude-sonnet-5",
    provider: "anthropic",
    label: "Claude Sonnet 5",
    blurb: "Balanced quality and speed",
  },
  {
    id: "claude-haiku-4-5",
    provider: "anthropic",
    label: "Claude Haiku 4.5",
    blurb: "Fastest Claude, lightweight",
  },
];

export function modelById(id: string): ModelSpec | undefined {
  return MODELS.find((m) => m.id === id);
}

export function modelsForProvider(p: ProviderId): ModelSpec[] {
  return MODELS.filter((m) => m.provider === p);
}
