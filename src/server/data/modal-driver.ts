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
};

const APP_NAME = "minimachine";
const TTYD_PORT = 7681;

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

export async function provisionMachine(opts: {
  cpu: number;
  memoryGb: number;
  /** Sandbox lifetime. Modal terminates the sandbox when this elapses. */
  timeoutMs?: number;
}): Promise<Provisioned> {
  // Imported lazily so the SDK is not pulled into builds that never call it.
  const { ModalClient } = await import("modal");
  const client = new ModalClient();

  const app = await client.apps.fromName(APP_NAME, { createIfMissing: true });
  // Not a promise — `dockerfileCommands` returns the Image builder itself.
  const image = client.images
    .fromRegistry("node:22-alpine")
    .dockerfileCommands(IMAGE_COMMANDS);

  const sandbox = await client.sandboxes.create(app, image, {
    command: TTYD_CMD,
    encryptedPorts: [TTYD_PORT],
    cpu: opts.cpu,
    memoryMiB: Math.max(512, opts.memoryGb * 1024),
    timeoutMs: opts.timeoutMs ?? 60 * 60 * 1000,
  });

  // A sandbox is usable even if the tunnel lookup fails; surface it as a
  // machine without a console rather than failing the whole creation.
  let emulatorUrl: string | null = null;
  try {
    const tunnels = await sandbox.tunnels();
    emulatorUrl = tunnels[TTYD_PORT]?.url ?? null;
  } catch {
    emulatorUrl = null;
  }

  return { sandboxId: sandbox.sandboxId, emulatorUrl };
}

export async function terminateMachine(sandboxId: string): Promise<void> {
  const { ModalClient } = await import("modal");
  const client = new ModalClient();
  const sandbox = await client.sandboxes.fromId(sandboxId);
  await sandbox.terminate();
}
