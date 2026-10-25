/**
 * Live project sync. A project's files live in one Yjs document in its room
 * (packages/sync); this keeps a folder and that document in step both ways.
 *
 *   mm up [dir]          share this folder: create the project, push it, print the link, keep syncing
 *   mm sync [dir]        keep a folder in step with its project (the room wins for files it has)
 *   mm join <link> [dir] pull a project you were invited to into a new folder, then sync
 *
 * Edits apply locally at once and merge everywhere (CRDT), so there is no
 * lock and no "pull first". Text files only; binaries and ignored paths stay local.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, watch, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import YProvider from "y-partyserver/provider";
import * as Y from "yjs";

import { repoKeyFromRemote } from "./people.js";

type Api = (method: string, path: string, body?: unknown) => Promise<Response>;
type Access = { host: string; secure: boolean; room: string; token: string; role: string };

const IGNORE = new Set([".git", "node_modules", ".next", "dist", "build", ".turbo", ".vercel", ".wrangler", "coverage", ".DS_Store"]);
const MAX_BYTES = 1_000_000;
const LOCAL = Symbol("local"); // transaction origin for edits that came from this folder

const toKey = (p: string) => p.split(sep).join("/"); // doc paths are always posix
const ignoredPath = (key: string) => key.split("/").some((part) => IGNORE.has(part));

/** Text only: binaries (a NUL byte in the first 8 KB) and big files are skipped. */
function readText(abs: string): string | null {
  try {
    const st = statSync(abs);
    if (!st.isFile() || st.size > MAX_BYTES) return null;
    const buf = readFileSync(abs);
    return buf.subarray(0, 8192).includes(0) ? null : buf.toString("utf8");
  } catch {
    return null;
  }
}

function git(dir: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

/** Files to share: git's view (tracked + untracked, minus .gitignore) when it's a repo, else a walk. */
export function listFiles(dir: string): string[] {
  const fromGit = git(dir, ["ls-files", "-co", "--exclude-standard", "-z"]);
  if (fromGit !== null) return fromGit.split("\0").filter((k) => k && !ignoredPath(k));
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
      if (IGNORE.has(e.name)) continue;
      const k = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(k);
      else if (e.isFile()) out.push(k);
    }
  };
  walk("");
  return out;
}

/** Turn `ytext` into `next` with the smallest edit (common prefix/suffix), so concurrent edits elsewhere survive. */
export function applyText(ytext: Y.Text, next: string) {
  const prev = ytext.toString();
  if (prev === next) return;
  let start = 0;
  while (start < prev.length && start < next.length && prev[start] === next[start]) start++;
  let endPrev = prev.length;
  let endNext = next.length;
  while (endPrev > start && endNext > start && prev[endPrev - 1] === next[endNext - 1]) {
    endPrev--;
    endNext--;
  }
  if (endPrev > start) ytext.delete(start, endPrev - start);
  if (endNext > start) ytext.insert(start, next.slice(start, endNext));
}

/**
 * Three-way merge for one file: re-apply the change `base → local` onto
 * `current` (the room's text, which may have moved on). The edited span is
 * found in `current` by up to 32 characters of context on each side; if that
 * context is gone or ambiguous, the local version wins for this file.
 */
export function rebase(base: string, local: string, current: string): string {
  if (base === current) return local;
  if (base === local) return current;
  let start = 0;
  while (start < base.length && start < local.length && base[start] === local[start]) start++;
  let endB = base.length;
  let endL = local.length;
  while (endB > start && endL > start && base[endB - 1] === local[endL - 1]) {
    endB--;
    endL--;
  }
  const removed = base.slice(start, endB);
  // Widest context first; shrink when the other side edited nearby. Each side shrinks on its own.
  for (const n of [32, 16, 8, 4, 1, 0]) {
    for (const [nb, na] of [[n, n], [n, 0], [0, n]] as const) {
      const before = base.slice(Math.max(0, start - nb), start);
      const after = base.slice(endB, endB + na);
      const needle = before + removed + after;
      if (!needle) continue;
      const at = current.indexOf(needle);
      if (at < 0 || current.indexOf(needle, at + 1) >= 0) continue;
      const from = at + before.length;
      return current.slice(0, from) + local.slice(start, endL) + current.slice(from + removed.length);
    }
  }
  return local;
}

/** Connect to a project's room; resolves once the first sync with the server is done. */
async function connect(api: Api, projectId: string, doc: Y.Doc): Promise<{ provider: YProvider; access: Access }> {
  const fresh = async () => (await (await api("POST", `/api/v1/projects/${projectId}/sync`)).json()) as Access;
  const access = await fresh();
  const provider = new YProvider(access.host, access.room, doc, {
    protocol: access.secure ? "wss" : "ws",
    // Each (re)connect fetches a new token, so long sessions outlive the token's hour.
    params: async () => ({ token: (await fresh()).token }),
    WebSocketPolyfill: WebSocket,
    disableBc: true,
  });
  provider.awareness.setLocalStateField("user", { name: `${hostname().replace(/\.local$/, "")} (cli)`, kind: "cli" });
  await new Promise<void>((done, fail) => {
    const t = setTimeout(() => fail(new Error(`Could not reach the sync server at ${access.host}`)), 15_000);
    provider.on("sync", (synced: boolean) => {
      if (synced) {
        clearTimeout(t);
        done();
      }
    });
  });
  return { provider, access };
}

