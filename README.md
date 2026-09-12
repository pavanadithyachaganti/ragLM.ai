# ragLM.ai

A chat assistant for your documents. Add documents on the left, ask a question,
and every answer comes back as **two response options** so you can keep the one
you prefer. A side option lets the two options come from **two different models**
so you can compare them.

- **Dark / light** theme (remembers your choice).
- **Providers:** Groq, Gemini, Anthropic (Claude) — pick any model per option.
- Runs on localhost; deploys as a Node app (Render).

## Quick start

```bash
npm install
cp .env.local.example .env.local   # add at least one key
npm run dev                        # http://localhost:3000
```

With **no keys**, the app runs in **demo mode** — the full interface works with
sample streamed responses so you can try the UX. Add a key and restart for real
answers.

### Keys (server-side only — the browser never sees them)

| Provider  | Env var             | Get a key                           |
| --------- | ------------------- | ----------------------------------- |
| Groq      | `GROQ_API_KEY`      | console.groq.com/keys               |
| Gemini    | `GEMINI_API_KEY`    | aistudio.google.com/apikey          |
| Anthropic | `ANTHROPIC_API_KEY` | console.anthropic.com/settings/keys |

## How it works

- Ask a question → two responses stream side by side, each with a Claude-style
  "Thinking" shimmer until the first token. Choose one and the other collapses
  away; the chosen one stays, tagged **preferred**.
- Turn on **Compare two models** in the sidebar to have the two options come from
  two different LLMs you select (otherwise both come from one model).
- Documents in the sidebar are interface-only for now — listed, not uploaded or
  indexed. Wiring real retrieval is the natural next step.
- `app/api/generate` streams one response (NDJSON), or sample text if that
  provider has no key. `lib/providers.ts` is the only file that touches keys:
  Anthropic via the official SDK, Groq (OpenAI-compatible) and Gemini via REST.
- `lib/catalog.ts` holds the model list — ids drift, so edit them there.


