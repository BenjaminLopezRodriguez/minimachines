#!/usr/bin/env node
import { spawn } from "node:child_process";
import { platform } from "node:os";

type Machine = {
  id: string;
  name: string;
  status: string;
  emulatorUrl?: string | null;
  task?: string;
  templateId?: string;
};

type ErrorBody = { error?: { code?: string; message?: string } };

function usage(): never {
  console.error(`Usage:
  minimachines run <machineId>
  mm run <machineId>

Env:
  MINIMACHINE_API_KEY   required (create at https://minimachin.es/dashboard/settings)
  MINIMACHINE_BASE_URL  optional (default https://www.minimachin.es)
`);
  process.exit(1);
}

function baseUrl() {
  return (process.env.MINIMACHINE_BASE_URL ?? "https://www.minimachin.es").replace(
    /\/$/,
    "",
  );
}

function apiKey() {
  const key = process.env.MINIMACHINE_API_KEY?.trim();
  if (!key) {
    console.error(
      "Missing MINIMACHINE_API_KEY. Create one at https://minimachin.es/dashboard/settings",
    );
    process.exit(1);
  }
  return key;
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

async function run(machineId: string) {
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
}

async function main() {
  const [, , cmd, machineId] = process.argv;
  if (cmd === "run" && machineId) {
    await run(machineId);
    return;
  }
  // Support `mm agent run <id>` as shown in the dashboard "agent" preset.
  if (cmd === "agent" && process.argv[3] === "run" && process.argv[4]) {
    await run(process.argv[4]!);
    return;
  }
  usage();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