/**
 * Keep `dir` and the doc in step until interrupted. `seed` decides who wins on
 * the first pass for a file both sides have: "local" for `mm up`, "room" otherwise.
 */
export async function runSync(opts: { api: Api; projectId: string; dir: string; seed: "local" | "room"; quiet?: boolean; signal?: AbortSignal }) {
  const { api, projectId, dir } = opts;
  const log = (s: string) => opts.quiet || console.log(s);
  const doc = new Y.Doc();
  const files = doc.getMap<Y.Text>("files");
  const { provider, access } = await connect(api, projectId, doc);
  const readOnly = access.role === "viewer";

  // What we last wrote to (or read from) disk per path — an fs event matching it is our own echo.
  const onDisk = new Map<string, string | null>();

  /** Push a local edit into the room, merged over whatever the room has now. */
  const pushLocal = (key: string, text: string | null) => {
    const base = onDisk.get(key);
    onDisk.set(key, text);
    doc.transact(() => {
      const y = files.get(key);
      if (text === null) files.delete(key);
      else if (y) applyText(y, base == null ? text : rebase(base, text, y.toString()));
      else {
        const t = new Y.Text();
        t.insert(0, text);
        files.set(key, t);
      }
    }, LOCAL);
  };

  const writeLocal = (key: string) => {
    const abs = join(dir, key);
    // A save not pushed yet (still in its debounce) goes in first, so the remote change can't erase it.
    const pending = readText(abs);
    if (!readOnly && pending !== null && onDisk.has(key) && pending !== onDisk.get(key)) pushLocal(key, pending);
    const text = files.get(key)?.toString();
    if (text === undefined) {
      onDisk.set(key, null);
      rmSync(abs, { force: true });
      return;
    }
    if (readText(abs) === text) return onDisk.set(key, text);
    mkdirSync(dirname(abs), { recursive: true });
    onDisk.set(key, text);
    writeFileSync(abs, text);
  };

  // First pass.
  const local = new Set(listFiles(dir));
  let pushed = 0;
  let pulled = 0;
  doc.transact(() => {
    for (const key of local) {
      const text = readText(join(dir, key));
      if (text === null) continue;
      onDisk.set(key, text);
      const y = files.get(key);
      if (!y) {
        if (readOnly) continue;
        const t = new Y.Text();
        t.insert(0, text);
        files.set(key, t);
        pushed++;
      } else if (opts.seed === "local" && !readOnly) {
        applyText(y, text);
        pushed++;
      }
    }
  }, LOCAL);
  for (const key of files.keys()) {
    if (opts.seed === "local" && local.has(key)) continue;
    if (onDisk.get(key) !== files.get(key)!.toString()) {
      writeLocal(key);
      pulled++;
    }
  }
  log(`synced ${files.size} files (${pushed} up, ${pulled} down)${readOnly ? " · view-only" : ""}`);

  // Room → disk: everything not done by this folder.
  files.observeDeep((events, txn) => {
    if (txn.origin === LOCAL) return;
    const keys = new Set<string>();
    for (const e of events) {
      if (e.target === files) for (const k of e.changes.keys.keys()) keys.add(k);
      else keys.add(String(e.path[0]));
    }
    for (const k of keys) {
      if (ignoredPath(k)) continue;
      writeLocal(k);
      log(`↓ ${k}`);
    }
  });

  // Disk → room, debounced per path; our own writes are recognised and skipped.
  const timers = new Map<string, NodeJS.Timeout>();
  const onFsChange = (key: string) => {
    if (readOnly || ignoredPath(key)) return;
    const abs = join(dir, key);
    const text = readText(abs);
    if (text === null && existsSync(abs)) return; // binary, too big, or a directory
    if (onDisk.get(key) === text || (text === null && !files.has(key))) return;
    // New files must pass .gitignore, like the first pass.
    if (!files.has(key) && git(dir, ["check-ignore", "-q", key]) !== null) return;
    pushLocal(key, text);
    log(`↑ ${key}${text === null ? " (deleted)" : ""}`);
  };
  const watcher = watch(dir, { recursive: true }, (_ev, name) => {
    if (!name) return;
    const key = toKey(name.toString());
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => (timers.delete(key), onFsChange(key)), 80));
  });

  // Who else is here.
  let others = 0;
  provider.awareness.on("change", () => {
    const n = provider.awareness.getStates().size - 1;
    if (n !== others) log(`${n} other${n === 1 ? "" : "s"} here`);
    others = n;
  });

  await new Promise<void>((done) => {
    const stop = () => done();
    opts.signal?.addEventListener("abort", stop);
    process.once("SIGINT", stop);
  });
  watcher.close();
  for (const t of timers.values()) clearTimeout(t);
  provider.destroy();
  doc.destroy();
}

