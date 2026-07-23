import { randomBytes } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";

import { db } from "~/server/db";
import {
  execs as execsTable,
  jobs as jobsTable,
  machineFiles,
} from "~/server/db/schema";

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
  files: Record<string, string>; // `${machineId}:${path}` → base64
  jobs: Job[];
};

/**
 * Throws unless the machine exists AND belongs to the caller. Ownership is
 * enforced in SQL by getMachine, so a foreign machine is indistinguishable
 * from a missing one.
 */
async function requireOwnedMachine(machineId: string, ownerUserId: string) {
  const machine = await getMachine(machineId, { ownerUserId });
  if (!machine) {
    throw new Error(`Machine not found: ${machineId}`);
  }
  return machine;
}

function normalize(path: string) {
  return path.replace(/^\/+/, "");
}

export async function execMachine(
  machineId: string,
  input: { cmd: string; cwd?: string; env?: Record<string, string> },
  opts: { ownerUserId: string },
): Promise<ExecResult> {
  await requireOwnedMachine(machineId, opts.ownerUserId);
  const [row] = await db
    .insert(execsTable)
    .values({
      id: `exec_${randomBytes(4).toString("hex")}`,
      machineId,
      cmd: input.cmd,
      cwd: input.cwd,
      exitCode: 0,
      stdout: `[minimachine stub] ran: ${input.cmd}\n`,
      stderr: "",
      durationMs: 12,
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
  // Owner is part of the WHERE clause — no existence oracle.
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
