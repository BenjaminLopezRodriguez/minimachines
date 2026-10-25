"use client";

/**
 * The project whiteboard: a real Excalidraw canvas shared live through the
 * project's Yjs room (map "canvas": element id → element), plus the task
 * cards agents work from (map "board", same as `mm board`).
 *
 * Draw anything. Select shapes and press "Send to agents": their text becomes
 * a Ready card, and those shapes change color as the card moves (ready →
 * working → review → live) and link to the deploy when it ships. Cards made
 * elsewhere (CLI, agents) appear on the canvas as sticky notes.
 * Loaded with ssr:false — Excalidraw needs the browser.
 */
import "@excalidraw/excalidraw/index.css";

import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  Excalidraw,
  newElementWith,
  reconcileElements,
} from "@excalidraw/excalidraw";
import type { ExcalidrawElement, FileId, OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";
import type { AppState, BinaryFiles, Collaborator, DataURL, ExcalidrawImperativeAPI, SocketId } from "@excalidraw/excalidraw/types";
import { Bot, ExternalLink, ListTodo, Rocket, Trash2, X } from "lucide-react";

import { uiKit } from "./ui-kit";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";

type Column = "ideas" | "ready" | "working" | "review" | "live";
const LABEL: Record<Column, string> = { ideas: "Ideas", ready: "Ready for agents", working: "Agent working", review: "Review", live: "Live" };
// Stroke a linked shape takes on as its card moves. Readable on Excalidraw's light and dark canvas.
const STATUS_STROKE: Partial<Record<Column, string>> = { ready: "#3558f5", working: "#f08c00", review: "#9c36b5", live: "#2f9e44" };

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
  elementIds?: string[];
};

const LOCAL = Symbol("canvas-local");
const cardIdOf = (el: ExcalidrawElement) => (el.customData as { cardId?: string } | undefined)?.cardId;

function useSiteTheme(): "light" | "dark" {
  const [theme, setTheme] = useState<"light" | "dark">(() => (document.documentElement.dataset.theme === "dark" ? "dark" : "light"));
  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light"));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return theme;
}

type FileMeta = { sha: string; mimeType: string; created: number };

/**
 * `files` is where images live: `${files}?type=` to upload (POST, raw bytes → { sha }),
 * `${files}/<sha>` to read. Null when the server has no file storage (images stay off).
 */
