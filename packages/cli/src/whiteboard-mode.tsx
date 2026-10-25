/**
 * TUI whiteboard mode: the project's board, live, in the terminal — the same
 * cards the Excalidraw whiteboard and `mm board work` use. The canvas itself
 * opens in the desktop viewer (or the browser) with `o`.
 */
import { Box, Text, useInput } from "ink";
import { useEffect, useMemo, useState } from "react";
import * as Y from "yjs";

import { addCard, cardsOf, COLUMNS, moveCard, read, type CardData, type Column } from "./board.js";
import { connect, projectForDir, projectIdentity } from "./sync.js";

type Api = (method: string, path: string, body?: unknown) => Promise<Response>;

const BRAND = "#6f8cff";
const LABEL: Record<Column, string> = { ideas: "Ideas", ready: "Ready", working: "Working", review: "Review", live: "Live" };
// Same status colors as the canvas, so a card reads the same in both places.
const COLOR: Record<Column, string> = { ideas: "gray", ready: "#3558f5", working: "#f08c00", review: "#9c36b5", live: "#2f9e44" };

/** Canvas-first: straight onto the whiteboard, tasks panel tucked away. */
const canvasLink = (base: string, id: string) => `${base}/p/${id}?view=board&canvas=1`;

type Prompt = { kind: "new"; value: string } | { kind: "delete"; id: string } | null;

