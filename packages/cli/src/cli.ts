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

function usage(): never {
  console.error(`Usage:
  minimachines run <machineId> [--keep-awake] [--lid-closed]
  minimachines login [--no-open] [--paste]
  minimachines logout
  minimachines whoami
  mm run <machineId>

Run flags (macOS):
  --keep-awake   caffeinate the Mac while the console session is open
  --lid-closed   also run with the lid shut + low-power mode (uses sudo,
                 restores your settings on exit)

Env:
  MINIMACHINE_API_KEY   overrides logged-in key (create at https://minimachin.es/dashboard/settings)
  MINIMACHINE_BASE_URL  optional (default https://www.minimachin.es)
`);
  process.exit(1);
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
  const args = process.argv.slice(2);
  const cmd = args[0];

  const keepAwake = args.includes("--keep-awake");
  const lidClosed = args.includes("--lid-closed"); // implies keep-awake
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
  usage();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