export function Board({
  doc,
  awareness,
  readOnly,
  me,
  files,
  canvasFirst = false,
}: {
  doc: Y.Doc;
  awareness: Awareness;
  readOnly: boolean;
  me: string;
  files: string | null;
  /** Opened for sketching (e.g. from the TUI): tasks panel tucked away, UI kit library open. */
  canvasFirst?: boolean;
}) {
  const canvas = useMemo(() => doc.getMap<OrderedExcalidrawElement>("canvas"), [doc]);
  // Image bytes are in project file storage (Vercel Blob); the room only records which blob each image is.
  const canvasFiles = useMemo(() => doc.getMap<FileMeta>("canvas-files"), [doc]);
  const fileJobs = useRef(new Set<string>()); // uploads/downloads in flight, so each runs once
  const cardsMap = useMemo(() => doc.getMap<Y.Map<unknown>>("board"), [doc]);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  // Excalidraw loads its initial scene after handing out the API; scene updates before that are overwritten.
  // `ready` flips on its first onChange, and the binding starts then.
  const [ready, setReady] = useState(false);
  const [cards, setCards] = useState<Card[]>([]);
  const [selectedCount, setSelectedCount] = useState(0);
  const [panel, setPanel] = useState(!canvasFirst);
  const [openId, setOpenId] = useState<string | null>(null);
  const theme = useSiteTheme();
  // Last version of each element this tab has seen, from either side, so unchanged elements aren't re-sent.
  const seen = useRef(new Map<string, number>());

  // --- canvas ⇄ room -----------------------------------------------------------

  const onChange = useCallback(
    (elements: readonly OrderedExcalidrawElement[], appState: AppState, binary: BinaryFiles) => {
      setReady(true);
      setSelectedCount(Object.keys(appState.selectedElementIds).length);
      if (readOnly) return;
      // New images: upload once, then record them so other tabs can fetch them.
      if (files) {
        for (const [id, f] of Object.entries(binary)) {
          if (canvasFiles.has(id) || fileJobs.current.has(id)) continue;
          fileJobs.current.add(id);
          void (async () => {
            try {
              const bytes = await (await fetch(f.dataURL)).blob();
              const res = await fetch(`${files}?type=${encodeURIComponent(f.mimeType)}`, { method: "POST", body: bytes });
              if (!res.ok) throw new Error(res.status === 413 ? "Images over 4 MB can't be shared yet." : `Upload failed (${res.status})`);
              const { sha } = (await res.json()) as { sha: string };
              canvasFiles.set(id, { sha, mimeType: f.mimeType, created: f.created });
            } catch (err) {
              window.alert(err instanceof Error ? err.message : "Image upload failed");
            } finally {
              fileJobs.current.delete(id);
            }
          })();
        }
      }
      const changed = elements.filter((el) => seen.current.get(el.id) !== el.version);
      if (!changed.length) return;
      doc.transact(() => {
        for (const el of changed) {
          seen.current.set(el.id, el.version);
          const prev = canvas.get(el.id);
          // Store a copy: Excalidraw mutates elements in place, and the doc must not share that object.
          if (!prev || prev.version < el.version || (prev.version === el.version && prev.versionNonce !== el.versionNonce)) canvas.set(el.id, structuredClone(el));
        }
      }, LOCAL);
    },
    [doc, canvas, canvasFiles, files, readOnly],
  );

  // Images other people added: fetch the bytes and hand them to Excalidraw.
  useEffect(() => {
    if (!api || !ready || !files) return;
    const load = () => {
      const have = api.getFiles();
      for (const [id, meta] of canvasFiles.entries()) {
        if (have[id] || fileJobs.current.has(id)) continue;
        fileJobs.current.add(id);
        void fetch(`${files}/${meta.sha}`)
          .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
          .then(
            (blob) =>
              new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
                reader.onerror = () => reject(reader.error ?? new Error("Could not read image"));
                // Re-type the bytes: the stored blob may be served as a generic type.
                reader.readAsDataURL(new Blob([blob], { type: meta.mimeType }));
              }),
          )
          .then((dataURL) => api.addFiles([{ id: id as FileId, mimeType: meta.mimeType as never, dataURL: dataURL as DataURL, created: meta.created }]))
          .catch(() => undefined) // a missing image just stays a placeholder
          .finally(() => fileJobs.current.delete(id));
      }
    };
    load();
    canvasFiles.observe(load);
    return () => canvasFiles.unobserve(load);
  }, [api, ready, files, canvasFiles]);

  useEffect(() => {
    if (!api || !ready) return;
    const pull = () => {
      const remote = [...canvas.values()] as RemoteExcalidrawElement[];
      for (const el of remote) seen.current.set(el.id, el.version);
      const merged = reconcileElements(api.getSceneElementsIncludingDeleted(), remote, api.getAppState());
      api.updateScene({ elements: merged, captureUpdate: CaptureUpdateAction.NEVER }); // remote edits aren't in your undo stack
    };
    pull();
    const onRemote = (_e: Y.YMapEvent<OrderedExcalidrawElement>, txn: Y.Transaction) => txn.origin !== LOCAL && pull();
    canvas.observe(onRemote);
    return () => canvas.unobserve(onRemote);
  }, [api, ready, canvas]);

  // Everyone's pointer on the canvas, through the room's awareness.
  useEffect(() => {
    if (!api) return;
    const render = () => {
      const collaborators = new Map<SocketId, Collaborator>();
      awareness.getStates().forEach((s, id) => {
        const st = s as { user?: { name: string; color?: string }; pointer?: { x: number; y: number; tool: "pointer" | "laser" }; button?: "up" | "down" };
        if (id === awareness.clientID || !st.user || !st.pointer) return;
        collaborators.set(String(id) as SocketId, {
          username: st.user.name,
          pointer: st.pointer,
          button: st.button,
          color: { background: st.user.color ?? "#888", stroke: st.user.color ?? "#888" },
        });
      });
      api.updateScene({ collaborators });
    };
    render();
    awareness.on("change", render);
    return () => awareness.off("change", render);
  }, [api, awareness]);

  const lastPointer = useRef(0);
  const onPointerUpdate = useCallback(
    ({ pointer, button }: { pointer: { x: number; y: number; tool: "pointer" | "laser" }; button: "up" | "down" }) => {
      const now = Date.now();
      if (now - lastPointer.current < 40) return; // ~25 updates/s is plenty for cursors
      lastPointer.current = now;
      awareness.setLocalStateField("pointer", pointer);
      awareness.setLocalStateField("button", button);
    },
    [awareness],
  );

  // --- cards ---------------------------------------------------------------------

  useEffect(() => {
    const update = () => setCards([...cardsMap.values()].map((m) => m.toJSON() as Card).sort((a, b) => a.order - b.order));
    update();
    cardsMap.observeDeep(update);
    return () => cardsMap.unobserveDeep(update);
  }, [cardsMap]);

  const setCard = (id: string, fields: Partial<Card>) =>
    doc.transact(() => {
      const m = cardsMap.get(id);
      if (!m) return;
      for (const [k, v] of Object.entries(fields)) {
        if (v === undefined) m.delete(k);
        else m.set(k, v);
      }
    });
  const move = (id: string, column: Column) => setCard(id, { column, order: Date.now(), ...(column !== "working" ? { claimedBy: undefined } : {}) });

  /** Selected shapes → one Ready card; the shapes remember which card they belong to. */
  const sendToAgents = () => {
    if (!api || readOnly) return;
    const ids = api.getAppState().selectedElementIds;
    const all = api.getSceneElements();
    const picked = all.filter((el) => Boolean(ids[el.id]) || (el.type === "text" && Boolean(el.containerId && ids[el.containerId])));
    // originalText: what was typed, without the line breaks Excalidraw adds to wrap text in a shape.
    const text = picked
      .map((el) => (el.type === "text" ? (el.originalText ?? el.text) : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
    const [first = "", ...rest] = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const title = first || window.prompt("What should the agent do with this drawing?")?.trim();
    if (!title) return;
    const id = crypto.randomUUID().slice(0, 8);
    const m = new Y.Map<unknown>();
    doc.transact(() => {
      cardsMap.set(id, m);
      for (const [k, v] of Object.entries({ id, title, details: rest.join("\n"), column: "ready", order: Date.now(), createdBy: me, createdAt: Date.now(), elementIds: picked.map((e) => e.id) })) m.set(k, v);
    });
    api.updateScene({
      elements: all.map((el) => (picked.includes(el) ? newElementWith(el, { customData: { ...el.customData, cardId: id } }) : el)),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    setOpenId(id);
    setPanel(true);
  };

  // Linked shapes follow their card: stroke by status, link to the deploy. Idempotent across tabs.
  useEffect(() => {
    if (!api || !ready || readOnly) return;
    const byId = new Map(cards.map((c) => [c.id, c]));
    const elements = api.getSceneElementsIncludingDeleted();
    let dirty = false;
    const next = elements.map((el) => {
      const card = byId.get(cardIdOf(el) ?? "");
      if (!card || el.isDeleted || el.type === "text") return el;
      const stroke = STATUS_STROKE[card.column];
      const want = { strokeColor: stroke ?? el.strokeColor, link: card.deployUrl ?? el.link };
      if (want.strokeColor === el.strokeColor && want.link === el.link) return el;
      dirty = true;
      return newElementWith(el, want);
    });

    // Cards with nothing on the canvas (made from the CLI or by agents) get a sticky note.
    // Fixed ids, so two tabs placing the same note converge on one.
    const onCanvas = new Set(elements.filter((el) => !el.isDeleted).map(cardIdOf).filter(Boolean));
    const missing = cards.filter((c) => !onCanvas.has(c.id) && !(c.elementIds ?? []).length && !elements.some((el) => el.id === `card-${c.id}`));
    let notes: ReturnType<typeof convertToExcalidrawElements> = [];
    if (missing.length) {
      const live = elements.filter((el) => !el.isDeleted);
      const right = live.length ? Math.max(...live.map((el) => el.x + el.width)) + 80 : 100;
      const top = live.length ? Math.min(...live.map((el) => el.y)) : 100;
      notes = convertToExcalidrawElements(
        missing.flatMap((c, i) => [
          { type: "rectangle" as const, id: `card-${c.id}`, x: right, y: top + i * 140, width: 240, height: 110, backgroundColor: "#ffec99", fillStyle: "solid" as const, strokeColor: STATUS_STROKE[c.column] ?? "#1e1e1e", roundness: { type: 3 }, customData: { cardId: c.id } },
          { type: "text" as const, id: `card-${c.id}-text`, x: right + 14, y: top + i * 140 + 14, text: c.title.replace(/(.{1,28})(\s|$)/g, "$1\n").trim(), fontSize: 16, customData: { cardId: c.id } },
        ]),
        { regenerateIds: false },
      );
      dirty = true;
    }
    if (dirty) api.updateScene({ elements: [...next, ...notes], captureUpdate: CaptureUpdateAction.NEVER });
  }, [api, ready, cards, readOnly]);

  const showOnCanvas = (card: Card) => {
    if (!api) return;
    const els = api.getSceneElements().filter((el) => cardIdOf(el) === card.id);
    // Center it at the current zoom; fitting one note to the viewport zooms in far too much.
    if (els.length) api.scrollToContent(els, { animate: true });
  };

  const open = cards.find((c) => c.id === openId);
  const btn = "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]";
  const working = cards.filter((c) => c.column === "working").length;

  return (
    <div className="flex min-h-0 flex-1">
      <div className="relative min-w-0 flex-1">
        <Excalidraw
          excalidrawAPI={setApi}
          initialData={() => {
            const elements = [...canvas.values()];
            for (const el of elements) seen.current.set(el.id, el.version);
            return {
              elements,
              scrollToContent: elements.length > 0,
              libraryItems: uiKit(),
              ...(canvasFirst && !readOnly ? { appState: { openSidebar: { name: "default", tab: "library" } } } : {}),
            };
          }}
          onChange={onChange}
          onPointerUpdate={onPointerUpdate}
          isCollaborating
          viewModeEnabled={readOnly}
          theme={theme}
          name="whiteboard"
          UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: { saveFileToDisk: true } }, tools: { image: Boolean(files) } }}
          renderTopRightUI={() => (
            <div className="flex items-center gap-1.5">
              {!readOnly && (
                <button
                  type="button"
                  onClick={sendToAgents}
                  disabled={!selectedCount}
                  title={selectedCount ? "Turn the selected shapes into a task for agents" : "Select shapes with text first"}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#3558f5] px-3 text-sm font-medium text-white shadow-sm disabled:opacity-40"
                >
                  <Bot className="size-4" /> Send to agents
                </button>
              )}
              <button type="button" onClick={() => setPanel((p) => !p)} aria-pressed={panel} title="Tasks" className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-[var(--background)] px-3 text-sm">
                <ListTodo className="size-4" /> {cards.length}
                {working > 0 && <span className="size-1.5 animate-pulse rounded-full bg-[var(--warning)] motion-reduce:animate-none" aria-label={`${working} in progress`} />}
              </button>
            </div>
          )}
        />
      </div>

      {panel && (
        <aside className="flex w-80 shrink-0 flex-col border-l bg-background" aria-label="Tasks">
          {open ? (
            <>
              <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3 text-xs text-muted-foreground">
                <button type="button" onClick={() => setOpenId(null)} className="hover:text-foreground">Tasks</button>
                <span>/ #{open.id}</span>
                <span className="ml-auto flex">
                  {!readOnly && (
                    <button type="button" className={btn} aria-label="Delete task" onClick={() => window.confirm(`Delete "${open.title}"?`) && (cardsMap.delete(open.id), setOpenId(null))}>
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                  <button type="button" className={btn} aria-label="Close task" onClick={() => setOpenId(null)}>
                    <X className="size-3.5" />
                  </button>
                </span>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">{LABEL[open.column]}{open.agent ? ` · ${open.agent}` : ""}</div>
                  <input
                    key={`t-${open.id}`}
                    defaultValue={open.title}
                    readOnly={readOnly}
                    aria-label="Title"
                    onBlur={(e) => e.target.value.trim() && e.target.value !== open.title && setCard(open.id, { title: e.target.value.trim() })}
                    className="mt-0.5 w-full rounded-md bg-transparent px-1 py-0.5 font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  />
                </div>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Details for the agent
                  <textarea
                    key={open.id}
                    defaultValue={open.details}
                    readOnly={readOnly}
                    rows={4}
                    onBlur={(e) => e.target.value !== open.details && setCard(open.id, { details: e.target.value })}
                    placeholder="What done looks like, files to touch, constraints…"
                    className="rounded-md border bg-transparent p-2 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  {!readOnly && open.column === "ideas" && (
                    <button type="button" onClick={() => move(open.id, "ready")} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-[var(--primary-foreground)]">
                      <Bot className="size-3.5" /> Send to agents
                    </button>
                  )}
                  {!readOnly && open.column === "review" && (
                    <button type="button" onClick={() => move(open.id, "live")} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-[var(--primary-foreground)]">
                      <Rocket className="size-3.5" /> Approve and deploy
                    </button>
                  )}
                  {!readOnly && open.column === "review" && (
                    <button type="button" onClick={() => move(open.id, "ready")} className="rounded-full border px-3 py-1.5 text-xs">Send back to agents</button>
                  )}
                  <button type="button" onClick={() => showOnCanvas(open)} className="rounded-full border px-3 py-1.5 text-xs">Show on canvas</button>
                </div>
                {open.deployUrl && (
                  <a href={open.deployUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 break-all text-[var(--signal)] underline-offset-2 hover:underline">
                    <ExternalLink className="size-3.5 shrink-0" /> {open.deployUrl}
                  </a>
                )}
                {open.result && (
                  <div>
                    <div className="mb-1 text-xs text-muted-foreground">Result</div>
                    <p className={`whitespace-pre-wrap text-[13px] ${/^(Deploy )?[Ff]ailed/.test(open.result) ? "text-[var(--destructive)]" : ""}`}>{open.result}</p>
                  </div>
                )}
                {open.log && (
                  <div>
                    <div className="mb-1 text-xs text-muted-foreground">Agent log</div>
                    <pre className="max-h-80 overflow-auto rounded-md bg-[var(--hover)] p-2 font-mono text-[11px] leading-relaxed">{open.log}</pre>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex h-10 shrink-0 items-center justify-between border-b px-3 text-xs">
                <span className="font-medium">Tasks</span>
                <button type="button" className={btn} aria-label="Hide tasks" onClick={() => setPanel(false)}>
                  <X className="size-3.5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {!cards.length && (
                  <p className="p-2 text-xs leading-relaxed text-muted-foreground">
                    Draw, then select shapes and press <strong className="text-foreground">Send to agents</strong>. An agent started with <code className="font-mono">mm board work</code> picks it up, and the shapes change color as it goes.
                  </p>
                )}
                {(["working", "ready", "review", "live", "ideas"] as Column[]).map((col) => {
                  const here = cards.filter((c) => c.column === col);
                  if (!here.length) return null;
                  return (
                    <section key={col} className="mb-3">
                      <h3 className="flex items-center gap-1.5 px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        <span className="size-2 rounded-full" style={{ background: STATUS_STROKE[col] ?? "var(--border)" }} aria-hidden />
                        {LABEL[col]} <span className="font-normal">{here.length}</span>
                      </h3>
                      <ul>
                        {here.map((c) => (
                          <li key={c.id}>
                            <button type="button" onClick={() => (setOpenId(c.id), showOnCanvas(c))} className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-[var(--hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
                              <span className="min-w-0 flex-1 leading-snug">{c.title}</span>
                              {c.deployUrl && <Rocket className="mt-0.5 size-3.5 shrink-0 text-[var(--success)]" aria-label="deployed" />}
                              {c.column === "working" && <span className="mt-1.5 size-1.5 shrink-0 animate-pulse rounded-full bg-[var(--warning)] motion-reduce:animate-none" aria-label="in progress" />}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            </>
          )}
        </aside>
      )}
    </div>
  );
}
