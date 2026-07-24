import { readFileSync } from "node:fs";
import { join } from "node:path";

import { env } from "~/env";

/**
 * Provisions real compute for a machine as a Modal Sandbox.
 *
 * Each sandbox runs ttyd on 7681 behind a Modal-encrypted tunnel, which is
 * what the dashboard's "Open console" link points at. Modal is optional: with
 * no credentials the app still records machines, it just doesn't back them
 * with compute. That keeps local dev and CI working without Modal access.
 *
 * No `server-only` import here: it throws under `node:test`. The SDK is kept
 * out of client bundles by the dynamic `await import("modal")` below plus the
 * `~/server/db` import barrier in the only caller.
 */

export type Provisioned = {
  sandboxId: string;
  emulatorUrl: string | null;
  appUrl: string | null;
};

const APP_NAME = "minimachine";
const TTYD_PORT = 7681;
/** Conventional app port exposed so a server built in the box is viewable. */
const APP_PORT = 3000;

/**
 * Provisioning is off unless explicitly configured, so local dev and tests
 * never spend money by accident.
 *
 * - production: both Modal tokens present in the environment
 * - local: `MODAL_ENABLED=1`, letting the SDK resolve `~/.modal.toml` itself
 */
export function modalEnabled(): boolean {
  if (env.MODAL_TOKEN_ID && env.MODAL_TOKEN_SECRET) return true;
  return process.env.MODAL_ENABLED === "1";
}

/**
 * ttyd + a non-root `agent` user.
 *
 * Modal sandboxes run as root, and Claude Code refuses
 * `--dangerously-skip-permissions` as root, so the shell must drop privileges.
 */
const IMAGE_COMMANDS = [
  "RUN apk add --no-cache ttyd bash python3 git openssh-client su-exec",
  "RUN adduser -D -s /bin/bash agent && mkdir -p /workspace && chown -R agent:agent /workspace",
];

/** ttyd itself runs as root only long enough to hand the TTY to `agent`. */
const TTYD_CMD = [
  "sh",
  "-c",
  `cd /workspace && ttyd -p ${TTYD_PORT} -i 0.0.0.0 -W su-exec agent bash`,
];

const TTYD_URL =
  "https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.x86_64";
const GOSU_URL =
  "https://github.com/tianon/gosu/releases/download/1.17/gosu-amd64";

/**
 * Base-agnostic platform layer appended after a template's own build steps:
 * static `ttyd` (browser console) + `gosu` (drop to a non-root user) + an
 * `agent` user. Static binaries so it works on debian or alpine bases; every
 * step is idempotent, so templates that already create `agent` are fine.
 */
const PLATFORM_COMMANDS = [
  "RUN (command -v curl >/dev/null 2>&1) || (apt-get update && apt-get install -y --no-install-recommends curl ca-certificates) || (apk add --no-cache curl ca-certificates)",
  `RUN curl -fsSL ${TTYD_URL} -o /usr/local/bin/ttyd && chmod 755 /usr/local/bin/ttyd`,
  `RUN curl -fsSL ${GOSU_URL} -o /usr/local/bin/gosu && chmod 755 /usr/local/bin/gosu`,
  "RUN (id agent >/dev/null 2>&1 || useradd -m -s /bin/bash agent || adduser -D -s /bin/bash agent) && mkdir -p /workspace && chown -R agent /workspace",
];

type ImagePlan = { base: string; commands: string[]; command: string[] };

/**
 * Turn a template Dockerfile into a Modal image plan: its `FROM` becomes the
 * base, its body (minus FROM/USER/CMD/ENTRYPOINT) becomes build commands, and
 * the platform layer is appended. The sandbox command backgrounds the
 * template's own CMD (e.g. ollama's serve+pull launcher) then runs ttyd.
 *
 * Returns null — caller falls back to the default image — if the Dockerfile
 * can't be read or copies from local build context (unsupported by Modal).
 */
function planFromDockerfile(dockerfile: string): ImagePlan | null {
  let text: string;
  try {
    text = readFileSync(join(process.cwd(), "templates", dockerfile), "utf8");
  } catch {
    return null;
  }

  const lines = text.split("\n");
  let base = "";
  let startCmd = "";
  const body: string[] = [];

  for (const line of lines) {
    const kw = line.trimStart().split(/\s+/)[0]?.toUpperCase() ?? "";
    const atCol0 = /^[A-Za-z]/.test(line); // instruction, not heredoc body
    if (atCol0 && kw === "FROM") {
      base = line.trim().slice(5).trim();
      continue;
    }
    if (atCol0 && kw === "COPY" && !/--from=/i.test(line)) {
      return null; // local-context COPY: Modal can't build it
    }
    if (atCol0 && (kw === "USER" || kw === "ENTRYPOINT")) continue;
    if (atCol0 && kw === "CMD") {
      const arg = line.trim().slice(3).trim();
      startCmd = arg.startsWith("[")
        ? (JSON.parse(arg) as string[]).join(" ")
        : arg;
      continue;
    }
    body.push(line);
  }

  if (!base) return null;

  // Background the template's launcher (if any), then hand the TTY to `agent`.
  const launch =
    startCmd && !/^(bash|sh)$/.test(startCmd.trim())
      ? `( ${startCmd} >/tmp/mm-start.log 2>&1 & ) ; `
      : "";
  return {
    base,
    commands: [body.join("\n"), ...PLATFORM_COMMANDS],
    command: [
      "sh",
      "-c",
      `${launch}cd /workspace && exec ttyd -p ${TTYD_PORT} -i 0.0.0.0 -W gosu agent bash`,
    ],
  };
}

