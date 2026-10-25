/**
 * The project whiteboard: cards in five columns, stored in the project's live
 * room next to its files, so the browser, teammates, bots and agents all see
 * the same board instantly.
 *
 *   mm board [dir] [--json]                 show the board
 *   mm board add "<title>" [--details …] [--ready]
 *   mm board move <card> <column>
 *   mm board work [dir] [--engine claude|codex|code|bot:<id>] [--trust] [--deploy "<cmd>"] [--auto-deploy] [--once]
 *
 * `work` is the autofeed: it keeps `dir` synced, claims the oldest Ready card,
 * hands it to an agent in that folder (whose edits reach everyone live), and
 * moves it to Review. With --deploy it deploys cards moved to Live and pins
 * the URL. Cards are written by other people, so by default agents may edit
 * files but not run commands; the deploy command only ever comes from this
 * command line, never from the board.
 */
import { spawn } from "node:child_process";
import { hostname } from "node:os";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

import * as Y from "yjs";

import { connect, projectForDir, runSync } from "./sync.js";

type Api = (method: string, path: string, body?: unknown) => Promise<Response>;

export const COLUMNS = ["ideas", "ready", "working", "review", "live"] as const;
export type Column = (typeof COLUMNS)[number];
const LABEL: Record<Column, string> = { ideas: "Ideas", ready: "Ready for agents", working: "Agent working", review: "Review", live: "Live" };
const STALE_MS = 30 * 60 * 1000; // a claim older than this is abandoned and can be retaken
const LOG_MAX = 4000;

export type CardData = {
  id: string;
  title: string;
  details: string;
  column: Column;
  order: number;
  createdBy: string;
  createdAt: number;
  claimedBy?: string;
  claimedAt?: number;
  agent?: string;
  log?: string;
  result?: string;
  deployUrl?: string;
  deployedAt?: number;
};

export const cardsOf = (doc: Y.Doc) => doc.getMap<Y.Map<unknown>>("board");
export const read = (m: Y.Map<unknown>) => m.toJSON() as CardData;

export function addCard(doc: Y.Doc, input: { title: string; details?: string; column?: Column; by: string }): string {
  const id = randomUUID().slice(0, 8);
  const m = new Y.Map<unknown>();
  doc.transact(() => {
    cardsOf(doc).set(id, m);
    for (const [k, v] of Object.entries({ id, title: input.title, details: input.details ?? "", column: input.column ?? "ideas", order: Date.now(), createdBy: input.by, createdAt: Date.now() })) m.set(k, v);
  });
  return id;
}

export function moveCard(doc: Y.Doc, id: string, column: Column) {
  const m = cardsOf(doc).get(id);
  if (!m) return;
  doc.transact(() => {
    m.set("column", column);
    m.set("order", Date.now());
    if (column !== "working") m.delete("claimedBy");
  });
}

/** Oldest Ready card nobody holds (or whose holder went quiet). */
export function nextReady(doc: Y.Doc, now = Date.now()): CardData | undefined {
  return [...cardsOf(doc).values()]
    .map(read)
    .filter((c) => c.column === "ready" && (!c.claimedBy || now - (c.claimedAt ?? 0) > STALE_MS))
    .sort((a, b) => a.order - b.order)[0];
}