function linkFor(baseUrl: string, projectId: string) {
  return `${baseUrl}/p/${projectId}`;
}

/** `mm up`: share this folder as a live project. */
export async function upCommand(argv: string[], deps: { api: Api; baseUrl: string }) {
  const dir = resolve(argv.find((a) => !a.startsWith("-")) ?? ".");
  const remote = git(dir, ["remote", "get-url", "origin"])?.trim();
  const repoKey = remote ? (repoKeyFromRemote(remote) ?? undefined) : undefined;
  const name = repoKey ? basename(repoKey) : basename(dir);
  const { project } = (await (await deps.api("PUT", "/api/v1/projects", { name, repoKey })).json()) as { project: { id: string; name: string } };
  console.log(`${project.name} is live: ${linkFor(deps.baseUrl, project.id)}`);
  console.log(`invite people with \`mm people +\`; anyone with access can open the link (no install needed)\nctrl+c stops syncing; the project stays live\n`);
  await runSync({ api: deps.api, projectId: project.id, dir, seed: "local" });
}

/** `mm sync [dir]`: keep this folder in step with its project. */
export async function syncCommand(argv: string[], deps: { api: Api; baseUrl: string }) {
  const i = argv.indexOf("--project");
  const dir = resolve(argv.find((a, j) => !a.startsWith("-") && argv[j - 1] !== "--project") ?? ".");
  let projectId = i >= 0 ? argv[i + 1] : undefined;
  if (!projectId) {
    const remote = git(dir, ["remote", "get-url", "origin"])?.trim();
    const key = remote ? repoKeyFromRemote(remote) : null;
    const { projects } = (await (await deps.api("GET", "/api/v1/projects")).json()) as { projects: { id: string; repoKey: string | null; name: string }[] };
    projectId = projects.find((p) => (key ? p.repoKey === key : p.name === basename(dir)))?.id;
  }
  if (!projectId) {
    console.error("No project for this folder. Share it with `mm up`, or pass --project <id>.");
    process.exit(1);
  }
  console.log(`syncing ${dir} with ${linkFor(deps.baseUrl, projectId)}`);
  await runSync({ api: deps.api, projectId, dir, seed: "room" });
}

/** `mm join <link|projectId> [dir]`: pull a project you have access to, then sync. */
export async function joinCommand(argv: string[], deps: { api: Api; baseUrl: string }) {
  const [target, folder] = argv.filter((a) => !a.startsWith("-"));
  const projectId = target?.match(/\/p\/([0-9a-f-]{36})/)?.[1] ?? (target && /^[0-9a-f-]{36}$/.test(target) ? target : undefined);
  if (!projectId) {
    console.error("Usage: mm join <project link> [folder]\nAccept the invite in your browser first; the link looks like …/p/<id>.");
    process.exit(1);
  }
  const res = await deps.api("GET", "/api/v1/projects");
  const { projects } = (await res.json()) as { projects: { id: string; name: string }[] };
  const project = projects.find((p) => p.id === projectId);
  if (!project) {
    console.error("You're not in this project yet. Open the invite link in your browser to accept it, then run this again.");
    process.exit(1);
  }
  const dir = resolve(folder ?? project.name);
  if (existsSync(dir) && readdirSync(dir).length && !argv.includes("--here")) {
    console.error(`${relative(process.cwd(), dir) || "."} isn't empty. Pick another folder, or pass --here to merge into it.`);
    process.exit(1);
  }
  mkdirSync(dir, { recursive: true });
  console.log(`joining ${project.name} → ${dir}`);
  await runSync({ api: deps.api, projectId, dir, seed: "room" });
}

/** `npx tsx src/sync.ts --demo`: the merge rules this file depends on. */
function demo() {
  const eq = (a: unknown, b: unknown, what: string) => {
    if (a !== b) throw new Error(`sync demo: ${what}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
  };
  const base = "function add(a, b) {\n  return a + b;\n}\n\nexport default add;\n";
  const mine = base.replace("return a + b;", "return a + b; // sum");
  const theirs = base.replace("export default add;", "export { add };");
  eq(rebase(base, mine, theirs), theirs.replace("return a + b;", "return a + b; // sum"), "both edits survive");
  eq(rebase(base, mine, base), mine, "no remote change → local");
  eq(rebase(base, base, theirs), theirs, "no local change → remote");
  eq(rebase("aaaa", "aXaaa", "aaaaaaaa"), "aXaaa", "ambiguous context → local wins");
  const d = new Y.Doc();
  const t = d.getText("t");
  t.insert(0, "hello world");
  applyText(t, "hello brave world");
  eq(t.toString(), "hello brave world", "applyText inserts");
  applyText(t, "hello world!");
  eq(t.toString(), "hello world!", "applyText replaces");
  console.log("sync demo ok");
}

if (process.argv[1]?.endsWith("sync.ts") && process.argv[2] === "--demo") demo();
