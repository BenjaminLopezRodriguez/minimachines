import { randomBytes } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";

import { db } from "~/server/db";
import {
  execs as execsTable,
  jobs as jobsTable,
  machineFiles,
  machines as machinesTable,
} from "~/server/db/schema";

import {
  execSandbox,
  modalEnabled,
  writeSandboxFile,
} from "./modal-driver";
import { getMachine } from "./machine-store";

export type ExecResult = {
  id: string;
  machineId: string;
  cmd: string;
  cwd?: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  createdAt: string;
};

export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export type Job = {
  id: string;
  machineId: string;
  ownerUserId: string;
  type: string;
  status: JobStatus;
  input: unknown;
  artifacts: { path: string; contentType?: string }[];
  createdAt: string;
  updatedAt: string;
};

export type SessionStore = {
  execs: ExecResult[];
  files: Record<string, string>;
  jobs: Job[];
};

async function requireOwnedMachine(machineId: string, ownerUserId: string) {
  const machine = await getMachine(machineId, { ownerUserId });
  if (!machine) {
    throw new Error(`Machine not found: ${machineId}`);
  }
  return machine;
}

async function sandboxIdFor(machineId: string): Promise<string | null> {
  const [row] = await db
    .select({ sandboxId: machinesTable.sandboxId })
    .from(machinesTable)
    .where(eq(machinesTable.id, machineId))
    .limit(1);
  return row?.sandboxId ?? null;
}

function normalize(path: string) {
  return path.replace(/^\/+/, "");
}

