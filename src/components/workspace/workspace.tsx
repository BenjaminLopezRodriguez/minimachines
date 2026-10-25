"use client";

/**
 * The live project workspace (no install needed): file tree, a CodeMirror
 * editor bound to the project's Yjs document, and the project machine's app.
 * Every keystroke applies here first and merges into everyone else's copy —
 * browser tabs, `mm sync` folders and machines alike.
 */
import { javascript } from "@codemirror/lang-javascript";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { ExternalLink, FilePlus2, FileText, Folder, Link2, RotateCw, SquareTerminal, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { yCollab } from "y-codemirror.next";
import YProvider from "y-partyserver/provider";
import * as Y from "yjs";

// Excalidraw needs the browser; it's also large, so it only loads when the Board tab opens.
const Board = dynamic(() => import("./board").then((m) => m.Board), {
  ssr: false,
  loading: () => <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading whiteboard…</div>,
});

type Access = { host: string; secure: boolean; room: string; token: string; role: "owner" | "member" | "viewer" };
type Peer = { id: number; name: string; color: string; file?: string; kind?: string };

const COLORS = ["#3558f5", "#e5484d", "#12a594", "#f76b15", "#8e4ec6", "#d6409f", "#0090ff", "#46a758"];

function languageFor(path: string): Extension {
  if (/\.(m|c)?[jt]sx?$/.test(path)) return javascript({ jsx: path.endsWith("x"), typescript: path.endsWith(".ts") || path.endsWith(".tsx") });
  if (/\.(css|scss)$/.test(path)) return css();
  if (path.endsWith(".json")) return json();
  if (/\.(md|mdx)$/.test(path)) return markdown();
  return [];
}

/** Editor colors come from the site's tokens, so light and dark both follow the app theme. */
const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "13px", backgroundColor: "var(--background)", color: "var(--foreground)" },
  ".cm-scroller": { fontFamily: "var(--font-mono), ui-monospace, monospace", lineHeight: "1.6" },
  ".cm-gutters": { backgroundColor: "var(--background)", color: "var(--muted-foreground)", border: "none" },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "var(--hover)" },
  "&.cm-focused .cm-cursor": { borderLeftColor: "var(--signal)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": { backgroundColor: "var(--signal-soft) !important" },
  ".cm-ySelectionInfo": { fontFamily: "var(--font-sans)", fontSize: "11px", padding: "1px 4px", borderRadius: "4px", opacity: 1 },
});