export async function provisionMachine(opts: {
  cpu: number;
  memoryGb: number;
  /** Template Dockerfile path (manifest `dockerfile`) to build from. */
  dockerfile?: string;
  /** Sandbox lifetime. Modal terminates the sandbox when this elapses. */
  timeoutMs?: number;
}): Promise<Provisioned> {
  // Imported lazily so the SDK is not pulled into builds that never call it.
  const { ModalClient } = await import("modal");
  const client = new ModalClient();

  const app = await client.apps.fromName(APP_NAME, { createIfMissing: true });

  const memoryMiB = Math.max(512, opts.memoryGb * 1024);
  const timeoutMs = opts.timeoutMs ?? 60 * 60 * 1000;
  const mkSandbox = (base: string, commands: string[], command: string[]) =>
    client.sandboxes.create(
      app,
      client.images.fromRegistry(base).dockerfileCommands(commands),
      {
        command,
        encryptedPorts: [TTYD_PORT, APP_PORT],
        cpu: opts.cpu,
        memoryMiB,
        timeoutMs,
      },
    );

  // Build from the template when one is usable; fall back to the proven
  // default image if that image fails to build, so a bad/heavy template
  // Dockerfile degrades to a working generic box instead of a dead machine.
  // The fallback is logged loudly — the machine won't have the template's
  // toolchain, and that must not pass silently.
  const plan = opts.dockerfile ? planFromDockerfile(opts.dockerfile) : null;
  let sandbox;
  if (plan) {
    try {
      sandbox = await mkSandbox(plan.base, plan.commands, plan.command);
    } catch (err) {
      console.error(
        `[minimachines] template image build failed for ${opts.dockerfile}; ` +
          `falling back to the generic image (no template toolchain)`,
        err,
      );
      sandbox = await mkSandbox("node:22-alpine", IMAGE_COMMANDS, TTYD_CMD);
    }
  } else {
    sandbox = await mkSandbox("node:22-alpine", IMAGE_COMMANDS, TTYD_CMD);
  }

  // A sandbox is usable even if the tunnel lookup fails; surface it as a
  // machine without a console rather than failing the whole creation.
  let emulatorUrl: string | null = null;
  let appUrl: string | null = null;
  try {
    const tunnels = await sandbox.tunnels();
    emulatorUrl = tunnels[TTYD_PORT]?.url ?? null;
    appUrl = tunnels[APP_PORT]?.url ?? null;
  } catch {
    /* leave both null */
  }

  return { sandboxId: sandbox.sandboxId, emulatorUrl, appUrl };
}

export async function terminateMachine(sandboxId: string): Promise<void> {
  const { ModalClient } = await import("modal");
  const client = new ModalClient();
  const sandbox = await client.sandboxes.fromId(sandboxId);
  await sandbox.terminate();
}

async function sandboxFromId(sandboxId: string) {
  const { ModalClient } = await import("modal");
  const client = new ModalClient();
  return client.sandboxes.fromId(sandboxId);
}

/** Write a UTF-8 (or binary) file into a running sandbox under `/workspace`. */
export async function writeSandboxFile(
  sandboxId: string,
  relativePath: string,
  content: string | Uint8Array,
): Promise<void> {
  const sandbox = await sandboxFromId(sandboxId);
  const path = relativePath.startsWith("/")
    ? relativePath
    : `/workspace/${relativePath.replace(/^\/+/, "")}`;
  const bytes =
    typeof content === "string"
      ? Buffer.from(content, "utf8")
      : Buffer.from(content);
  const b64 = Buffer.from(bytes).toString("base64");

  const dir = path.slice(0, path.lastIndexOf("/"));
  const script = [
    dir && dir !== "/" ? `mkdir -p ${JSON.stringify(dir)}` : "true",
    `printf '%s' ${JSON.stringify(b64)} | base64 -d > ${JSON.stringify(path)}`,
    `chown agent:agent ${JSON.stringify(path)} || true`,
  ].join(" && ");

  const proc = await sandbox.exec(["sh", "-c", script], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stderr, exitCode] = await Promise.all([
    proc.stderr.readText(),
    proc.wait(),
  ]);
  if (exitCode !== 0) {
    throw new Error(`writeSandboxFile failed (${exitCode}): ${stderr}`);
  }
}

export async function execSandbox(
  sandboxId: string,
  argv: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const sandbox = await sandboxFromId(sandboxId);
  const proc = await sandbox.exec(argv, { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    proc.stdout.readText(),
    proc.stderr.readText(),
    proc.wait(),
  ]);
  return { exitCode, stdout, stderr };
}
