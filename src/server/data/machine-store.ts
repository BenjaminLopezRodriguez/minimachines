import { randomBytes } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";

import { db } from "~/server/db";
import { machines as machinesTable } from "~/server/db/schema";

import type { Machine, MachineStatus } from "./machines";
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

  const [row] = await db
    .insert(machinesTable)
    .values({
      id: `vm_${short}`,
      name,
      title,
      agent,
      task,
      status: "running",
      region: "us-west-2",
      cpu: template.resources.cpu,
      memoryGb: template.resources.memoryGb,
      uptime: "0m",
      lastActive: "just now",
      templateId: template.id,
      dockerfile: template.dockerfile,
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
  const [row] = await db
    .update(machinesTable)
    .set({ status: "stopped", lastActive: "just now" })
    .where(where)
    .returning();
  return row ? toMachine(row) : null;
}
