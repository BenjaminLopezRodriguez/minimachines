import { randomBytes } from "node:crypto";
import { reserveCompute, releaseCompute } from "~/server/lib/compute-guard";

import { and, desc, eq, inArray, or } from "drizzle-orm";

import { env } from "~/env";
import { db } from "~/server/db";
import {
  execs as execsTable,
  machineFiles,
  machines as machinesTable,
  mailbox as mailboxTable,
  pagerEvents as pagerEventsTable,
  projectMembers,
} from "~/server/db/schema";

import { createAgentKey, revokeAgentKey } from "./api-keys";
import type { Machine, MachineStatus } from "./machines";
import {
  modalEnabled,
  provisionMachine,
  terminateMachine,
} from "./modal-driver";
import { machineSecrets } from "./secrets";
import { getTemplate, loadTemplates } from "./templates";

/** Env the in-sandbox agent utilities (pager, exec) need to call back home. */
function agentEnv(machineId: string, secret: string): Record<string, string> {
  return {
    MINIMACHINE_API_KEY: secret,
    MINIMACHINE_BASE_URL: env.APP_BASE_URL ?? "https://www.minimachin.es",
    MM_MACHINE_ID: machineId,
  };
}

type Row = typeof machinesTable.$inferSelect;

/**
 * `read` = owner, or any member/viewer of the machine's project.
 * `write` (exec, files, git, stop, restart, shares) = owner or member.
 * `keyId` adds the calling API key as a principal, for agent viewers.
 */
export type MachineAccess = {
  ownerUserId?: string;
  keyId?: string;
  access?: "read" | "write";
};

export function machineAccess(
  userId: string,
  level: "read" | "write" = "write",
  keyId?: string,
) {
  const roles =
    level === "read" ? ["owner", "member", "viewer"] : ["owner", "member"];
  const principals = keyId ? [userId, `key:${keyId}`] : [userId];
  return or(
    eq(machinesTable.ownerUserId, userId),
    inArray(
      machinesTable.projectId,
      db
        .select({ id: projectMembers.projectId })
        .from(projectMembers)
        .where(
          and(
            inArray(projectMembers.principal, principals),
            inArray(projectMembers.role, roles),
          ),
        ),
    ),
  );
}

function accessWhere(id: string, filter?: MachineAccess) {
  return filter?.ownerUserId
    ? and(
        eq(machinesTable.id, id),
        machineAccess(filter.ownerUserId, filter.access, filter.keyId),
      )
    : eq(machinesTable.id, id);
}

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
  /** Caller must already be a member of this project (checked at the API edge). */
  projectId?: string;
};

export async function listMachines(filter?: MachineAccess): Promise<Machine[]> {
  const rows = filter?.ownerUserId
    ? await db
        .select()
        .from(machinesTable)
        .where(
          machineAccess(
            filter.ownerUserId,
            filter.access ?? "read",
            filter.keyId,
          ),
        )
        .orderBy(desc(machinesTable.createdAt))
    : await db
        .select()
        .from(machinesTable)
        .orderBy(desc(machinesTable.createdAt));
  return rows.map(toMachine);
}

/** Newest machine linked to a project — what the workspace previews. Caller checks membership. */
export async function projectMachine(
  projectId: string,
): Promise<Machine | null> {
  const [row] = await db
    .select()
    .from(machinesTable)
    .where(eq(machinesTable.projectId, projectId))
    .orderBy(desc(machinesTable.createdAt))
    .limit(1);
  return row ? toMachine(row) : null;
}