export function WhiteboardMode(props: {
  api: Api;
  baseUrl: string;
  openInViewer: (url: string, window?: string) => Promise<"viewer" | "browser">;
  onExit: () => void;
  width: number;
  height: number;
}) {
  const [doc] = useState(() => new Y.Doc());
  const [project, setProject] = useState<{ id: string; role: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<CardData[]>([]);
  const [peers, setPeers] = useState({ people: 0, agents: 0 });
  const [col, setCol] = useState(0);
  const [row, setRow] = useState(0);
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [status, setStatus] = useState("connecting…");
  const [offer, setOffer] = useState<{ name: string; resolve: (yes: boolean) => void } | null>(null);

  useEffect(() => {
    let provider: Awaited<ReturnType<typeof connect>>["provider"] | undefined;
    let gone = false;
    void (async () => {
      try {
        let id = await projectForDir(props.api, process.cwd());
        if (!id) {
          // Nothing to open yet: offer to set one up (c), right here.
          const identity = projectIdentity(process.cwd());
          if (!(await new Promise<boolean>((resolve) => setOffer({ name: identity.name, resolve })))) throw new Error("No whiteboard for this folder yet.");
          setOffer(null);
          const { project } = (await (await props.api("PUT", "/api/v1/projects", identity)).json()) as { project: { id: string } };
          id = project.id;
        }
        const conn = await connect(props.api, id, doc);
        if (gone) return conn.provider.destroy();
        provider = conn.provider;
        setProject({ id, role: conn.access.role });
        setStatus("live");
        // The canvas is the main event: pop it open in its own window as soon as we know the project.
        void props.openInViewer(canvasLink(props.baseUrl, id), "whiteboard").then((w) => setStatus(w === "viewer" ? "canvas open in the viewer" : "canvas open in your browser"));
        const update = () => setCards([...cardsOf(doc).values()].map(read).sort((a, b) => a.order - b.order));
        update();
        cardsOf(doc).observeDeep(update);
        const onPeers = () => {
          let people = 0;
          let agents = 0;
          provider!.awareness.getStates().forEach((s, cid) => {
            if (cid === doc.clientID) return;
            (s as { user?: { kind?: string } }).user?.kind === "agent" ? agents++ : people++;
          });
          setPeers({ people, agents });
        };
        provider.awareness.on("change", onPeers);
        onPeers();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      gone = true;
      provider?.destroy();
      doc.destroy();
    };
  }, [doc, props.api]);

  const byCol = useMemo(() => COLUMNS.map((c) => cards.filter((x) => x.column === c)), [cards]);
  const column = COLUMNS[col]!;
  const sel = byCol[col]?.[Math.min(row, (byCol[col]?.length ?? 1) - 1)];
  const readOnly = project?.role === "viewer";
  const canvasUrl = project ? canvasLink(props.baseUrl, project.id) : null;

  useInput((input, key) => {
    if (offer) {
      if (input === "c" || key.return) return offer.resolve(true);
      if (key.escape || input === "q") return (offer.resolve(false), props.onExit());
      return;
    }
    if (prompt?.kind === "new") {
      if (key.escape) return setPrompt(null);
      if (key.return) {
        const title = prompt.value.trim();
        if (title) addCard(doc, { title, column: column === "ready" ? "ready" : "ideas", by: "terminal" });
        setStatus(title ? `added "${title.slice(0, 40)}"` : "cancelled");
        return setPrompt(null);
      }
      if (key.backspace || key.delete) return setPrompt({ ...prompt, value: prompt.value.slice(0, -1) });
      if (input && !key.ctrl && !key.meta && !/[\x00-\x1f]/.test(input)) setPrompt({ ...prompt, value: prompt.value + input });
      return;
    }
    if (prompt?.kind === "delete") {
      if (input === "y") {
        cardsOf(doc).delete(prompt.id);
        setStatus("deleted");
      } else setStatus("cancelled");
      return setPrompt(null);
    }
    if (key.escape || input === "q") return props.onExit();
    if (key.leftArrow || input === "h") return (setCol((c) => (c + COLUMNS.length - 1) % COLUMNS.length), setRow(0));
    if (key.rightArrow || input === "l" || key.tab) return (setCol((c) => (c + 1) % COLUMNS.length), setRow(0));
    if (key.downArrow || input === "j") return setRow((r) => Math.min(r + 1, Math.max(0, (byCol[col]?.length ?? 1) - 1)));
    if (key.upArrow || input === "k") return setRow((r) => Math.max(0, r - 1));
    if ((input === "o" || key.return) && canvasUrl) {
      void props.openInViewer(canvasUrl, "whiteboard").then((w) => setStatus(`opened the canvas in ${w === "viewer" ? "the viewer" : "your browser"}`));
      return;
    }
    if (readOnly) return setStatus("view only");
    if (input === "n") return setPrompt({ kind: "new", value: "" });
    if (!sel) return;
    if (input === "s" && sel.column === "ideas") return (moveCard(doc, sel.id, "ready"), setStatus("sent to agents"));
    if (input === "a" && sel.column === "review") return (moveCard(doc, sel.id, "live"), setStatus("approved — a runner with --deploy ships it"));
    if (input === "b" && sel.column === "review") return (moveCard(doc, sel.id, "ready"), setStatus("sent back to agents"));
    if (input === "d") return setPrompt({ kind: "delete", id: sel.id });
  });

  if (offer) {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text bold color={BRAND}>whiteboard</Text>
        <Text>{`${offer.name} doesn't have a whiteboard yet.`}</Text>
        <Text>
          <Text color={BRAND}>c</Text>
          <Text dimColor>{` set one up now (files stay local — share them later with mm up)   `}</Text>
          <Text color={BRAND}>esc</Text>
          <Text dimColor> back</Text>
        </Text>
      </Box>
    );
  }
  if (error) {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text bold color={BRAND}>whiteboard</Text>
        <Text>{error}</Text>
        <Text dimColor>esc to go back</Text>
      </Box>
    );
  }

  const colWidth = Math.max(16, Math.floor((props.width - 4) / COLUMNS.length) - 1);
  const listRows = Math.max(3, props.height - 14);
  const hints: [string, string][] = readOnly
    ? [["o", "open canvas"], ["esc", "home"]]
    : [["o", "open canvas"], ["n", "new"], ["s", "send to agents"], ["a", "approve"], ["b", "back"], ["d", "delete"], ["esc", "home"]];

  return (
    <Box flexDirection="column" height={props.height - 1} paddingX={1}>
      <Box justifyContent="space-between" width="100%">
        <Text>
          <Text bold color={BRAND}>mm  </Text>
          <Text backgroundColor={BRAND} color="white" bold> whiteboard </Text>
          <Text dimColor>{`  ${cards.length} cards`}</Text>
        </Text>
        <Text dimColor>{`${status === "live" ? "● live" : status} · ${peers.people} here · ${peers.agents} agent${peers.agents === 1 ? "" : "s"}`}</Text>
      </Box>
      <Box marginTop={1}>
        {COLUMNS.map((c, ci) => {
          const here = byCol[ci] ?? [];
          const focused = ci === col;
          return (
            <Box key={c} flexDirection="column" width={colWidth} marginRight={1} borderStyle="round" borderColor={focused ? BRAND : "gray"} paddingX={1}>
              <Text bold color={COLOR[c]}>{`${LABEL[c]} ${here.length}`}</Text>
              {here.length === 0 && <Text dimColor>—</Text>}
              {here.slice(0, listRows).map((card, ri) => {
                const on = focused && ri === Math.min(row, here.length - 1);
                return (
                  <Text key={card.id} wrap="truncate" inverse={on}>
                    {`${c === "working" ? "◐ " : c === "live" && card.deployUrl ? "✓ " : ""}${card.title}`}
                  </Text>
                );
              })}
              {here.length > listRows && <Text dimColor>{`+${here.length - listRows} more`}</Text>}
            </Box>
          );
        })}
      </Box>
      <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor="gray" paddingX={1}>
        {sel ? (
          <>
            <Text bold wrap="truncate">{sel.title}</Text>
            <Text dimColor wrap="truncate">{`#${sel.id} · ${LABEL[sel.column]}${sel.agent ? ` · ${sel.agent}` : ""}${sel.deployUrl ? ` · ${sel.deployUrl}` : ""}`}</Text>
            {sel.details ? <Text wrap="truncate-end">{sel.details}</Text> : null}
            {sel.result ? <Text color={/^(Deploy )?[Ff]ailed/.test(sel.result) ? "red" : undefined} wrap="truncate-end">{sel.result.split("\n").slice(0, 3).join(" ")}</Text> : null}
            {sel.log ? <Text dimColor>{sel.log.trimEnd().split("\n").slice(-4).join("\n")}</Text> : null}
          </>
        ) : (
          <Text dimColor>{project ? "No card selected. n adds one; o opens the canvas to draw." : "connecting…"}</Text>
        )}
      </Box>
      {prompt?.kind === "new" ? (
        <Box borderStyle="round" borderColor={BRAND} paddingX={1}>
          <Text color={BRAND} bold>{`new ${column === "ready" ? "Ready" : "Ideas"} card › `}</Text>
          <Text>{prompt.value}</Text>
          <Text inverse> </Text>
        </Box>
      ) : prompt?.kind === "delete" ? (
        <Box borderStyle="round" borderColor="yellow" paddingX={1}>
          <Text color="yellow">delete this card for everyone? y to confirm</Text>
        </Box>
      ) : (
        <Text wrap="truncate">
          {hints.map(([k, v], i) => (
            <Text key={k}>
              {i ? "   " : ""}
              <Text color={BRAND}>{k}</Text>
              <Text dimColor>{` ${v}`}</Text>
            </Text>
          ))}
        </Text>
      )}
    </Box>
  );
}
