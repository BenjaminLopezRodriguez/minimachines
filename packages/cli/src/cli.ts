#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

import { CODE_MODEL, codeCommand } from "./code.js";
import { peopleCommand, repoKeyFromRemote } from "./people.js";

type Machine = {
  id: string;
  name: string;
  status: string;
  emulatorUrl?: string | null;
  task?: string;
  templateId?: string;
};

type ErrorBody = { error?: { code?: string; message?: string } };

type Credentials = {
  apiKey: string;
  keyId: string;
  keyPrefix: string;
  baseUrl: string;
  createdAt: string;
};

type DeviceCodeResponse = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  interval: number;
  expires_in: number;
};

type DeviceTokenResponse = {
  api_key: string;
  key_id: string;
  api_key_prefix: string;
  base_url: string;
};

function usage(exitCode = 1): never {
  const print = exitCode === 0 ? console.log : console.error;
  print(`Usage:
  mm                       open the TUI (machines · shares · people); press ? for keys
  mm --no-tui              agents: same data as NDJSON, never interactive. Add --no-tui to any command.
  minimachines skill install [--agent claude|codex|cursor] [--dir <path>] [--print]
  minimachines create <templateId> [--json]
  minimachines exec <machineId> <command...> [--cwd <dir>]
  minimachines put <machineId> <localFile> <remotePath>
  minimachines ask <machineId> <question> [--timeout <sec>]
  minimachines say <machineId> finished|succeeded <text>
  minimachines stop <machineId>
  minimachines run <machineId> [--keep-awake] [--lid-closed]
  minimachines login [--no-open] [--paste]
  minimachines logout
  minimachines whoami
  minimachines --help
  minimachines --version
  minimachines pager set --email you@example.com | --phone +15551234567
  minimachines pager status
  minimachines share create --machine <id> --port <n> [--api|--web] [--public|--gated] [--secret <s>]
  minimachines share --local <port> [--api|--web] [--public|--gated] [--secret <s>]
  minimachines share ls | rm <slug>
  minimachines people [--json] [--project <name>]          people on this repo's project
  minimachines people + <row|email|+phone|agent:<id>>... [--view] [--note <text>] [--yes]
  minimachines people - <row|email|+phone>...              revoke an invite / remove a member
  minimachines tui [--json] [--test]                       dashboard: machines, shares, people (? for keys)
  minimachines code [--machine <id>] [-p <prompt>] [--yes]  coding agent (needs ANTHROPIC_API_KEY)
  mm run <machineId>

Run flags (macOS):
  --keep-awake   caffeinate the Mac while the console session is open
  --lid-closed   also run with the lid shut + low-power mode (uses sudo,
                 restores your settings on exit)

Env:
  MINIMACHINE_API_KEY   overrides logged-in key (create at https://www.minimachin.es/dashboard/settings)
  MINIMACHINE_BASE_URL  optional (default https://www.minimachin.es)
`);
  process.exit(exitCode);
}

// --- credentials file layer -------------------------------------------------

function configDir() {
  const xdg = process.env.XDG_CONFIG_HOME?.trim();
  const base = xdg ? xdg : join(homedir(), ".config");
  return join(base, "minimachines");
}

function credsPath() {
  return join(configDir(), "credentials.json");
}

function readCreds(): Credentials | null {
  try {
    const data = JSON.parse(readFileSync(credsPath(), "utf8")) as Credentials;
    if (data && typeof data.apiKey === "string" && data.apiKey) return data;
    return null;
  } catch {
    return null;
  }
}

function writeCreds(creds: Credentials) {
  mkdirSync(configDir(), { recursive: true });
  writeFileSync(credsPath(), JSON.stringify(creds, null, 2) + "\n", {
    mode: 0o600,
  });
  chmodSync(credsPath(), 0o600);
}

function deleteCreds() {
  try {
    rmSync(credsPath());
  } catch {
    // already gone
  }
}