export async function getMachine(
  id: string,
  filter?: MachineAccess,
): Promise<Machine | null> {
  // Access is filtered in SQL so a wrong owner is indistinguishable from
  // a missing machine — no existence oracle.
  const [row] = await db
    .select()
    .from(machinesTable)
    .where(accessWhere(id, filter))
    .limit(1);
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
  const id = `vm_${short}`;
  if (modalEnabled())
    await reserveCompute(input.ownerUserId, id, false, template.resources);
  let newSandboxId: string | undefined;
  try {
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
    let ports: Record<string, string> | undefined;
    let status: MachineStatus = "running";

    if (modalEnabled()) {
      try {
        // Scoped key so the in-sandbox agent (pager, exec) authenticates as the
        // owner. Only minted when there is an owner to scope to.
        // Provider keys first, so the platform's own vars always win.
        const agent = input.ownerUserId
          ? {
              ...(await machineSecrets(input.ownerUserId)),
              ...agentEnv(id, await createAgentKey(input.ownerUserId, id)),
            }
          : undefined;
        const provisioned = await provisionMachine({
          cpu: template.resources.cpu,
          memoryGb: template.resources.memoryGb,
          dockerfile: template.dockerfile,
          env: agent,
        });
        sandboxId = provisioned.sandboxId;
        newSandboxId = sandboxId;
        emulatorUrl = provisioned.emulatorUrl ?? undefined;
        appUrl = provisioned.appUrl ?? undefined;
        ports = provisioned.ports;
      } catch (err) {
        console.error("[minimachines] Modal provisioning failed", err);
        status = "error";
      }
    }

    const [row] = await db
      .insert(machinesTable)
      .values({
        id,
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
        ports,
        sandboxId,
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
      })
      .returning();

    if (!row) throw new Error("Failed to create machine");
    return toMachine(row);
  } catch (error) {
    if (newSandboxId)
      await terminateMachine(newSandboxId).catch(() => undefined);
    throw error;
  } finally {
    if (modalEnabled()) await releaseCompute(id).catch(() => undefined);
  }
}

export async function stopMachine(
  id: string,
  filter?: MachineAccess,
): Promise<Machine | null> {
  const where = accessWhere(id, filter);
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
      console.error(
        "[minimachines] Modal terminate failed",
        row.sandboxId,
        err,
      );
    }
  }

  // The sandbox is gone; its scoped key must die with it.
  if (row.ownerUserId) {
    await revokeAgentKey(row.ownerUserId, row.id).catch((err) =>
      console.error("[minimachines] revoke agent key failed", row.id, err),
    );
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
  filter?: MachineAccess,
): Promise<Machine | null> {
  const [row] = await db
    .select()
    .from(machinesTable)
    .where(accessWhere(id, filter))
    .limit(1);
  if (!row) return null;
  if (modalEnabled())
    await reserveCompute(row.ownerUserId ?? undefined, id, true, {
      cpu: row.cpu,
      memoryGb: row.memoryGb,
    });
  let newSandboxId: string | undefined;
  try {
    if (row.sandboxId && modalEnabled()) {
      try {
        await terminateMachine(row.sandboxId);
      } catch (err) {
        console.error("[minimachines] restart: terminate failed", err);
      }
    }
    if (row.ownerUserId) {
      await revokeAgentKey(row.ownerUserId, row.id).catch(() => undefined);
    }

    let sandboxId: string | null = null;
    let emulatorUrl: string | null = null;
    let appUrl: string | null = null;
    let ports: Record<string, string> | null = null;
    let status: MachineStatus = "running";
    if (modalEnabled()) {
      try {
        const agent = row.ownerUserId
          ? {
              ...(await machineSecrets(row.ownerUserId)),
              ...agentEnv(
                row.id,
                await createAgentKey(row.ownerUserId, row.id),
              ),
            }
          : undefined;
        const p = await provisionMachine({
          cpu: row.cpu,
          memoryGb: row.memoryGb,
          dockerfile: row.dockerfile ?? undefined,
          env: agent,
        });
        sandboxId = p.sandboxId;
        newSandboxId = sandboxId;
        emulatorUrl = p.emulatorUrl ?? null;
        appUrl = p.appUrl ?? null;
        ports = p.ports;
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
        ports,
        uptime: "0m",
        lastActive: "just now",
      })
      .where(eq(machinesTable.id, row.id))
      .returning();
    return updated ? toMachine(updated) : null;
  } catch (error) {
    if (newSandboxId)
      await terminateMachine(newSandboxId).catch(() => undefined);
    throw error;
  } finally {
    if (modalEnabled()) await releaseCompute(id).catch(() => undefined);
  }
}

/** Terminate the sandbox and delete the machine and its session data. Owner only. */
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
  if (row.ownerUserId) {
    await revokeAgentKey(row.ownerUserId, row.id).catch(() => undefined);
  }

  // No FK cascade — clear session + pager rows explicitly so nothing leaks.
  await db.delete(machineFiles).where(eq(machineFiles.machineId, row.id));
  await db.delete(execsTable).where(eq(execsTable.machineId, row.id));
  await db.delete(mailboxTable).where(eq(mailboxTable.machineId, row.id));
  await db
    .delete(pagerEventsTable)
    .where(eq(pagerEventsTable.machineId, row.id));
  await db.delete(machinesTable).where(eq(machinesTable.id, row.id));
  return true;
}
