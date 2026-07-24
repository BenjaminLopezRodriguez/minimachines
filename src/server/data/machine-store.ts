import { randomBytes } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";

import { db } from "~/server/db";
import {
  execs as execsTable,
  machineFiles,
  machines as machinesTable,
} from "~/server/db/schema";

import type { Machine, MachineStatus } from "./machines";
import { modalEnabled, provisionMachine, terminateMachine } from "./modal-driver";
import { getTemplate, loadTemplates } from "./templates";

type Row = typeof machinesTable.$inferSelect;

function toMachine(row: Row): Machine {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    agent: row.agent,
    task: row.task,
    status: row.status as MachineStatus,
    region: row.region,
    cpu: row.cpu,
    memoryGb: row.memoryGb,
    uptime: row.uptime,
    lastActive: row.lastActive,
    templateId: row.templateId ?? undefined,
    dockerfile: row.dockerfile ?? undefined,
    emulatorUrl: row.emulatorUrl ?? undefined,
    appUrl: row.appUrl ?? undefined,
    ownerUserId: row.ownerUserId ?? undefined,
  };
}

export type CreateMachineInput = {
  templateId: string;
  name?: string;
  task?: string;
  ownerUserId?: string;
};

export async function listMachines(filter?: {
  ownerUserId?: string;
}): Promise<Machine[]> {
  const rows = filter?.ownerUserId
    ? await db
        .select()
        .from(machinesTable)
        .where(eq(machinesTable.ownerUserId, filter.ownerUserId))
        .orderBy(desc(machinesTable.createdAt))
    : await db
        .select()
        .from(machinesTable)
        .orderBy(desc(machinesTable.createdAt));
  return rows.map(toMachine);
}

export async function getMachine(
  id: string,
  filter?: { ownerUserId?: string },
): Promise<Machine | null> {
  // Ownership is filtered in SQL so a wrong owner is indistinguishable from
  // a missing machine — no existence oracle.
  const where = filter?.ownerUserId
    ? and(
        eq(machinesTable.id, id),
        eq(machinesTable.ownerUserId, filter.ownerUserId),
      )
    : eq(machinesTable.id, id);
  const [row] = await db.select().from(machinesTable).where(where).limit(1);
  return row ? toMachine(row) : null;
}

export async function createMachine(
  input: CreateMachineInput,
): Promise<Machine> {
  const template = getTemplate(input.templateId, loadTemplates());
  if (!template) {
    throw new Error(`Unknown template: ${input.templateId}`);
  }

  const short = randomBytes(3).toString("hex");
  const name = input.name?.trim() ?? `vm-${short.slice(0, 4)}`;
  const task = input.task?.trim() ?? template.summary;
  const agent =
    template.agents.find((a) => a !== "any") ?? template.agents[0] ?? "any";
  const title =
    agent === "any"
      ? `${template.name}: ${task}`
      : `${agent} · ${task}`.slice(0, 80);

  // Provision real compute when Modal is configured. A provisioning failure
  // is recorded as an `error` machine rather than losing the row entirely —
  // the user needs to see that the machine exists and why it is unusable.
  let sandboxId: string | undefined;
  let emulatorUrl: string | undefined;
  let appUrl: string | undefined;
  let status: MachineStatus = "running";

  if (modalEnabled()) {
    try {
      const provisioned = await provisionMachine({
        cpu: template.resources.cpu,
        memoryGb: template.resources.memoryGb,
        dockerfile: template.dockerfile,
      });
      sandboxId = provisioned.sandboxId;
      emulatorUrl = provisioned.emulatorUrl ?? undefined;
      appUrl = provisioned.appUrl ?? undefined;
    } catch (err) {
      console.error("[minimachines] Modal provisioning failed", err);
      status = "error";
    }
  }

  const [row] = await db
    .insert(machinesTable)
    .values({
      id: `vm_${short}`,
      name,
      title,
      agent,
      task,
      status,
      region: modalEnabled() ? "modal" : "us-west-2",
      cpu: template.resources.cpu,
      memoryGb: template.resources.memoryGb,
      uptime: "0m",
      lastActive: "just now",
      templateId: template.id,
      dockerfile: template.dockerfile,
      emulatorUrl,
      appUrl,
      sandboxId,
      ownerUserId: input.ownerUserId,
    })
    .returning();

  if (!row) throw new Error("Failed to create machine");
  return toMachine(row);
}