// --- resolution precedence: env > file > default ----------------------------

function baseUrl() {
  const env = process.env.MINIMACHINE_BASE_URL?.trim();
  if (env) return env.replace(/\/$/, "");
  const creds = readCreds();
  if (creds?.baseUrl) return creds.baseUrl.replace(/\/$/, "");
  return "https://www.minimachin.es";
}

function resolveKey(): { key: string; source: "env" | "file" } | null {
  const env = process.env.MINIMACHINE_API_KEY?.trim();
  if (env) return { key: env, source: "env" };
  const creds = readCreds();
  if (creds?.apiKey) return { key: creds.apiKey, source: "file" };
  return null;
}

function apiKey() {
  const resolved = resolveKey();
  if (!resolved) {
    console.error(
      "Not logged in. Run `minimachines login`, or set MINIMACHINE_API_KEY (https://minimachin.es/dashboard/settings)",
    );
    process.exit(1);
  }
  return resolved.key;
}

// mm_ + first 8 chars after mm_
function keyPrefixOf(key: string) {
  const body = key.startsWith("mm_") ? key.slice(3) : key;
  return body.slice(0, 8);
}

function displayPrefix(key: string) {
  return `mm_${keyPrefixOf(key)}`;
}

async function errorMessage(res: Response): Promise<string> {
  let message = res.statusText || `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as ErrorBody;
    if (body.error?.message) message = body.error.message;
  } catch {
    // ignore
  }
  return message;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function promptLine(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function getMachine(id: string): Promise<Machine> {
  const res = await fetch(
    `${baseUrl()}/api/v1/machines/${encodeURIComponent(id)}`,
    {
      headers: { authorization: `Bearer ${apiKey()}` },
    },
  );
  if (!res.ok) {
    let message = res.statusText || `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as ErrorBody;
      if (body.error?.message) message = body.error.message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  const data = (await res.json()) as { machine: Machine };
  return data.machine;
}

async function openUrl(url: string) {
  // Prefer the `open` package when available (published install).
  try {
    const mod = await import("open");
    await mod.default(url);
    return;
  } catch {
    // fall through
  }

  const cmd =
    platform() === "darwin"
      ? "open"
      : platform() === "win32"
        ? "cmd"
        : "xdg-open";
  const args = platform() === "win32" ? ["/c", "start", "", url] : [url];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", reject);
    child.unref();
    resolve();
  });
}

function pmGet(key: string): string {
  try {
    const out = execFileSync("pmset", ["-g"], { encoding: "utf8" });
    return new RegExp(`^\\s*${key}\\s+(\\d+)`, "m").exec(out)?.[1] ?? "0";
  } catch {
    return "0";
  }
}

/**
 * Keep this Mac awake while a long run is in progress. Returns a cleanup fn.
 *
 * `caffeinate -dimsu` needs no privileges and auto-releases when killed.
 * `--lid-closed` additionally sets `disablesleep` (run with the lid shut) and
 * `lowpowermode` (run cool/quiet) via sudo — the actual agent work happens in
 * the remote sandbox, so throttling this Mac doesn't slow it. Prior pmset
 * values are saved and restored. macOS only; a no-op elsewhere.
 */
function keepAwake(opts: { lidClosed: boolean }): () => void {
  if (platform() !== "darwin") {
    console.error("keep-awake is macOS-only — skipping.");
    return () => {};
  }
  const caf = spawn("caffeinate", ["-dimsu"], { stdio: "ignore" });
  let restore = () => {};

  if (opts.lidClosed) {
    const priorSleep = pmGet("disablesleep");
    const priorLpm = pmGet("lowpowermode");
    console.error("Enabling lid-closed + low-power mode (needs sudo)…");
    try {
      execFileSync(
        "sudo",
        ["pmset", "-a", "disablesleep", "1", "lowpowermode", "1"],
        { stdio: "inherit" },
      );
      restore = () => {
        try {
          execFileSync(
            "sudo",
            ["pmset", "-a", "disablesleep", priorSleep, "lowpowermode", priorLpm],
            { stdio: "inherit" },
          );
        } catch {
          /* best effort */
        }
      };
    } catch {
      console.error("Could not set pmset (sudo declined?) — caffeinate only.");
    }
  }

  return () => {
    try {
      caf.kill();
    } catch {
      /* already gone */
    }
    restore();
  };
}