function shellQuote(s: string) {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export async function execMachine(
  machineId: string,
  input: { cmd: string; cwd?: string; env?: Record<string, string> },
  opts: { ownerUserId: string },
): Promise<ExecResult> {
  await requireOwnedMachine(machineId, opts.ownerUserId);
  const started = Date.now();
  let exitCode = 0;
  let stdout = `[minimachine stub] ran: ${input.cmd}\n`;
  let stderr = "";

  const sandboxId = await sandboxIdFor(machineId);
  if (sandboxId && modalEnabled()) {
    const cwd = input.cwd?.trim() ?? "/workspace";
    const script = `cd ${shellQuote(cwd)} && ${input.cmd}`;
    const result = await execSandbox(sandboxId, [
      "su-exec",
      "agent",
      "sh",
      "-c",
      script,
    ]);
    exitCode = result.exitCode;
    stdout = result.stdout;
    stderr = result.stderr;
  }

  const [row] = await db
    .insert(execsTable)
    .values({
      id: `exec_${randomBytes(4).toString("hex")}`,
      machineId,
      cmd: input.cmd,
      cwd: input.cwd,
      exitCode,
      stdout,
      stderr,
      durationMs: Math.max(1, Date.now() - started),
    })
    .returning();

  if (!row) throw new Error("Failed to record exec");
  return {
    id: row.id,
    machineId: row.machineId,
    cmd: row.cmd,
    cwd: row.cwd ?? undefined,
    exitCode: row.exitCode,
    stdout: row.stdout,
    stderr: row.stderr,
    durationMs: row.durationMs,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function putMachineFile(
  machineId: string,
  path: string,
  content: string | Uint8Array,
  opts: { ownerUserId: string },
): Promise<{ path: string; bytes: number }> {
  await requireOwnedMachine(machineId, opts.ownerUserId);
  const normalized = normalize(path);
  const buf =
    typeof content === "string"
      ? Buffer.from(content, "utf8")
      : Buffer.from(content);

  const sandboxId = await sandboxIdFor(machineId);
  if (sandboxId && modalEnabled()) {
    await writeSandboxFile(sandboxId, normalized, buf);
  }

  await db
    .insert(machineFiles)
    .values({
      machineId,
      path: normalized,
      content: buf.toString("base64"),
      bytes: buf.length,
    })
    .onConflictDoUpdate({
      target: [machineFiles.machineId, machineFiles.path],
      set: {
        content: buf.toString("base64"),
        bytes: buf.length,
        updatedAt: new Date(),
      },
    });

  return { path: normalized, bytes: buf.length };
}

export async function getMachineFile(
  machineId: string,
  path: string,
  opts: { ownerUserId: string },
): Promise<Uint8Array | null> {
  await requireOwnedMachine(machineId, opts.ownerUserId);
  const [row] = await db
    .select({ content: machineFiles.content })
    .from(machineFiles)
    .where(
      and(
        eq(machineFiles.machineId, machineId),
        eq(machineFiles.path, normalize(path)),
      ),
    )
    .limit(1);
  if (!row) return null;
  return new Uint8Array(Buffer.from(row.content, "base64"));
}

export async function createJob(
  machineId: string,
  input: { type: string; input?: unknown; assets?: unknown },
  opts: { ownerUserId: string },
): Promise<Job> {
  await requireOwnedMachine(machineId, opts.ownerUserId);
  const artifacts = [
    {
      path: `artifacts/${input.type}-result.bin`,
      contentType: "application/octet-stream",
    },
  ];
  const [row] = await db
    .insert(jobsTable)
    .values({
      id: `job_${randomBytes(5).toString("hex")}`,
      machineId,
      ownerUserId: opts.ownerUserId,
      type: input.type,
      status: "succeeded",
      input: input.input ?? {},
      artifacts,
    })
    .returning();

  if (!row) throw new Error("Failed to create job");
  return {
    id: row.id,
    machineId: row.machineId,
    ownerUserId: row.ownerUserId,
    type: row.type,
    status: row.status as JobStatus,
    input: row.input,
    artifacts: row.artifacts as Job["artifacts"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getJob(
  id: string,
  opts: { ownerUserId: string },
): Promise<Job | null> {
  const [row] = await db
    .select()
    .from(jobsTable)
    .where(and(eq(jobsTable.id, id), eq(jobsTable.ownerUserId, opts.ownerUserId)))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    machineId: row.machineId,
    ownerUserId: row.ownerUserId,
    type: row.type,
    status: row.status as JobStatus,
    input: row.input,
    artifacts: row.artifacts as Job["artifacts"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type MachineStats = {
  loadPct: number;
  cpuCount: number;
  memUsedMb: number;
  memTotalMb: number;
};

/**
 * Live resource sample from inside the sandbox (1-min load + memory). Returns
 * null when there is no running sandbox to sample (Modal off, or stopped).
 * Cheap enough to poll; one exec per call.
 */
export async function machineStats(
  machineId: string,
  ownerUserId: string,
): Promise<MachineStats | null> {
  // The sandbox sees the HOST's cpu/mem via /proc, not its allocation. Use the
  // machine's allocated cpu/memoryGb as the denominators and only sample live
  // usage from inside, so the graph reflects the machine, not the host.
  const machine = await requireOwnedMachine(machineId, ownerUserId);
  const sandboxId = await sandboxIdFor(machineId);
  if (!sandboxId || !modalEnabled()) return null;

  const { stdout, exitCode } = await execSandbox(sandboxId, [
    "sh",
    "-c",
    "cat /proc/loadavg | awk '{print $1}'; free -m | awk '/Mem:/{print $3}'",
  ]);
  if (exitCode !== 0) return null;

  const [loadLine = "0", memUsedLine = "0"] = stdout.trim().split("\n");
  const load = Number(loadLine) || 0;
  const cpuCount = machine.cpu || 1;
  return {
    loadPct: Math.min(100, Math.round((load / cpuCount) * 100)),
    cpuCount,
    memUsedMb: Number(memUsedLine) || 0,
    memTotalMb: machine.memoryGb * 1024,
  };
}

export async function listJobs(machineId: string, ownerUserId: string) {
  await requireOwnedMachine(machineId, ownerUserId);
  const rows = await db
    .select()
    .from(jobsTable)
    .where(
      and(
        eq(jobsTable.machineId, machineId),
        eq(jobsTable.ownerUserId, ownerUserId),
      ),
    )
    .orderBy(desc(jobsTable.createdAt));
  return rows.map((r) => r.id);
}
