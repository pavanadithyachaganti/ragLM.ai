"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AssistantTurn,
  DocItem,
  ModelChoice,
  ResponseOption,
  Side,
  Turn,
} from "@/lib/types";
import {
  fetchModelsInfo,
  streamGenerate,
  type ModelsInfo,
} from "@/lib/chatClient";

const EXAMPLES = [
  "Summarize the key points across my documents.",
  "What does this say about pricing?",
  "Explain vector databases to a smart 12-year-old.",
  "Draft a short email based on the attached notes.",
];

let _seq = 0;
const uid = () => `${Date.now()}-${_seq++}`;

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Page() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [info, setInfo] = useState<ModelsInfo | null>(null);
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [compare, setCompare] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [single, setSingle] = useState<ModelChoice | null>(null);
  const [modelA, setModelA] = useState<ModelChoice | null>(null);
  const [modelB, setModelB] = useState<ModelChoice | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // theme init
  useEffect(() => {
    const stored =
      (typeof window !== "undefined" &&
        (localStorage.getItem("judgelab.theme") as "dark" | "light" | null)) ||
      null;
    const t = stored ?? "dark";
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
  }, []);

  const toggleTheme = () => {
    const t = theme === "dark" ? "light" : "dark";
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem("judgelab.theme", t);
    } catch {}
  };

  // models
  useEffect(() => {
    fetchModelsInfo().then((i) => {
      setInfo(i);
      const cat = i.catalog;
      const live = cat.filter((m) => i.providers[m.provider]);
      const pool = live.length >= 1 ? live : cat;
      const a = pool[0];
      const b = pool.find((m) => m.id !== a?.id) ?? pool[1] ?? a;
      if (a) {
        setSingle({ modelId: a.id, provider: a.provider as any });
        setModelA({ modelId: a.id, provider: a.provider as any });
      }
      if (b) setModelB({ modelId: b.id, provider: b.provider as any });
    });
  }, []);

  // autoscroll
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, busy]);

  const labelOf = useCallback(
    (c: ModelChoice | null) =>
      (c && info?.catalog.find((m) => m.id === c.modelId)?.label) ??
      c?.modelId ??
      "model",
    [info],
  );

  const updateOption = useCallback(
    (turnId: string, idx: 0 | 1, fn: (o: ResponseOption) => ResponseOption) => {
      setTurns((prev) =>
        prev.map((t) => {
          if (t.id !== turnId || t.role !== "assistant") return t;
          const opts = t.options.map((o, i) => (i === idx ? fn(o) : o)) as [
            ResponseOption,
            ResponseOption,
          ];
          return { ...t, options: opts };
        }),
      );
    },
    [],
  );

  const send = useCallback(
    (text?: string) => {
      const q = (text ?? input).trim();
      if (!q || busy) return;
      const c0 = compare ? modelA : single;
      const c1 = compare ? modelB : single;
      if (!c0 || !c1) return;

      const aId = uid();
      const labels = compare
        ? [labelOf(modelA), labelOf(modelB)]
        : ["Response 1", "Response 2"];
      const mk = (choice: ModelChoice, label: string): ResponseOption => ({
        choice,
        label,
        text: "",
        status: "thinking",
      });
      const aTurn: AssistantTurn = {
        id: aId,
        role: "assistant",
        prompt: q,
        compare,
        picked: null,
        options: [mk(c0, labels[0]), mk(c1, labels[1])],
      };
      setTurns((prev) => [...prev, { id: uid(), role: "user", text: q }, aTurn]);
      setInput("");

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setBusy(true);
      const started = performance.now();
      const done = [false, false];
      const finish = (i: number) => {
        done[i] = true;
        if (done[0] && done[1]) setBusy(false);
      };
      const choices: [ModelChoice, ModelChoice] = [c0, c1];
      ([0, 1] as const).forEach((i) => {
        streamGenerate(choices[i], q, i === 0 ? "A" : "B", ac.signal, {
          onFirstToken: () =>
            updateOption(aId, i, (o) => ({
              ...o,
              status: "streaming",
              firstTokenMs: Math.round(performance.now() - started),
            })),
          onToken: (t) => updateOption(aId, i, (o) => ({ ...o, text: o.text + t })),
          onDone: () => {
            updateOption(aId, i, (o) =>
              o.status === "error"
                ? o
                : { ...o, status: "done", ms: Math.round(performance.now() - started) },
            );
            finish(i);
          },
          onError: (m) => {
            updateOption(aId, i, (o) => ({ ...o, status: "error", error: m }));
            finish(i);
          },
        });
      });
    },
    [input, busy, compare, modelA, modelB, single, labelOf, updateOption],
  );

  const pick = useCallback((turnId: string, idx: 0 | 1) => {
    setTurns((prev) =>
      prev.map((t) =>
        t.id === turnId && t.role === "assistant" ? { ...t, picked: idx } : t,
      ),
    );
  }, []);

  // documents (interface only — files are listed, not uploaded/processed)
  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const items: DocItem[] = Array.from(files).map((f) => ({
      id: uid(),
      name: f.name,
      size: f.size,
    }));
    setDocs((prev) => [...prev, ...items]);
  };
  const removeDoc = (id: string) => setDocs((prev) => prev.filter((d) => d.id !== id));

  const empty = turns.length === 0;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* backdrop for mobile sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar
        open={sidebarOpen}
        docs={docs}
        onAdd={addFiles}
        onRemove={removeDoc}
        info={info}
        compare={compare}
        setCompare={setCompare}
        single={single}
        setSingle={setSingle}
        modelA={modelA}
        setModelA={setModelA}
        modelB={modelB}
        setModelB={setModelB}
        busy={busy}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <Header
          theme={theme}
          onToggleTheme={toggleTheme}
          demo={info?.demo ?? true}
          onMenu={() => setSidebarOpen(true)}
        />

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-6">
            {empty ? (
              <EmptyState docsCount={docs.length} onExample={(e) => setInput(e)} />
            ) : (
              <div className="space-y-6">
                {turns.map((t) =>
                  t.role === "user" ? (
                    <UserBubble key={t.id} text={t.text} />
                  ) : (
                    <AssistantBlock
                      key={t.id}
                      turn={t}
                      onPick={pick}
                      labelOf={labelOf}
                    />
                  ),
                )}
              </div>
            )}
          </div>
        </div>

        <Composer
          input={input}
          setInput={setInput}
          onSend={() => send()}
          busy={busy}
          compare={compare}
          docsCount={docs.length}
          canSend={!!(compare ? modelA && modelB : single)}
        />
      </main>
    </div>
  );
}