/** Block until Ctrl-C, then run cleanup. */
function holdUntilInterrupt(stop: () => void) {
  console.log("Keeping this Mac awake. Press Ctrl-C to stop.");
  return new Promise<void>((resolve) => {
    process.on("SIGINT", () => {
      stop();
      console.log("\nReleased.");
      resolve();
    });
  });
}

async function run(
  machineId: string,
  opts: { keepAwake?: boolean; lidClosed?: boolean } = {},
) {
  const machine = await getMachine(machineId);
  console.log(`${machine.id}  ${machine.status}  ${machine.name}`);
  if (machine.task) console.log(`task: ${machine.task}`);

  if (machine.status === "stopped" || machine.status === "error") {
    console.error(`Machine is ${machine.status}; start/create a new one first.`);
    process.exit(1);
  }

  const url = machine.emulatorUrl?.trim();
  if (!url) {
    console.error(
      "No console URL yet. The machine may still be provisioning, or Modal is not configured.",
    );
    process.exit(1);
  }

  console.log(`console: ${url}`);
  console.log("Opening browser console…");
  await openUrl(url);

  // Keep the Mac awake so a long unattended session in the console survives
  // an idle timeout or a closed lid.
  if (opts.keepAwake || opts.lidClosed) {
    const stop = keepAwake({ lidClosed: !!opts.lidClosed });
    await holdUntilInterrupt(stop);
  }
}

// --- auth commands ----------------------------------------------------------

async function chooseLoginMethod(): Promise<
  "browser" | "browser-no-open" | "paste"
> {
  process.stdout.write(
    "\nHow do you want to sign in?\n" +
      "  1) Browser — approve in your dashboard (default)\n" +
      "  2) Use an API key — for agents, CI, or remote/headless\n" +
      "  3) Browser, but show me the link (don't auto-open)\n",
  );
  const answer = (await promptLine("Choice [1]: ")).trim();
  if (answer === "2") return "paste";
  if (answer === "3") return "browser-no-open";
  return "browser";
}

async function loginPaste() {
  const key = (await promptLine("Paste your mm_ API key: ")).trim();
  if (!key) {
    console.error("No key provided.");
    process.exit(1);
  }
  const base = baseUrl();
  const res = await fetch(`${base}/api/v1/machines`, {
    headers: { authorization: `Bearer ${key}` },
  });
  if (res.status === 401) {
    console.error("Key rejected (401). Not saved.");
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`Could not validate key: ${await errorMessage(res)}`);
    process.exit(1);
  }
  writeCreds({
    apiKey: key,
    keyId: "",
    keyPrefix: keyPrefixOf(key),
    baseUrl: base,
    createdAt: new Date().toISOString(),
  });
  console.log(`Logged in (key ${displayPrefix(key)}…)`);
}

