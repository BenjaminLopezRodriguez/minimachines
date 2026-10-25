"use client";

/**
 * The project whiteboard: sticky-note cards in five columns, living in the
 * project's Yjs room (map "board") beside its files. Cards in "Ready" are
 * picked up by agents running `mm board work`; their progress streams onto the
 * card. Moving a card to "Live" asks a runner with --deploy to ship it.
 */
import { ArrowLeft, ArrowRight, Bot, ExternalLink, Plus, Rocket, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import * as Y from "yjs";

const COLUMNS = [
  { id: "ideas", label: "Ideas", hint: "Anything. Nobody acts on these yet." },
  { id: "ready", label: "Ready for agents", hint: "An agent picks up the oldest card here." },
  { id: "working", label: "Agent working", hint: "Progress streams onto the card." },
  { id: "review", label: "Review", hint: "Check the change, then move it to Live." },
  { id: "live", label: "Live", hint: "A runner started with --deploy ships it." },
] as const;
type Column = (typeof COLUMNS)[number]["id"];

type Card = {
  id: string;
  title: string;
  details: string;
  column: Column;
  order: number;
  createdBy: string;
  claimedBy?: string;
  agent?: string;
  log?: string;
  result?: string;
  deployUrl?: string;
  deployedAt?: number;
};

// Soft note colors per column; text stays the app's foreground for contrast.
const NOTE: Record<Column, string> = {
  ideas: "var(--card)",
  ready: "var(--signal-soft)",
  working: "var(--warning-soft)",
  review: "var(--accent)",
  live: "var(--success-soft)",
};

export function Board({ doc, readOnly, me, agents }: { doc: Y.Doc; readOnly: boolean; me: string; agents: { id: number; name: string; color: string }[] }) {
  const cardsMap = doc.getMap<Y.Map<unknown>>("board");
  const [cards, setCards] = useState<Card[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setCards([...cardsMap.values()].map((m) => m.toJSON() as Card).sort((a, b) => a.order - b.order));
    update();
    cardsMap.observeDeep(update);
    return () => cardsMap.unobserveDeep(update);
  }, [cardsMap]);

  const set = (id: string, fields: Partial<Card>) =>
    doc.transact(() => {
      const m = cardsMap.get(id);
      if (m) for (const [k, v] of Object.entries(fields)) v === undefined ? m.delete(k) : m.set(k, v);
    });
  const move = (id: string, column: Column) => set(id, { column, order: Date.now(), ...(column !== "working" ? { claimedBy: undefined } : {}) });
  const add = (column: Column) => {
    const title = draft[column]?.trim();
    if (!title) return;
    const id = crypto.randomUUID().slice(0, 8);
    const m = new Y.Map<unknown>();
    doc.transact(() => {
      cardsMap.set(id, m);
      for (const [k, v] of Object.entries({ id, title, details: "", column, order: Date.now(), createdBy: me, createdAt: Date.now() })) m.set(k, v);
    });
    setDraft((d) => ({ ...d, [column]: "" }));
  };

  const open = cards.find((c) => c.id === openId);
  const btn = "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-30";

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-9 shrink-0 items-center gap-3 border-b px-3 text-xs text-muted-foreground">
          <span>Cards in <strong className="font-medium text-foreground">Ready</strong> go to agents. Start one in a synced folder with <code className="rounded bg-[var(--hover)] px-1 font-mono">mm board work</code>.</span>
          <span className="ml-auto flex items-center gap-1.5" aria-label={`${agents.length} agents online`}>
            <Bot className="size-3.5" aria-hidden />
            {agents.length ? agents.map((a) => <span key={a.id} className="rounded-full border px-2 py-0.5" style={{ borderColor: a.color }}>{a.name}</span>) : "no agents online"}
          </span>
        </div>
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3">
          {COLUMNS.map((col, ci) => {
            const here = cards.filter((c) => c.column === col.id);
            return (
              <section
                key={col.id}
                aria-label={col.label}
                className={`flex w-64 shrink-0 flex-col rounded-lg border bg-[var(--surface)] ${dragging ? "outline-dashed outline-1 outline-[var(--border)]" : ""}`}
                onDragOver={(e) => !readOnly && e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/card");
                  if (id && !readOnly) move(id, col.id);
                  setDragging(null);
                }}
              >
                <header className="px-3 pb-1 pt-2.5">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    {col.label}
                    <span className="font-normal text-muted-foreground">{here.length}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{col.hint}</p>
                </header>
                <ol className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
                  {here.map((c) => (
                    <li
                      key={c.id}
                      draggable={!readOnly}
                      onDragStart={(e) => (e.dataTransfer.setData("text/card", c.id), setDragging(c.id))}
                      onDragEnd={() => setDragging(null)}
                      className={`group rounded-md border p-2.5 shadow-sm ${openId === c.id ? "ring-2 ring-[var(--ring)]" : ""}`}
                      style={{ background: NOTE[c.column] }}
                    >
                      <button type="button" onClick={() => setOpenId(c.id)} className="w-full text-left text-[13px] leading-snug focus-visible:outline-none">
                        {c.title}
                      </button>
                      {(c.agent || c.deployUrl || c.result) && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                          {c.column === "working" && c.agent && (
                            <span className="inline-flex items-center gap-1">
                              <span className="size-1.5 animate-pulse rounded-full bg-[var(--warning)] motion-reduce:animate-none" aria-hidden />
                              {c.agent} working
                            </span>
                          )}
                          {c.column !== "working" && c.result?.startsWith("Failed") && <span className="text-[var(--destructive)]">failed</span>}
                          {c.deployUrl && (
                            <a href={c.deployUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[var(--signal)] underline-offset-2 hover:underline">
                              <Rocket className="size-3" aria-hidden /> live
                            </a>
                          )}
                        </div>
                      )}
                      {!readOnly && (
                        <div className="mt-1 flex justify-end gap-0.5 opacity-60 group-focus-within:opacity-100 group-hover:opacity-100">
                          <button type="button" className={btn} disabled={ci === 0} onClick={() => move(c.id, COLUMNS[ci - 1]!.id)} aria-label={`Move "${c.title}" left`}>
                            <ArrowLeft className="size-3.5" />
                          </button>
                          <button type="button" className={btn} disabled={ci === COLUMNS.length - 1} onClick={() => move(c.id, COLUMNS[ci + 1]!.id)} aria-label={`Move "${c.title}" right`}>
                            <ArrowRight className="size-3.5" />
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
                {!readOnly && (col.id === "ideas" || col.id === "ready") && (
                  <form className="flex items-center gap-1 border-t p-2" onSubmit={(e) => (e.preventDefault(), add(col.id))}>
                    <input
                      value={draft[col.id] ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, [col.id]: e.target.value }))}
                      placeholder={col.id === "ready" ? "Task for an agent…" : "Add an idea…"}
                      aria-label={`New card in ${col.label}`}
                      className="min-w-0 flex-1 rounded-md bg-transparent px-2 py-1 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                    />
                    <button type="submit" className={btn} aria-label="Add card">
                      <Plus className="size-4" />
                    </button>
                  </form>
                )}
              </section>
            );
          })}
        </div>
      </div>

      {open && (
        <aside className="flex w-96 shrink-0 flex-col border-l" aria-label="Card">
          <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3 text-xs text-muted-foreground">
            <span className="font-mono">#{open.id}</span>
            <span>· {COLUMNS.find((c) => c.id === open.column)?.label}</span>
            <span className="ml-auto flex">
              {!readOnly && (
                <button type="button" className={btn} aria-label="Delete card" onClick={() => window.confirm(`Delete "${open.title}"?`) && (cardsMap.delete(open.id), setOpenId(null))}>
                  <Trash2 className="size-3.5" />
                </button>
              )}
              <button type="button" className={btn} aria-label="Close" onClick={() => setOpenId(null)}>
                <X className="size-3.5" />
              </button>
            </span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 text-sm">
            <input
              key={`t-${open.id}`}
              defaultValue={open.title}
              readOnly={readOnly}
              onBlur={(e) => e.target.value.trim() && e.target.value !== open.title && set(open.id, { title: e.target.value.trim() })}
              aria-label="Title"
              className="rounded-md bg-transparent px-1 py-0.5 text-base font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            />
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Details for the agent
              <textarea
                key={`d-${open.id}`}
                defaultValue={open.details}
                readOnly={readOnly}
                rows={5}
                onBlur={(e) => e.target.value !== open.details && set(open.id, { details: e.target.value })}
                placeholder="What done looks like, files to touch, constraints…"
                className="rounded-md border bg-transparent p-2 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              />
            </label>
            {!readOnly && open.column === "ideas" && (
              <button type="button" onClick={() => move(open.id, "ready")} className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
                <Bot className="size-4" /> Send to agents
              </button>
            )}
            {!readOnly && open.column === "review" && (
              <button type="button" onClick={() => move(open.id, "live")} className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
                <Rocket className="size-4" /> Approve and deploy
              </button>
            )}
            {open.deployUrl && (
              <a href={open.deployUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[var(--signal)] underline-offset-2 hover:underline">
                <ExternalLink className="size-3.5" /> {open.deployUrl}
              </a>
            )}
            {open.result && (
              <div>
                <div className="mb-1 text-xs text-muted-foreground">Result{open.agent ? ` · ${open.agent}` : ""}</div>
                <p className={`whitespace-pre-wrap text-[13px] ${open.result.startsWith("Failed") || open.result.startsWith("Deploy failed") ? "text-[var(--destructive)]" : ""}`}>{open.result}</p>
              </div>
            )}
            {open.log && (
              <div className="flex min-h-0 flex-col">
                <div className="mb-1 text-xs text-muted-foreground">Agent log</div>
                <pre className="max-h-72 overflow-auto rounded-md bg-[var(--hover)] p-2 font-mono text-[11.5px] leading-relaxed">{open.log}</pre>
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