/* ==================== header ==================== */

function Header({
  theme,
  onToggleTheme,
  demo,
  onMenu,
}: {
  theme: "dark" | "light";
  onToggleTheme: () => void;
  demo: boolean;
  onMenu: () => void;
}) {
  return (
    <header className="flex items-center justify-between border-b border-line px-4 py-3">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenu}
          aria-label="Open documents"
          className="rounded-md border border-line px-2 py-1 font-mono text-[12px] text-muted hover:text-fg md:hidden"
        >
          ☰
        </button>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent2 text-[13px] text-[#05130d] shadow-sm">
            ✳
          </span>
          <span className="text-[15px] font-semibold tracking-[-0.01em]">
            rag
            <span className="bg-gradient-to-r from-accent to-accent2 bg-clip-text text-transparent">
              LM
            </span>
            <span className="font-normal text-faint">.ai</span>
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 font-mono text-[11px]">
        {demo && (
          <span
            className="rounded border border-warn/40 px-1.5 py-0.5 text-warn"
            title="No provider key set — responses are sample text"
          >
            Demo
          </span>
        )}
        <button
          onClick={onToggleTheme}
          aria-label="Toggle light/dark theme"
          className="rounded-md border border-line px-2.5 py-1 text-muted transition-colors hover:border-line2 hover:text-fg"
        >
          {theme === "dark" ? "☾ dark" : "☀ light"}
        </button>
      </div>
    </header>
  );
}

/* ==================== sidebar ==================== */