async function loginDevice(noOpen: boolean) {
  const base = baseUrl();
  const codeRes = await fetch(`${base}/api/v1/auth/device/code`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (!codeRes.ok) {
    throw new Error(await errorMessage(codeRes));
  }
  const dc = (await codeRes.json()) as DeviceCodeResponse;

  console.log("");
  console.log(`  Your code:  ${dc.user_code}`);
  console.log("");
  console.log(`Go to: ${dc.verification_uri}`);
  console.log("and enter the code above.");
  if (!noOpen) {
    console.log("Opening browser…");
    await openUrl(dc.verification_uri_complete);
  }
  console.log("Waiting for approval…");

  const intervalMs = Math.max(1, dc.interval || 5) * 1000;
  const deadline = Date.now() + (dc.expires_in || 900) * 1000;

  while (Date.now() < deadline) {
    await sleep(intervalMs);
    const tokRes = await fetch(`${base}/api/v1/auth/device/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device_code: dc.device_code }),
    });
    if (tokRes.ok) {
      const tok = (await tokRes.json()) as DeviceTokenResponse;
      writeCreds({
        apiKey: tok.api_key,
        keyId: tok.key_id ?? "",
        keyPrefix: tok.api_key_prefix || keyPrefixOf(tok.api_key),
        baseUrl: (tok.base_url || base).replace(/\/$/, ""),
        createdAt: new Date().toISOString(),
      });
      console.log(`Logged in (key ${displayPrefix(tok.api_key)}…)`);
      return;
    }
    const body = (await tokRes.json().catch(() => ({}))) as ErrorBody;
    const code = body.error?.code;
    if (code === "authorization_pending") continue;
    if (code === "access_denied") {
      console.error("Denied.");
      process.exit(1);
    }
    if (code === "expired_token") {
      console.error("Code expired, run login again.");
      process.exit(1);
    }
    console.error(body.error?.message || code || `HTTP ${tokRes.status}`);
    process.exit(1);
  }
  console.error("Code expired, run login again.");
  process.exit(1);
}

async function logout() {
  const creds = readCreds();
  if (creds?.apiKey) {
    const base = creds.baseUrl?.replace(/\/$/, "") || baseUrl();
    try {
      await fetch(`${base}/api/v1/auth/logout`, {
        method: "POST",
        headers: { authorization: `Bearer ${creds.apiKey}` },
      });
    } catch {
      // best-effort; ignore network failure
    }
  }
  deleteCreds();
  console.log("Logged out.");
}

// --- skill install ----------------------------------------------------------

/**
 * The skill doc ships inside the package rather than being fetched, so the
 * instructions an agent reads always match the commands this CLI actually has.
 */
function skillSource() {
  return readFileSync(new URL("../skill/SKILL.md", import.meta.url), "utf8");
}

/** Where each known agent looks for skills. `--dir` covers everything else. */
const SKILL_TARGETS: Record<string, string> = {
  claude: join(homedir(), ".claude", "skills", "minimachine", "SKILL.md"),
  codex: join(homedir(), ".codex", "skills", "minimachine", "SKILL.md"),
  cursor: join(homedir(), ".cursor", "rules", "minimachine.md"),
};

function skillInstall(opts: { agent?: string; dir?: string; print?: boolean }) {
  const doc = skillSource();
  if (opts.print) {
    process.stdout.write(doc);
    return;
  }
  const target = opts.dir
    ? join(opts.dir, "SKILL.md")
    : SKILL_TARGETS[opts.agent ?? "claude"];
  if (!target) {
    console.error(
      `Unknown agent "${opts.agent}". Known: ${Object.keys(SKILL_TARGETS).join(", ")} — or use --dir <path> / --print.`,
    );
    process.exit(1);
  }
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, doc);
  console.log(`Installed minimachine skill -> ${target}`);
  console.log("Restart your agent session to pick it up.");
}

// --- machine commands -------------------------------------------------------

/** Every API call goes through here: one auth path. Throws on a non-2xx. */
async function apiOrThrow(method: string, path: string, body?: unknown) {
  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${apiKey()}`,
      ...(body === undefined || body instanceof Uint8Array
        ? {}
        : { "content-type": "application/json" }),
    },
    body:
      body === undefined
        ? undefined
        : body instanceof Uint8Array
          ? (body as unknown as BodyInit) // raw bytes: file upload
          : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res;
}

/** CLI commands: print the API's error and exit non-zero. */
async function api(method: string, path: string, body?: unknown) {
  try {
    return await apiOrThrow(method, path, body);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

/** This repo's project, if one exists already (never creates one). */
async function currentProjectId(): Promise<string | undefined> {
  let remote: string;
  try {
    remote = execFileSync("git", ["remote", "get-url", "origin"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
  const key = repoKeyFromRemote(remote);
  if (!key) return undefined;
  const res = await apiOrThrow("GET", "/api/v1/projects").catch(() => null);
  if (!res) return undefined;
  const { projects } = (await res.json()) as { projects: { id: string; repoKey: string | null; role: string }[] };
  return projects.find((p) => p.repoKey === key && p.role !== "viewer")?.id;
}

const mpath = (id: string, tail = "") =>
  `/api/v1/machines/${encodeURIComponent(id)}${tail}`;

async function machineCreate(templateId: string, json: boolean) {
  const res = await api("POST", "/api/v1/machines", { templateId, projectId: await currentProjectId() });
  const { machine } = (await res.json()) as { machine: Machine & { appUrl?: string } };
  if (json) {
    console.log(JSON.stringify(machine, null, 2));
    return;
  }
  console.log(machine.id);
  if (machine.appUrl) console.log(machine.appUrl);
}

async function machineExec(id: string, cmd: string, cwd?: string) {
  const res = await api("POST", mpath(id, "/exec"), { cmd, cwd });
  const { exec } = (await res.json()) as {
    exec: { stdout: string; stderr: string; exitCode: number };
  };
  if (exec.stdout) process.stdout.write(exec.stdout);
  if (exec.stderr) process.stderr.write(exec.stderr);
  // Mirror the remote exit code so `&&` chains and CI behave locally.
  process.exit(exec.exitCode);
}

async function machinePut(id: string, localPath: string, remotePath: string) {
  const bytes = new Uint8Array(readFileSync(localPath));
  // The API roots every file under /workspace, so `/workspace/app/x`,
  // `workspace/app/x` and `app/x` must all mean the same place — otherwise the
  // obvious spelling silently lands in /workspace/workspace/app/x.
  const clean = remotePath.replace(/^\/+/, "").replace(/^workspace\/+/, "");
  await api("PUT", mpath(id, `/files/${clean.split("/").map(encodeURIComponent).join("/")}`), bytes);
  console.log(`${localPath} -> /workspace/${clean} (${bytes.length}b)`);
}

async function machineNotify(id: string, kind: string, text: string) {
  await api("POST", mpath(id, "/notify"), { kind, text });
}

/**
 * Ask the user and block on their phone reply — this is the approval path.
 * Agents call this instead of stopping in a terminal the user isn't watching.
 */
async function machineAsk(id: string, text: string, timeoutSec: number) {
  await machineNotify(id, "question", text);
  const deadline = Date.now() + timeoutSec * 1000;
  while (Date.now() < deadline) {
    const res = await api("GET", mpath(id, "/mailbox"));
    const { replies } = (await res.json()) as { replies: { text?: string }[] };
    const reply = replies.find((r) => r.text);
    if (reply?.text) {
      console.log(reply.text);
      return;
    }
    await sleep(3000);
  }
  console.error(`No reply within ${timeoutSec}s.`);
  process.exit(2);
}

async function machineStop(id: string) {
  await api("POST", mpath(id, "/stop"));
  console.log(`${id} stopped.`);
}

// --- pager commands ---------------------------------------------------------

async function pagerSet(email?: string, phone?: string) {
  if (!email && !phone) {
    console.error("Provide --email or --phone.");
    process.exit(1);
  }
  const res = await fetch(`${baseUrl()}/api/v1/pager/contact`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${apiKey()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, phone }),
  });
  if (!res.ok) {
    console.error(`Could not save contact: ${await errorMessage(res)}`);
    process.exit(1);
  }
  console.log("Pager contact saved. Your agents can now page you.");
}

async function pagerStatus() {
  const res = await fetch(`${baseUrl()}/api/v1/pager/contact`, {
    headers: { authorization: `Bearer ${apiKey()}` },
  });
  if (!res.ok) {
    console.error(await errorMessage(res));
    process.exit(1);
  }
  const { contact } = (await res.json()) as {
    contact: { email?: string | null; phone?: string | null } | null;
  };
  if (!contact) {
    console.log(
      "Pager: off (no contact). Add one: mm pager set --email you@example.com",
    );
    return;
  }
  console.log(
    `Pager: on   email=${contact.email ?? "-"}   phone=${contact.phone ?? "-"}`,
  );
}

// --- share commands ---------------------------------------------------------

type ShareBody = {
  originKind: "machine" | "local";
  machineId?: string;
  port?: number;
  localUrl?: string;
  kind: "api" | "website";
  access: "public" | "gated";
  secret?: string;
  label?: string;
};

async function shareApi(method: string, path: string, body?: unknown) {
  return fetch(`${baseUrl()}${path}`, {
    method,
    headers: { authorization: `Bearer ${apiKey()}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function shareCreate(body: ShareBody) {
  if (body.access === "gated" && !body.secret) {
    console.error("Gated share needs --secret <password>.");
    process.exit(1);
  }
  const res = await shareApi("POST", "/api/v1/shares", body);
  if (!res.ok) {
    console.error(`Share failed: ${await errorMessage(res)}`);
    process.exit(1);
  }
  const { share } = (await res.json()) as { share: { url: string } };
  console.log(share.url);
}

async function shareLocal(port: number, rest: Omit<ShareBody, "originKind" | "port" | "machineId">) {
  if (!port) {
    console.error("Usage: mm share --local <port>");
    process.exit(1);
  }
  if (rest.access === "gated" && !rest.secret) {
    console.error("Gated share needs --secret <password>.");
    process.exit(1);
  }
  const cf = spawn("cloudflared", ["tunnel", "--url", `http://localhost:${port}`], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  cf.on("error", () => {
    console.error("cloudflared not found. Install: https://developers.cloudflare.com/cloudflared/");
    process.exit(1);
  });
  const url = await new Promise<string>((resolve) => {
    const scan = (buf: Buffer) => {
      const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(buf.toString());
      if (m) resolve(m[0]);
    };
    cf.stdout.on("data", scan);
    cf.stderr.on("data", scan);
    setTimeout(() => resolve(""), 30000);
  });
  if (!url) {
    console.error("Timed out waiting for the cloudflared URL.");
    cf.kill();
    process.exit(1);
  }
  const res = await shareApi("POST", "/api/v1/shares", {
    originKind: "local",
    localUrl: url,
    ...rest,
  });
  if (!res.ok) {
    console.error(`Share failed: ${await errorMessage(res)}`);
    cf.kill();
    process.exit(1);
  }
  const { share } = (await res.json()) as { share: { url: string } };
  console.log(`\nlocalhost:${port} → ${share.url}`);
  console.log("Tunnel live. Ctrl-C to stop.\n");
  process.on("SIGINT", () => {
    cf.kill();
    process.exit(0);
  });
  await new Promise<void>(() => {}); // hold until Ctrl-C
}

async function shareList() {
  const res = await shareApi("GET", "/api/v1/shares");
  if (!res.ok) {
    console.error(await errorMessage(res));
    process.exit(1);
  }
  const { shares } = (await res.json()) as {
    shares: { slug: string; url: string; label: string; access: string; enabled: boolean }[];
  };
  if (!shares.length) {
    console.log("No shares. Create one: mm share create --machine <id> --port <n>");
    return;
  }
  for (const s of shares) {
    console.log(`${s.enabled ? "on " : "off"}  ${s.url}  ${s.access}  ${s.label || ""}`);
  }
}

async function shareRemove(slug?: string) {
  if (!slug) {
    console.error("Usage: mm share rm <slug>");
    process.exit(1);
  }
  const res = await shareApi("DELETE", `/api/v1/shares/${encodeURIComponent(slug)}`);
  if (!res.ok) {
    console.error(await errorMessage(res));
    process.exit(1);
  }
  console.log("Revoked.");
}

function whoami() {
  const resolved = resolveKey();
  if (!resolved) {
    console.error("Not logged in.");
    process.exit(1);
  }
  console.log(`source: ${resolved.source}`);
  console.log(`key:    ${displayPrefix(resolved.key)}…`);
  console.log(`base:   ${baseUrl()}`);
}

async function main() {
  // `--no-tui` marks an agent caller: never open the TUI or any other interactive UI for it.
  const raw = process.argv.slice(2);
  const agent = raw.includes("--no-tui");
  const args = raw.filter((a) => a !== "--no-tui");
  const cmd = args[0];
  const tuiDeps = () => ({
    api: apiOrThrow,
    openUrl,
    code: (machineId?: string, prompt?: string) =>
      codeCommand(
        [...(machineId ? ["--machine", machineId] : []), ...(prompt ? ["--initial", prompt] : [])],
        { api: apiOrThrow },
      ),
    info: {
      version: (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version,
      host: new URL(baseUrl()).host,
      model: CODE_MODEL,
    },
  });

  // Bare `mm`: a person at a terminal gets the TUI; an agent (`mm --no-tui`) gets
  // the same data as NDJSON. Not logged in, or piped without the flag → usage.
  if (!cmd && resolveKey() && (agent || (process.stdin.isTTY && process.stdout.isTTY))) {
    // Loaded lazily: Ink needs Node 22+, the rest of the CLI runs on 20.
    const { tuiCommand } = await import("./tui.js");
    await tuiCommand(agent ? ["--json"] : [], tuiDeps());
    return;
  }
  // First-run discovery must work before login, including in non-interactive shells.
  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") usage(0);
  if (cmd === "--version" || cmd === "-v") {
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    console.log(pkg.version);
    return;
  }

  const keepAwake = args.includes("--keep-awake");
  const lidClosed = args.includes("--lid-closed"); // implies keep-awake

  // Flag value + the positional args with all flags stripped, so a command
  // string can contain anything without being eaten by the flag parser.
  const flagOf = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const positional = (() => {
    const out: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i]!;
      if (!a.startsWith("--")) {
        out.push(a);
        continue;
      }
      // Flags that take a value: skip the value so it never lands in a command.
      if (["--cwd", "--timeout", "--agent", "--dir"].includes(a)) i++;
    }
    return out;
  })();

  if (cmd === "people") {
    await peopleCommand(args.slice(1), { api, openUrl });
    return;
  }
  if (cmd === "code") {
    // The agent loop keeps running after a failed call, so it gets the throwing variant.
    await codeCommand(args.slice(1), { api: apiOrThrow });
    return;
  }
  if (cmd === "tui") {
    const { tuiCommand } = await import("./tui.js");
    await tuiCommand(agent ? ["--json", ...args.slice(1)] : args.slice(1), tuiDeps());
    return;
  }
  if (cmd === "skill") {
    if (args[1] && args[1] !== "install" && !args[1].startsWith("--")) {
      console.error("Usage: mm skill install [--agent claude|codex|cursor] [--dir <path>] [--print]");
      process.exit(1);
    }
    skillInstall({
      agent: flagOf("--agent"),
      dir: flagOf("--dir"),
      print: args.includes("--print"),
    });
    return;
  }
  if (cmd === "create" && positional[1]) {
    await machineCreate(positional[1], args.includes("--json"));
    return;
  }
  if (cmd === "exec" && positional[1] && positional[2]) {
    // Join the rest so `mm exec id npm run build` works unquoted too.
    await machineExec(positional[1], positional.slice(2).join(" "), flagOf("--cwd"));
    return;
  }
  if (cmd === "put" && positional[3]) {
    await machinePut(positional[1]!, positional[2]!, positional[3]);
    return;
  }
  if (cmd === "ask" && positional[2]) {
    await machineAsk(
      positional[1]!,
      positional.slice(2).join(" "),
      Number(flagOf("--timeout") ?? 300),
    );
    return;
  }
  if (cmd === "say" && positional[3]) {
    const kind = positional[2]!;
    if (kind !== "finished" && kind !== "succeeded") {
      console.error("say kind must be finished|succeeded (use `ask` for questions)");
      process.exit(1);
    }
    await machineNotify(positional[1]!, kind, positional.slice(3).join(" "));
    return;
  }
  if (cmd === "stop" && positional[1]) {
    await machineStop(positional[1]);
    return;
  }
  if (cmd === "run" && args[1] && !args[1].startsWith("-")) {
    await run(args[1], { keepAwake, lidClosed });
    return;
  }
  // Support `mm agent run <id>` as shown in the dashboard "agent" preset.
  if (cmd === "agent" && args[1] === "run" && args[2]) {
    await run(args[2], { keepAwake, lidClosed });
    return;
  }
  if (cmd === "login") {
    const rest = args.slice(1);
    // Explicit flags win — agents and scripts skip the prompt.
    if (rest.includes("--paste")) {
      await loginPaste();
    } else if (rest.includes("--no-open")) {
      await loginDevice(true);
    } else if (process.stdin.isTTY) {
      // Interactive human: let them choose. Non-TTY falls through to the
      // browser device flow (default) so piped/agent use is unchanged.
      const choice = await chooseLoginMethod();
      if (choice === "paste") await loginPaste();
      else await loginDevice(choice === "browser-no-open");
    } else {
      await loginDevice(false);
    }
    return;
  }
  if (cmd === "logout") {
    await logout();
    return;
  }
  if (cmd === "whoami") {
    whoami();
    return;
  }
  if (cmd === "pager") {
    const flag = (name: string) => {
      const i = args.indexOf(name);
      return i >= 0 ? args[i + 1] : undefined;
    };
    if (args[1] === "set") {
      await pagerSet(flag("--email"), flag("--phone"));
      return;
    }
    if (args[1] === "status") {
      await pagerStatus();
      return;
    }
    console.error(
      "Usage: mm pager set --email you@example.com | mm pager status",
    );
    process.exit(1);
  }
  if (cmd === "share") {
    const flag = (name: string) => {
      const i = args.indexOf(name);
      return i >= 0 ? args[i + 1] : undefined;
    };
    const has = (name: string) => args.includes(name);
    const kind = has("--api") ? "api" : "website";
    const access = has("--gated") ? "gated" : "public";
    const secret = flag("--secret");
    const label = flag("--label");
    if (has("--local")) {
      await shareLocal(Number(flag("--local")), { kind, access, secret, label });
      return;
    }
    if (args[1] === "create") {
      const machineId = flag("--machine");
      const port = Number(flag("--port"));
      if (!machineId || !port) {
        console.error("share create needs --machine <id> --port <n>");
        process.exit(1);
      }
      await shareCreate({ originKind: "machine", machineId, port, kind, access, secret, label });
      return;
    }
    if (args[1] === "ls") {
      await shareList();
      return;
    }
    if (args[1] === "rm") {
      await shareRemove(args[2]);
      return;
    }
    console.error(
      "Usage: mm share create --machine <id> --port <n> | --local <port> | ls | rm <slug>",
    );
    process.exit(1);
  }
  // Distinguish an unknown command from a known one missing its args, so a
  // user on an older CLI learns to upgrade instead of re-reading usage.
  const known = [
    "run", "agent", "login", "logout", "whoami", "pager", "share",
    "create", "exec", "put", "ask", "say", "stop", "skill", "people", "code", "tui",
  ];
  if (cmd && !known.includes(cmd)) {
    console.error(
      `Unknown command "${cmd}". If a guide told you to run it, your CLI may ` +
        `be out of date:\n  npm i -g @minimachines/cli@latest\n`,
    );
  }
  usage();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