function findCard(doc: Y.Doc, ref: string): CardData | undefined {
  const all = [...cardsOf(doc).values()].map(read);
  return all.find((c) => c.id === ref) ?? all.find((c) => c.id.startsWith(ref.replace(/^#/, "")));
}

// --- agents ------------------------------------------------------------------

type Engine = { label: string; run: (prompt: string, dir: string, onLog: (line: string) => void) => Promise<string> };

/** Run a process in `dir`, feeding stdout lines to `onLine`; resolves with all stdout, rejects on a non-zero exit. */
function runProcess(cmd: string, args: string[], dir: string, onLine: (l: string) => void, timeoutMs = 20 * 60 * 1000): Promise<string> {
  return new Promise((done, fail) => {
    const child = spawn(cmd, args, { cwd: dir, stdio: ["ignore", "pipe", "pipe"], env: process.env });
    let out = "";
    let err = "";
    let buf = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.on("data", (d: Buffer) => {
      out += d;
      buf += d;
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const l of lines) if (l.trim()) onLine(l);
    });
    child.stderr.on("data", (d: Buffer) => (err += d));
    child.on("error", (e) => (clearTimeout(timer), fail(e)));
    child.on("close", (code) => {
      clearTimeout(timer);
      if (buf.trim()) onLine(buf);
      code === 0 ? done(out) : fail(new Error(err.trim().split("\n").slice(-3).join(" ") || `exited with ${code}`));
    });
  });
}

function engineFor(spec: string, trust: boolean, api: Api): Engine {
  if (spec === "claude") {
    return {
      label: "claude",
      run: async (prompt, dir, onLog) => {
        let result = "";
        let failure = "";
        // stream-json gives live tool steps for the card log; the final "result" event is the summary.
        await runProcess("claude", ["-p", prompt, "--output-format", "stream-json", "--verbose", "--permission-mode", trust ? "auto" : "acceptEdits"], dir, (line) => {
          try {
            const ev = JSON.parse(line) as { type: string; is_error?: boolean; message?: { content?: { type: string; text?: string; name?: string; input?: Record<string, unknown> }[] }; result?: string };
            if (ev.type === "result" && ev.result) (ev.is_error ? (failure = ev.result) : (result = ev.result));
            for (const c of ev.message?.content ?? []) {
              if (c.type === "tool_use") onLog(`→ ${c.name} ${String(c.input?.file_path ?? c.input?.command ?? c.input?.pattern ?? "").split("\n")[0]!.slice(0, 120)}`);
              else if (c.type === "text" && c.text?.trim() && ev.type === "assistant") onLog(c.text.trim().split("\n")[0]!.slice(0, 200));
            }
          } catch {
            onLog(line.slice(0, 200));
          }
        }).catch((err: Error) => {
          // Claude's own error (auth, credits, limits) beats whatever it printed to stderr.
          throw failure ? new Error(failure) : err;
        });
        if (failure) throw new Error(failure);
        return result;
      },
    };
  }
  if (spec === "codex") {
    return {
      label: "codex",
      run: async (prompt, dir, onLog) => {
        // workspace-write: edits inside the folder, commands sandboxed; full access only with --trust.
        const out = await runProcess("codex", ["exec", "--skip-git-repo-check", ...(trust ? ["--full-auto"] : ["-s", "workspace-write"]), prompt], dir, (l) => onLog(l.slice(0, 200)));
        return out.trim().split("\n").slice(-6).join("\n");
      },
    };
  }
  if (spec === "code") {
    return {
      label: "mm code",
      run: async (prompt, dir, onLog) => {
        const out = await runProcess(process.execPath, [process.argv[1]!, "code", "-p", prompt, trust ? "--yes" : "--allow-writes"], dir, (l) => onLog(l.slice(0, 200)));
        return out.trim().split("\n").slice(-6).join("\n");
      },
    };
  }
  const botId = spec.match(/^bot:([0-9a-f-]{36})$/)?.[1];
  if (botId) {
    return {
      label: `bot ${botId.slice(0, 8)}`,
      run: async (prompt, _dir, onLog) => {
        // The bot works on its own machine; its edits arrive through that machine's sync.
        const { conversation } = (await (await api("POST", `/api/v1/bots/${botId}/conversations`)).json()) as { conversation: { id: string } };
        onLog("sent to the bot, waiting for its reply…");
        const { reply } = (await (await api("POST", `/api/v1/bots/${botId}/conversations/${conversation.id}/messages`, { requestId: randomUUID(), content: prompt })).json()) as { reply: { content: string } };
        return reply.content;
      },
    };
  }
  throw new Error(`Unknown engine "${spec}". Use claude, codex, code or bot:<bot-id>.`);
}

function promptFor(card: CardData, doc: Y.Doc): string {
  const others = [...cardsOf(doc).values()].map(read).filter((c) => c.id !== card.id && c.column === "working").map((c) => `- ${c.title}`);
  return [
    "You are one of several agents and people working on the project in this folder, coordinated through a shared board.",
    `Your card: ${card.title}`,
    card.details ? `Details:\n${card.details}` : "",
    others.length ? `Others are working on these right now; leave that work to them:\n${others.join("\n")}` : "",
    "Make the change in this folder and keep it focused on the card. When you're done, reply with two or three sentences saying what you changed.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** First https URL a deploy command prints (Vercel, Netlify, Cloudflare and most hosts print one). */
export function deployUrlFrom(output: string): string | undefined {
  return output.match(/https:\/\/[^\s"'<>)]+/g)?.at(-1);
}

// --- commands ----------------------------------------------------------------

function parse(argv: string[]) {
  const flag = (n: string) => {
    const i = argv.indexOf(n);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const valued = new Set(["--details", "--engine", "--deploy", "--project"]);
  const positional = argv.filter((a, i) => !a.startsWith("--") && !valued.has(argv[i - 1] ?? ""));
  return { flag, has: (n: string) => argv.includes(n), positional };
}

async function openBoard(api: Api, dir: string, explicit?: string) {
  const projectId = await projectForDir(api, dir, explicit);
  if (!projectId) {
    console.error("No project for this folder. Share it with `mm up`, or pass --project <id>.");
    process.exit(1);
  }
  const doc = new Y.Doc();
  const { provider, access } = await connect(api, projectId, doc);
  return { doc, provider, access, projectId };
}

export async function boardCommand(argv: string[], deps: { api: Api; baseUrl: string }) {
  const { flag, has, positional } = parse(argv);
  const sub = positional[0];
  const me = `${hostname().replace(/\.local$/, "")}`;

  if (sub === "work") return work(positional[1], { flag, has }, deps);

  const dir = resolve(sub === "add" || sub === "move" ? "." : (sub ?? "."));
  const { doc, provider, access, projectId } = await openBoard(deps.api, dir, flag("--project"));
  const done = () => (provider.destroy(), process.exit(0));
  const flush = () => new Promise((r) => setTimeout(r, 600)); // let the update reach the room

  if (sub === "add") {
    const title = positional.slice(1).join(" ").trim();
    if (!title) return console.error('Usage: mm board add "<title>" [--details "…"] [--ready]'), process.exit(1);
    if (access.role === "viewer") return console.error("You can only view this project's board."), process.exit(1);
    const id = addCard(doc, { title, details: flag("--details"), column: has("--ready") ? "ready" : "ideas", by: me });
    await flush();
    console.log(`#${id} added to ${has("--ready") ? LABEL.ready : LABEL.ideas}`);
    return done();
  }
  if (sub === "move") {
    const card = findCard(doc, positional[1] ?? "");
    const column = positional[2] as Column;
    if (!card || !COLUMNS.includes(column)) return console.error(`Usage: mm board move <card> <${COLUMNS.join("|")}>`), process.exit(1);
    moveCard(doc, card.id, column);
    await flush();
    console.log(`#${card.id} → ${LABEL[column]}`);
    return done();
  }

  const cards = [...cardsOf(doc).values()].map(read).sort((a, b) => a.order - b.order);
  if (has("--json")) {
    console.log(JSON.stringify({ projectId, cards }, null, 2));
    return done();
  }
  console.log(`board · ${deps.baseUrl}/p/${projectId}\n`);
  for (const col of COLUMNS) {
    const here = cards.filter((c) => c.column === col);
    console.log(`${LABEL[col]} (${here.length})`);
    for (const c of here) console.log(`  #${c.id}  ${c.title}${c.agent && col === "working" ? `  · ${c.agent}` : ""}${c.deployUrl ? `  · ${c.deployUrl}` : ""}`);
  }
  done();
}

async function work(dirArg: string | undefined, o: { flag: (n: string) => string | undefined; has: (n: string) => boolean }, deps: { api: Api; baseUrl: string }) {
  const dir = resolve(dirArg ?? ".");
  const trust = o.has("--trust");
  const engine = engineFor(o.flag("--engine") ?? "claude", trust, deps.api);
  const deployCmd = o.flag("--deploy");
  const autoDeploy = o.has("--auto-deploy");
  const once = o.has("--once");
  const me = `${hostname().replace(/\.local$/, "")}:${process.pid}`;

  const { doc, provider, access, projectId } = await openBoard(deps.api, dir, o.flag("--project"));
  if (access.role === "viewer") {
    console.error("Viewers can't take cards.");
    process.exit(1);
  }
  provider.awareness.setLocalStateField("user", { name: `${engine.label} agent (${hostname().replace(/\.local$/, "")})`, kind: "agent" });

  // Keep the folder synced so the agent's edits reach everyone as it works.
  const stopSync = new AbortController();
  void runSync({ api: deps.api, projectId, dir, seed: "room", quiet: true, signal: stopSync.signal });

  console.log(`agent ready · ${engine.label}${trust ? " · commands allowed" : " · edits in this folder only (--trust to allow commands)"}${deployCmd ? ` · deploys with: ${deployCmd}` : ""}`);
  console.log(`watching ${deps.baseUrl}/p/${projectId} for Ready cards · ctrl+c to stop\n`);

  const card = (id: string) => cardsOf(doc).get(id);
  const set = (id: string, fields: Partial<CardData>) =>
    doc.transact(() => {
      const m = card(id);
      if (m) for (const [k, v] of Object.entries(fields)) v === undefined ? m.delete(k) : m.set(k, v);
    });
  const appendLog = (id: string, line: string) => {
    const prev = String(card(id)?.get("log") ?? "");
    set(id, { log: `${prev}${line}\n`.slice(-LOG_MAX) });
  };
  /** Claim by writing our id, then confirm after the room has merged everyone's claims. */
  const claim = async (id: string, field: "claimedBy", column?: Column) => {
    set(id, { [field]: me, claimedAt: Date.now(), ...(column ? { column, order: Date.now() } : {}) });
    await new Promise((r) => setTimeout(r, 1500));
    return card(id)?.get(field) === me;
  };

  let busy = false;
  let stopped = false;
  const tick = async () => {
    if (busy || stopped) return;
    busy = true;
    try {
      // Deploy first: someone moved a card to Live and is waiting for a URL.
      const toDeploy = deployCmd && [...cardsOf(doc).values()].map(read).find((c) => c.column === "live" && !c.deployedAt && (!c.claimedBy || Date.now() - (c.claimedAt ?? 0) > STALE_MS));
      if (toDeploy && deployCmd) {
        if (await claim(toDeploy.id, "claimedBy")) await deploy(toDeploy);
        return;
      }
      const next = nextReady(doc);
      if (!next) return;
      if (!(await claim(next.id, "claimedBy", "working"))) return;
      console.log(`▶ #${next.id} ${next.title}`);
      set(next.id, { agent: engine.label, log: "", result: undefined });
      try {
        const summary = await engine.run(promptFor(next, doc), dir, (line) => appendLog(next.id, line));
        await new Promise((r) => setTimeout(r, 1500)); // let the last edits sync before review
        set(next.id, { result: summary.trim().slice(0, 1200) || "Done.", claimedBy: undefined, column: autoDeploy && deployCmd ? "live" : "review", order: Date.now() });
        console.log(`✓ #${next.id} → ${autoDeploy && deployCmd ? LABEL.live : LABEL.review}`);
      } catch (err) {
        set(next.id, { result: `Failed: ${err instanceof Error ? err.message : err}`.slice(0, 1200), claimedBy: undefined, column: "review", order: Date.now() });
        console.log(`✗ #${next.id} ${err instanceof Error ? err.message : err}`);
      }
      if (once) stopped = true;
    } finally {
      busy = false;
      if (stopped) finish();
    }
  };

  const deploy = async (c: CardData) => {
    console.log(`⇡ deploying for #${c.id}`);
    appendLog(c.id, `$ ${deployCmd}`);
    try {
      const out = await runProcess(process.env.SHELL || "sh", ["-c", deployCmd!], dir, (l) => appendLog(c.id, l.slice(0, 200)));
      const url = deployUrlFrom(out);
      set(c.id, { deployedAt: Date.now(), deployUrl: url, claimedBy: undefined });
      console.log(`✓ #${c.id} live${url ? ` at ${url}` : ""}`);
    } catch (err) {
      set(c.id, { result: `Deploy failed: ${err instanceof Error ? err.message : err}`.slice(0, 1200), column: "review", claimedBy: undefined, order: Date.now() });
      console.log(`✗ deploy for #${c.id}: ${err instanceof Error ? err.message : err}`);
    }
  };

  const finish = () => {
    clearInterval(timer);
    stopSync.abort();
    setTimeout(() => (provider.destroy(), process.exit(0)), 800);
  };
  cardsOf(doc).observeDeep(() => void tick());
  const timer = setInterval(() => void tick(), 5000);
  process.once("SIGINT", () => {
    stopped = true;
    if (!busy) finish();
  });
  void tick();
}

function demo() {
  const eq = (a: unknown, b: unknown, what: string) => {
    if (a !== b) throw new Error(`board demo: ${what}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
  };
  const doc = new Y.Doc();
  const a = addCard(doc, { title: "first", column: "ready", by: "t" });
  const b = addCard(doc, { title: "second", column: "ready", by: "t" });
  cardsOf(doc).get(b)!.set("order", 0);
  eq(nextReady(doc)?.id, b, "oldest order first");
  cardsOf(doc).get(b)!.set("claimedBy", "x");
  cardsOf(doc).get(b)!.set("claimedAt", Date.now());
  eq(nextReady(doc)?.id, a, "held cards are skipped");
  cardsOf(doc).get(b)!.set("claimedAt", Date.now() - STALE_MS - 1);
  eq(nextReady(doc)?.id, b, "stale claims can be retaken");
  moveCard(doc, a, "review");
  eq(read(cardsOf(doc).get(a)!).column, "review", "move");
  eq(read(cardsOf(doc).get(a)!).claimedBy, undefined, "moving out of working drops the claim");
  eq(deployUrlFrom("Building…\nPreview: https://app-abc.vercel.app\nProduction: https://app.vercel.app\n"), "https://app.vercel.app", "last URL wins");
  eq(deployUrlFrom("no url here"), undefined, "no URL");
  console.log("board demo ok");
}

if (process.argv[1]?.endsWith("board.ts") && process.argv[2] === "--demo") demo();