function Sidebar(props: {
  open: boolean;
  docs: DocItem[];
  onAdd: (f: FileList | null) => void;
  onRemove: (id: string) => void;
  info: ModelsInfo | null;
  compare: boolean;
  setCompare: (b: boolean) => void;
  single: ModelChoice | null;
  setSingle: (c: ModelChoice) => void;
  modelA: ModelChoice | null;
  setModelA: (c: ModelChoice) => void;
  modelB: ModelChoice | null;
  setModelB: (c: ModelChoice) => void;
  busy: boolean;
}) {
  const {
    open,
    docs,
    onAdd,
    onRemove,
    info,
    compare,
    setCompare,
    single,
    setSingle,
    modelA,
    setModelA,
    modelB,
    setModelB,
    busy,
  } = props;
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [drag, setDrag] = useState(false);

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-line bg-panel transition-transform md:static md:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      {/* documents */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.09em] text-faint">
          documents
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            onAdd(e.dataTransfer.files);
          }}
          className={`rounded-lg border border-dashed px-3 py-4 text-center transition-colors ${
            drag ? "border-accent bg-accent/5" : "border-line2"
          }`}
        >
          <div className="text-[12.5px] text-muted">Drop files here</div>
          <div className="mt-0.5 font-mono text-[10.5px] text-faint">
            pdf · txt · md · docx
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            className="mt-2 rounded-md border border-line px-2.5 py-1 font-mono text-[11.5px] text-fg hover:border-accent hover:text-accent"
          >
            + add documents
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => onAdd(e.target.files)}
          />
        </div>

        <div className="mt-3 space-y-1.5">
          {docs.length === 0 ? (
            <p className="px-1 text-[12px] leading-relaxed text-faint">
              No documents yet. Add a few to ground answers in your own content.
            </p>
          ) : (
            docs.map((d) => (
              <div
                key={d.id}
                className="group flex items-center justify-between gap-2 rounded-md border border-line bg-panel2 px-2.5 py-1.5"
              >
                <div className="min-w-0">
                  <div className="truncate text-[12.5px] text-fg">{d.name}</div>
                  <div className="font-mono text-[10px] text-faint">{fmtSize(d.size)}</div>
                </div>
                <button
                  onClick={() => onRemove(d.id)}
                  aria-label={`Remove ${d.name}`}
                  className="shrink-0 font-mono text-[12px] text-faint opacity-0 transition-opacity hover:text-bad group-hover:opacity-100"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* response settings */}
      <div className="border-t border-line p-4">
        <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.09em] text-faint">
          responses
        </div>
        <p className="mb-3 text-[12px] leading-relaxed text-muted">
          Every answer gives you two options to choose from.
        </p>

        <button
          onClick={() => setCompare(!compare)}
          disabled={busy}
          className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 transition-colors disabled:opacity-50 ${
            compare
              ? "border-accent2/50 bg-accent2/10 text-accent2"
              : "border-line text-muted hover:border-line2 hover:text-fg"
          }`}
        >
          <span className="text-[12.5px]">Compare two models</span>
          <span
            className={`relative h-4 w-7 rounded-full transition-colors ${
              compare ? "bg-accent2" : "bg-line2"
            }`}
          >
            <span
              className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${
                compare ? "left-3.5" : "left-0.5"
              }`}
            />
          </span>
        </button>

        <div className="mt-3 space-y-2">
          {!compare ? (
            <ModelSelect
              label="Model"
              info={info}
              value={single}
              onChange={setSingle}
              disabled={busy}
            />
          ) : (
            <>
              <ModelSelect
                label="Model 1"
                info={info}
                value={modelA}
                onChange={setModelA}
                disabled={busy}
                accent="accent2"
              />
              <ModelSelect
                label="Model 2"
                info={info}
                value={modelB}
                onChange={setModelB}
                disabled={busy}
                accent="accent"
              />
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

function ModelSelect({
  label,
  info,
  value,
  onChange,
  disabled,
  accent,
}: {
  label: string;
  info: ModelsInfo | null;
  value: ModelChoice | null;
  onChange: (c: ModelChoice) => void;
  disabled: boolean;
  accent?: "accent" | "accent2";
}) {
  const cat = info?.catalog ?? [];
  const providers = info?.providers ?? {};
  const dot =
    accent === "accent2" ? "bg-accent2" : accent === "accent" ? "bg-accent" : "bg-faint";
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-wider text-faint">
        <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
        {label}
      </span>
      <select
        aria-label={label}
        disabled={disabled}
        value={value?.modelId ?? ""}
        onChange={(e) => {
          const m = cat.find((x) => x.id === e.target.value);
          if (m) onChange({ modelId: m.id, provider: m.provider as any });
        }}
        className="w-full cursor-pointer rounded-md border border-line bg-panel2 px-2 py-1.5 font-mono text-[12px] text-fg outline-none focus:border-line2 disabled:cursor-default"
      >
        {["groq", "gemini", "anthropic"].map((p) => {
          const items = cat.filter((m) => m.provider === p);
          if (items.length === 0) return null;
          const live = providers[p];
          return (
            <optgroup key={p} label={`${p}${live ? "" : " (demo)"}`}>
              {items.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
    </label>
  );
}

/* ==================== empty state ==================== */

function EmptyState({
  docsCount,
  onExample,
}: {
  docsCount: number;
  onExample: (e: string) => void;
}) {
  return (
    <div className="animate-rise mx-auto mt-[8vh] max-w-xl text-center">
      <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-panel2 font-mono text-[15px] text-accent">
        ✳
      </div>
      <h1 className="text-[22px] font-medium tracking-[-0.01em]">
        Ask anything about your documents
      </h1>
      <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-muted">
        {docsCount > 0
          ? `${docsCount} document${docsCount > 1 ? "s" : ""} ready. Ask a question and choose the response you like best.`
          : "Add documents on the left, then ask a question."}
      </p>
      <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {EXAMPLES.map((e) => (
          <button
            key={e}
            onClick={() => onExample(e)}
            className="rounded-lg border border-line bg-panel px-3.5 py-2.5 text-left text-[13px] text-muted transition-all hover:border-accent/50 hover:bg-panel2 hover:text-fg"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ==================== chat turns ==================== */

function UserBubble({ text }: { text: string }) {
  return (
    <div className="animate-rise flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm border border-line bg-panel2 px-3.5 py-2.5 text-[14.5px] leading-relaxed">
        {text}
      </div>
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[13px]">
      <span className="shimmer">Thinking</span>
      <span className="inline-flex items-center gap-1 text-faint">
        <span className="dot inline-block h-1 w-1 rounded-full bg-current" />
        <span className="dot inline-block h-1 w-1 rounded-full bg-current" />
        <span className="dot inline-block h-1 w-1 rounded-full bg-current" />
      </span>
    </span>
  );
}

function Avatar() {
  return (
    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-line bg-panel2 font-mono text-[11px] text-accent">
      ✳
    </div>
  );
}

function AssistantBlock({
  turn,
  onPick,
  labelOf,
}: {
  turn: AssistantTurn;
  onPick: (turnId: string, idx: 0 | 1) => void;
  labelOf: (c: ModelChoice | null) => string;
}) {
  // once picked, show only the chosen response as a normal assistant message
  if (turn.picked !== null) {
    const opt = turn.options[turn.picked];
    return (
      <div className="animate-rise flex gap-3">
        <Avatar />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2 font-mono text-[10.5px] text-faint">
            <span className="rounded border border-accent/40 px-1.5 py-0.5 text-accent">
              ✓ preferred
            </span>
            <span>
              you chose {turn.compare ? opt.label : `option ${turn.picked + 1}`} of 2
            </span>
          </div>
          <div className="whitespace-pre-wrap text-[14.5px] leading-[1.7]">{opt.text}</div>
        </div>
      </div>
    );
  }

  const bothSettled = turn.options.every(
    (o) => o.status === "done" || o.status === "error",
  );

  return (
    <div className="animate-rise flex gap-3">
      <Avatar />
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-center gap-2 font-mono text-[11px] text-faint">
          <span>
            {turn.compare
              ? "Two models answered — keep the one you prefer"
              : "Here are two options — keep the one you prefer"}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {turn.options.map((opt, i) => (
            <OptionCard
              key={i}
              opt={opt}
              index={i as 0 | 1}
              compare={turn.compare}
              canPick={bothSettled && opt.status !== "error"}
              onPick={() => onPick(turn.id, i as 0 | 1)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function OptionCard({
  opt,
  index,
  compare,
  canPick,
  onPick,
}: {
  opt: ResponseOption;
  index: 0 | 1;
  compare: boolean;
  canPick: boolean;
  onPick: () => void;
}) {
  const accent = index === 0 ? "accent2" : "accent";
  const dot = index === 0 ? "bg-accent2" : "bg-accent";
  const tokps = opt.ms && opt.text ? (opt.text.length / 4 / (opt.ms / 1000)).toFixed(0) : null;

  return (
    <div className="flex flex-col rounded-xl border border-line bg-panel p-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
          <span className="font-mono text-[12px] text-fg">
            {compare ? opt.label : `Option ${index + 1}`}
          </span>
        </div>
        {opt.status === "streaming" && (
          <span className="font-mono text-[10px] text-accent">writing…</span>
        )}
      </div>

      <div className="mt-2.5 min-h-[64px] flex-1 whitespace-pre-wrap text-[14px] leading-[1.7]">
        {opt.status === "error" ? (
          <span className="text-[13px] text-bad">{opt.error}</span>
        ) : opt.status === "thinking" ? (
          <ThinkingIndicator />
        ) : (
          <>
            {opt.text}
            {opt.status === "streaming" && (
              <span className="caret ml-0.5 inline-block h-[15px] w-[6px] translate-y-[2px] bg-accent" />
            )}
          </>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2.5">
        <span className="font-mono text-[10px] text-faint">
          {opt.ms != null ? `${(opt.ms / 1000).toFixed(1)}s` : ""}
          {tokps ? ` · ~${tokps} tok/s` : ""}
        </span>
        <button
          onClick={onPick}
          disabled={!canPick}
          className={`rounded-md border px-3 py-1.5 font-mono text-[11.5px] transition-colors disabled:opacity-40 ${
            accent === "accent2"
              ? "border-accent2/50 text-accent2 hover:bg-accent2/10"
              : "border-accent/50 text-accent hover:bg-accent/10"
          }`}
        >
          use this response
        </button>
      </div>
    </div>
  );
}

/* ==================== composer ==================== */

function Composer({
  input,
  setInput,
  onSend,
  busy,
  compare,
  docsCount,
  canSend,
}: {
  input: string;
  setInput: (s: string) => void;
  onSend: () => void;
  busy: boolean;
  compare: boolean;
  docsCount: number;
  canSend: boolean;
}) {
  return (
    <div className="border-t border-line px-4 py-3">
      <div className="mx-auto w-full max-w-3xl">
        <div className="rounded-2xl border border-line bg-panel p-2.5">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="Ask a question about your documents…"
            rows={1}
            className="max-h-40 w-full resize-none bg-transparent px-1.5 py-1 text-[15px] leading-relaxed outline-none placeholder:text-faint"
          />
          <div className="mt-1 flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2 font-mono text-[10.5px] text-faint">
              {docsCount > 0 && (
                <span className="rounded border border-line px-1.5 py-0.5">
                  {docsCount} doc{docsCount > 1 ? "s" : ""} in context
                </span>
              )}
              {compare && (
                <span className="rounded border border-accent2/40 px-1.5 py-0.5 text-accent2">
                  comparing two models
                </span>
              )}
            </div>
            <button
              onClick={onSend}
              disabled={busy || !input.trim() || !canSend}
              className="rounded-lg bg-accent px-4 py-1.5 text-[13px] font-medium text-[#05130d] transition-opacity disabled:opacity-40"
            >
              {busy ? "…" : "Send"}
            </button>
          </div>
        </div>
        <p className="mt-1.5 text-center font-mono text-[10px] text-faint">
          enter to send · shift+enter for a new line
        </p>
      </div>
    </div>
  );
}