function Tree({ paths, open, onOpen, peers }: { paths: string[]; open: string | null; onOpen: (p: string) => void; peers: Peer[] }) {
  // Group by directory; folders listed before files, both alphabetical.
  const rows: { depth: number; label: string; path?: string }[] = [];
  const seen = new Set<string>();
  for (const p of [...paths].sort((a, b) => {
    const da = a.split("/").length;
    const db = b.split("/").length;
    const pa = a.split("/").slice(0, -1).join("/");
    const pb = b.split("/").slice(0, -1).join("/");
    return pa === pb ? a.localeCompare(b) : a.localeCompare(b) || da - db;
  })) {
    const parts = p.split("/");
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join("/");
      if (!seen.has(dir)) {
        seen.add(dir);
        rows.push({ depth: i - 1, label: parts[i - 1]! });
      }
    }
    rows.push({ depth: parts.length - 1, label: parts.at(-1)!, path: p });
  }
  return (
    <ul className="flex flex-col py-1 text-[13px]" role="tree" aria-label="Files">
      {rows.map((r) => {
        const here = r.path ? peers.filter((x) => x.file === r.path) : [];
        const active = r.path === open;
        return (
          <li key={r.path ?? `dir:${r.label}:${r.depth}`} role="treeitem" aria-selected={active}>
            {r.path ? (
              <button
                type="button"
                onClick={() => onOpen(r.path!)}
                className={`flex w-full items-center gap-2 rounded-md py-1 pr-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${active ? "bg-[var(--signal-soft)] text-foreground" : "text-muted-foreground hover:bg-[var(--hover)] hover:text-foreground"}`}
                style={{ paddingLeft: 8 + r.depth * 14 }}
              >
                <FileText className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{r.label}</span>
                <span className="ml-auto flex gap-0.5">
                  {here.map((x) => (
                    <span key={x.id} title={`${x.name} is here`} className="size-2 rounded-full" style={{ background: x.color }} />
                  ))}
                </span>
              </button>
            ) : (
              <div className="flex items-center gap-2 py-1 text-xs font-medium text-muted-foreground" style={{ paddingLeft: 8 + r.depth * 14 }}>
                <Folder className="size-3.5" aria-hidden />
                {r.label}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function BinaryPreview({ path, entry, src }: { path: string; entry: { size: number; mime: string }; src: string | null }) {
  const kb = `${Math.max(1, Math.round(entry.size / 1024))} KB`;
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-auto p-6 text-sm text-muted-foreground">
      {src && entry.mime.startsWith("image/") ? (
        // eslint-disable-next-line @next/next/no-img-element -- a private project file, not an optimizable asset
        <img src={src} alt={path} className="max-h-[70%] max-w-full rounded-md border object-contain" />
      ) : null}
      <span>
        {path.split("/").pop()} · {entry.mime} · {kb}
      </span>
      {src && (
        <a href={src} download={path.split("/").pop()} className="rounded-full border px-3 py-1.5 text-xs text-foreground hover:bg-[var(--hover)]">
          Download
        </a>
      )}
    </div>
  );
}

export function Workspace(props: {
  project: { id: string; name: string; repoKey: string | null };
  access: Access;
  me: { name: string };
  machine: { id: string; name: string; status: string; appUrl: string | null; consoleUrl: string | null } | null;
  refreshToken: () => Promise<string>;
  /** Server has project file storage: images on the whiteboard and binary files in the tree. */
  storage: boolean;
  /** `?view=board` (e.g. from the TUI's whiteboard mode) opens straight on the whiteboard. */
  initialView?: "code" | "board";
}) {
  const { access, project, machine } = props;
  const readOnly = access.role === "viewer";
  const color = useMemo(() => COLORS[Math.floor(Math.random() * COLORS.length)]!, []);

  // One doc + provider for the page's lifetime.
  const [{ doc, provider }] = useState(() => {
    const doc = new Y.Doc();
    let first = true;
    const provider = new YProvider(access.host, access.room, doc, {
      protocol: access.secure ? "wss" : "ws",
      // First connect uses the server-rendered token; reconnects ask for a fresh one.
      params: async () => ({ token: first ? ((first = false), access.token) : await props.refreshToken() }),
    });
    return { doc, provider };
  });
  const files = doc.getMap<Y.Text>("files");
  // Binary files synced by `mm sync`: path → blob in project file storage.
  const blobs = doc.getMap<{ sha: string; size: number; mime: string }>("blobs");

  const [paths, setPaths] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [status, setStatus] = useState<"connecting" | "live" | "offline">("connecting");
  const [peers, setPeers] = useState<Peer[]>([]);
  const [previewKey, setPreviewKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<"code" | "board">(props.initialView ?? "code");
  const editorEl = useRef<HTMLDivElement>(null);

  useEffect(() => {
    provider.awareness.setLocalStateField("user", { name: props.me.name, color, colorLight: `${color}33`, kind: "web" });
    const onStatus = ({ status: s }: { status: string }) => setStatus(s === "connected" ? "live" : s === "connecting" ? "connecting" : "offline");
    const onSync = (synced: boolean) => {
      if (!synced) return;
      const keys = [...files.keys(), ...blobs.keys()];
      setPaths(keys);
      setOpen((cur) => cur ?? keys.find((k) => /readme/i.test(k)) ?? keys.sort()[0] ?? null);
    };
    const onFiles = () => setPaths([...files.keys(), ...blobs.keys()]);
    const onPeers = () => {
      const list: Peer[] = [];
      provider.awareness.getStates().forEach((s, id) => {
        const u = (s as { user?: { name: string; color?: string; kind?: string }; file?: string }).user;
        if (id !== doc.clientID && u) list.push({ id, name: u.name, color: u.color ?? "#888", kind: u.kind, file: (s as { file?: string }).file });
      });
      setPeers(list);
    };
    if (provider.wsconnected) setStatus("live"); // may have connected before this listener existed
    provider.on("status", onStatus);
    provider.on("sync", onSync);
    files.observe(onFiles);
    blobs.observe(onFiles);
    provider.awareness.on("change", onPeers);
    return () => {
      files.unobserve(onFiles);
      blobs.unobserve(onFiles);
      provider.destroy();
      doc.destroy();
    };
  }, [provider, doc, files, blobs, color, props.me.name]);

  // (Re)bind the editor to the open file.
  useEffect(() => {
    provider.awareness.setLocalStateField("file", open ?? undefined);
    const ytext = open ? files.get(open) : undefined;
    if (!editorEl.current || !ytext || !open) return;
    const undoManager = new Y.UndoManager(ytext);
    const view = new EditorView({
      parent: editorEl.current,
      state: EditorState.create({
        doc: ytext.toJSON(),
        extensions: [
          basicSetup,
          languageFor(open),
          theme,
          yCollab(ytext, provider.awareness, { undoManager }),
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
        ],
      }),
    });
    return () => {
      view.destroy();
      undoManager.destroy();
    };
  }, [open, paths.includes(open ?? ""), files, provider, readOnly, view]); // eslint-disable-line react-hooks/exhaustive-deps

  const newFile = () => {
    const path = window.prompt("New file path (e.g. src/notes.md)")?.trim().replace(/^\/+/, "");
    if (!path || files.has(path) || path.split("/").some((p) => p === ".." || !p)) return;
    files.set(path, new Y.Text());
    setOpen(path);
  };
  const deleteFile = () => {
    if (!open || !window.confirm(`Delete ${open} for everyone?`)) return;
    files.delete(open);
    setOpen(null);
  };
  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const dot = status === "live" ? "bg-[var(--success)]" : status === "connecting" ? "bg-[var(--warning)]" : "bg-[var(--destructive)]";
  const iconBtn = "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-40";

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-3">
        <span className="font-semibold tracking-tight text-[var(--brand)]">mm</span>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{project.name}</div>
        </div>
        {project.repoKey && <span className="hidden truncate font-mono text-xs text-muted-foreground md:inline">{project.repoKey}</span>}
        <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs text-muted-foreground" role="status">
          <span className={`size-1.5 rounded-full ${dot}`} aria-hidden />
          {status}
        </span>
        {readOnly && <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">view only</span>}
        <nav className="ml-2 flex rounded-md border p-0.5 text-xs" aria-label="Workspace view">
          {(["code", "board"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`rounded px-2.5 py-1 capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${view === v ? "bg-[var(--hover)] font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {v}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <div className="mr-2 flex -space-x-1.5" aria-label={`${peers.length} others here`}>
            {peers.slice(0, 6).map((p) => (
              <span key={p.id} title={`${p.name}${p.kind === "cli" ? " (synced folder)" : ""}${p.file ? ` · ${p.file}` : ""}`} className="flex size-6 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ring-[var(--background)]" style={{ background: p.color }}>
                {p.name.slice(0, 1).toUpperCase()}
              </span>
            ))}
          </div>
          <button type="button" onClick={copyLink} className={iconBtn} aria-label="Copy link" title={copied ? "Copied" : "Copy link"}>
            <Link2 className="size-4" />
          </button>
          {machine?.consoleUrl && (
            <a href={machine.consoleUrl} target="_blank" rel="noreferrer" className={iconBtn} aria-label="Open terminal" title="Terminal">
              <SquareTerminal className="size-4" />
            </a>
          )}
        </div>
      </header>

      {view === "board" ? (
        <Board doc={doc} awareness={provider.awareness} readOnly={readOnly} me={props.me.name} files={props.storage ? `/p/${project.id}/blobs` : null} />
      ) : (
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 flex-col border-r md:flex">
          <div className="flex h-9 items-center justify-between px-3 text-xs font-medium text-muted-foreground">
            Files
            {!readOnly && (
              <span className="flex">
                <button type="button" onClick={newFile} className={iconBtn} aria-label="New file" title="New file">
                  <FilePlus2 className="size-4" />
                </button>
                <button type="button" onClick={deleteFile} disabled={!open} className={iconBtn} aria-label="Delete file" title="Delete file">
                  <Trash2 className="size-4" />
                </button>
              </span>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-1">
            {paths.length ? <Tree paths={paths} open={open} onOpen={setOpen} peers={peers} /> : <p className="px-3 py-2 text-xs text-muted-foreground">{status === "live" ? "No files yet. Run mm up in a project folder." : "Loading…"}</p>}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3 text-xs text-muted-foreground">
            {/* Phones: pick a file here instead of the sidebar. */}
            <select className="max-w-full truncate rounded-md border bg-transparent px-2 py-1 md:hidden" value={open ?? ""} onChange={(e) => setOpen(e.target.value || null)} aria-label="File">
              {[...paths].sort().map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <span className="hidden truncate font-mono md:inline">{open ?? "no file open"}</span>
          </div>
          {open && blobs.has(open) ? (
            <BinaryPreview path={open} entry={blobs.get(open)!} src={props.storage ? `/p/${project.id}/blobs/${blobs.get(open)!.sha}` : null} />
          ) : (
            <div ref={editorEl} className="min-h-0 flex-1 overflow-hidden" />
          )}
        </main>

        <section className="hidden w-[42%] shrink-0 flex-col border-l lg:flex" aria-label="Preview">
          <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3 text-xs text-muted-foreground">
            Preview
            {machine && <span className="font-mono">{machine.name} · {machine.status}</span>}
            {machine?.appUrl && (
              <span className="ml-auto flex">
                <button type="button" onClick={() => setPreviewKey((k) => k + 1)} className={iconBtn} aria-label="Reload preview" title="Reload">
                  <RotateCw className="size-3.5" />
                </button>
                <a href={machine.appUrl} target="_blank" rel="noreferrer" className={iconBtn} aria-label="Open preview in a new tab" title="Open in a new tab">
                  <ExternalLink className="size-3.5" />
                </a>
              </span>
            )}
          </div>
          {machine?.appUrl ? (
            <iframe key={previewKey} src={machine.appUrl} title={`${project.name} preview`} className="min-h-0 flex-1 bg-white" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
              {machine ? "The machine has no app running yet. Start a dev server on port 3000." : "No machine for this project yet. Run mm create in the repo to add one."}
            </div>
          )}
        </section>
      </div>
      )}
    </div>
  );
}