export async function stopMachine(
  id: string,
  filter?: { ownerUserId?: string },
): Promise<Machine | null> {
  const where = filter?.ownerUserId
    ? and(
        eq(machinesTable.id, id),
        eq(machinesTable.ownerUserId, filter.ownerUserId),
      )
    : eq(machinesTable.id, id);
  // Mark stopped first: the DB is the source of truth the user sees, and a
  // Modal hiccup must not leave a machine looking "running" forever. The
  // console URL is cleared because the tunnel dies with the sandbox.
  const [row] = await db
    .update(machinesTable)
    .set({
      status: "stopped",
      lastActive: "just now",
      emulatorUrl: null,
      appUrl: null,
    })
    .where(where)
    .returning();
  if (!row) return null;

  if (row.sandboxId && modalEnabled()) {
    try {
      await terminateMachine(row.sandboxId);
    } catch (err) {
      // Sandboxes also expire on their own timeout, so a failure here leaks
      // at most one sandbox until then.
      console.error("[minimachines] Modal terminate failed", row.sandboxId, err);
    }
  }

  return toMachine(row);
}

function ownerWhere(id: string, ownerUserId?: string) {
  return ownerUserId
    ? and(eq(machinesTable.id, id), eq(machinesTable.ownerUserId, ownerUserId))
    : eq(machinesTable.id, id);
}

/**
 * Terminate the old sandbox and provision a fresh one, keeping the machine row.
 * The workspace is NOT persisted across a restart — the sandbox is ephemeral,
 * so a restarted machine starts empty.
 */
export async function restartMachine(
  id: string,
  filter?: { ownerUserId?: string },
): Promise<Machine | null> {
  const [row] = await db
    .select()
    .from(machinesTable)
    .where(ownerWhere(id, filter?.ownerUserId))
    .limit(1);
  if (!row) return null;

  if (row.sandboxId && modalEnabled()) {
    try {
      await terminateMachine(row.sandboxId);
    } catch (err) {
      console.error("[minimachines] restart: terminate failed", err);
    }
  }

  let sandboxId: string | null = null;
  let emulatorUrl: string | null = null;
  let appUrl: string | null = null;
  let status: MachineStatus = "running";
  if (modalEnabled()) {
    try {
      const p = await provisionMachine({
        cpu: row.cpu,
        memoryGb: row.memoryGb,
        dockerfile: row.dockerfile ?? undefined,
      });
      sandboxId = p.sandboxId;
      emulatorUrl = p.emulatorUrl ?? null;
      appUrl = p.appUrl ?? null;
    } catch (err) {
      console.error("[minimachines] restart: provision failed", err);
      status = "error";
    }
  }

  const [updated] = await db
    .update(machinesTable)
    .set({
      status,
      sandboxId,
      emulatorUrl,
      appUrl,
      uptime: "0m",
      lastActive: "just now",
    })
    .where(eq(machinesTable.id, row.id))
    .returning();
  return updated ? toMachine(updated) : null;
}

/** Terminate the sandbox and delete the machine and its session data. */
export async function deleteMachine(
  id: string,
  filter?: { ownerUserId?: string },
): Promise<boolean> {
  const [row] = await db
    .select()
    .from(machinesTable)
    .where(ownerWhere(id, filter?.ownerUserId))
    .limit(1);
  if (!row) return false;

  if (row.sandboxId && modalEnabled()) {
    try {
      await terminateMachine(row.sandboxId);
    } catch (err) {
      console.error("[minimachines] delete: terminate failed", err);
    }
  }

  // No FK cascade — clear session rows explicitly so file blobs don't leak.
  await db.delete(machineFiles).where(eq(machineFiles.machineId, row.id));
  await db.delete(execsTable).where(eq(execsTable.machineId, row.id));
  await db.delete(machinesTable).where(eq(machinesTable.id, row.id));
  return true;
}
