import { createHash, randomBytes, randomInt } from "node:crypto";

import { and, count, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "~/server/db";
import { organizationMembers, organizations, projectInvites, projectMembers, projects } from "~/server/db/schema";

import { getOrgRole, type OrgRow, requireOrgAdmin, sharesOrg } from "./orgs";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_CODE_TRIES = 5;
const MAX_CODES_PER_INVITE = 5;
const CODE_COOLDOWN_MS = 60 * 1000;
const MAX_INVITES_PER_DAY = 20;
const MAX_PENDING_PER_PROJECT = 50;
const MAX_PENDING_PER_ORG = 200;

export type Role = "owner" | "member" | "viewer";
export type Channel = "email" | "sms";

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Agent keys join projects under this principal, never as their owner. */
export function keyPrincipal(keyId: string): string {
  return `key:${keyId}`;
}

export type ProjectRow = typeof projects.$inferSelect;
export type InviteRow = typeof projectInvites.$inferSelect;

/** Find-or-create by repo (or by name when there is no repo); the owner is always a member. */
export async function upsertProject(input: {
  ownerUserId: string;
  name: string;
  repoKey?: string;
}): Promise<ProjectRow> {
  const match = input.repoKey
    ? eq(projects.repoKey, input.repoKey)
    : and(eq(projects.name, input.name), isNull(projects.repoKey));
  let [row] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.ownerUserId, input.ownerUserId), match))
    .limit(1);
  if (!row) {
    // Race-safe: a concurrent create hits the unique index, so re-read instead of failing.
    await db
      .insert(projects)
      .values({
        ownerUserId: input.ownerUserId,
        name: input.name,
        repoKey: input.repoKey ?? null,
      })
      .onConflictDoNothing();
    [row] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.ownerUserId, input.ownerUserId), match))
      .orderBy(projects.createdAt)
      .limit(1);
    if (!row) throw new Error("Failed to create project");
  }
  await db
    .insert(projectMembers)
    .values({ projectId: row.id, principal: input.ownerUserId, role: "owner" })
    .onConflictDoNothing();
  return row;
}

/** Projects the user belongs to, with their role in each. */
export async function listProjects(userId: string) {
  return db
    .select({
      id: projects.id,
      name: projects.name,
      repoKey: projects.repoKey,
      ownerUserId: projects.ownerUserId,
      role: projectMembers.role,
    })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(eq(projectMembers.principal, userId))
    .orderBy(desc(projects.createdAt));
}

export async function getProject(projectId: string): Promise<ProjectRow | null> {
  const [row] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  return row ?? null;
}

export async function getRole(
  projectId: string,
  principal: string,
): Promise<Role | null> {
  const [row] = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.principal, principal),
      ),
    )
    .limit(1);
  return (row?.role as Role | undefined) ?? null;
}

async function requireOwner(projectId: string, userId: string) {
  if ((await getRole(projectId, userId)) !== "owner") {
    throw new Error("Only the project owner can do that");
  }
}

function isLive(row: InviteRow): boolean {
  return !row.acceptedAt && !row.revokedAt && row.expiresAt.getTime() > Date.now();
}

export async function listPeople(projectId: string, userId: string) {
  if (!(await getRole(projectId, userId))) throw new Error("Project not found");
  const members = await db
    .select()
    .from(projectMembers)
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(projectMembers.joinedAt);
  const invites = await db
    .select()
    .from(projectInvites)
    .where(eq(projectInvites.projectId, projectId))
    .orderBy(desc(projectInvites.createdAt));
  return {
    members: members.map((m) => ({
      principal: m.principal,
      role: m.role as Role,
      joinedAt: m.joinedAt,
    })),
    pending: invites.filter(isLive).map((i) => ({
      id: i.id,
      channel: i.channel as Channel,
      contact: i.contact,
      role: i.role as Role,
      createdAt: i.createdAt,
      expiresAt: i.expiresAt,
    })),
  };
}

/**
 * Mint one invite per contact. Returns the raw tokens (only hashes are
 * stored); the caller delivers them. A contact with a live invite gets a
 * fresh one and the old link stops working.
 */
export async function createInvites(input: {
  invitedBy: string;
  note?: string;
  contacts: { channel: Channel; contact: string; codeRequired: boolean }[];
} & (
  | { projectId: string; orgId?: undefined; role: "member" | "viewer" }
  | { orgId: string; projectId?: undefined; role: "member" | "admin" }
)): Promise<{ invite: InviteRow; token: string }[]> {
  // Project invites: owner only. Team invites: owner/admin, and only the owner mints admins.
  let target;
  if (input.orgId !== undefined) {
    const mine = await requireOrgAdmin(input.orgId, input.invitedBy);
    if (input.role === "admin" && mine !== "owner") throw new Error("Only the team owner can invite admins");
    target = eq(projectInvites.orgId, input.orgId);
  } else {
    await requireOwner(input.projectId, input.invitedBy);
    target = eq(projectInvites.projectId, input.projectId);
  }
  const maxPending = input.orgId ? MAX_PENDING_PER_ORG : MAX_PENDING_PER_PROJECT;

  const now = Date.now();
  const [sentToday] = await db
    .select({ n: count() })
    .from(projectInvites)
    .where(
      and(
        eq(projectInvites.invitedBy, input.invitedBy),
        gte(projectInvites.createdAt, new Date(now - 24 * 60 * 60 * 1000)),
      ),
    );
  if ((sentToday?.n ?? 0) + input.contacts.length > MAX_INVITES_PER_DAY) {
    throw new Error(`Invite limit reached (${MAX_INVITES_PER_DAY} per day)`);
  }

  const existing = await db.select().from(projectInvites).where(target);
  const live = existing.filter(isLive);
  const contacts = input.contacts.map((c) => ({
    ...c,
    contact: c.channel === "email" ? c.contact.trim().toLowerCase() : c.contact.trim(),
  }));
  const replaced = live.filter((i) => contacts.some((c) => c.contact === i.contact));
  if (live.length - replaced.length + contacts.length > maxPending) {
    throw new Error(`Too many pending invites (${maxPending} max)`);
  }
  if (replaced.length) {
    await db
      .update(projectInvites)
      .set({ revokedAt: new Date() })
      .where(inArray(projectInvites.id, replaced.map((i) => i.id)));
  }

  const out: { invite: InviteRow; token: string }[] = [];
  for (const c of contacts) {
    const token = randomBytes(32).toString("base64url");
    const [invite] = await db
      .insert(projectInvites)
      .values({
        projectId: input.projectId ?? null,
        orgId: input.orgId ?? null,
        tokenHash: hash(token),
        role: input.role,
        channel: c.channel,
        contact: c.contact,
        note: input.note ?? null,
        codeRequired: c.codeRequired,
        invitedBy: input.invitedBy,
        expiresAt: new Date(now + INVITE_TTL_MS),
      })
      .returning();
    if (!invite) throw new Error("Failed to create invite");
    out.push({ invite, token });
  }
  return out;
}

/** For rendering the join page; does not consume anything. */
export type ResolvedInvite =
  | { invite: InviteRow; project: ProjectRow; org: null }
  | { invite: InviteRow; project: null; org: OrgRow };

export async function resolveInvite(token: string): Promise<ResolvedInvite | null> {
  const [row] = await db
    .select({ invite: projectInvites, project: projects, org: organizations })
    .from(projectInvites)
    .leftJoin(projects, eq(projects.id, projectInvites.projectId))
    .leftJoin(organizations, eq(organizations.id, projectInvites.orgId))
    .where(eq(projectInvites.tokenHash, hash(token)))
    .limit(1);
  if (!row || !isLive(row.invite)) return null;
  if (row.project) return { invite: row.invite, project: row.project, org: null };
  if (row.org) return { invite: row.invite, project: null, org: row.org };
  return null; // target was deleted
}

/**
 * Mint a fresh 6-digit join code for the invite's own contact. At most
 * MAX_CODES_PER_INVITE per invite, one per minute — so re-sending can't be
 * used to reset the guess counter forever or to flood the invitee.
 */
export async function issueJoinCode(
  token: string,
): Promise<{ ok: true; code: string; invite: InviteRow } | { ok: false; reason: "invalid" | "cooldown" | "limit" }> {
  const found = await resolveInvite(token);
  if (!found?.invite.codeRequired) return { ok: false, reason: "invalid" };
  const inv = found.invite;
  if (inv.codesSent >= MAX_CODES_PER_INVITE) return { ok: false, reason: "limit" };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const now = new Date();
  // One conditional UPDATE so two concurrent requests can't both pass the limits.
  const [invite] = await db
    .update(projectInvites)
    .set({
      codeHash: hash(`${inv.id}:${code}`),
      codeExpiresAt: new Date(now.getTime() + CODE_TTL_MS),
      codeTries: 0,
      codesSent: sql`${projectInvites.codesSent} + 1`,
      codeSentAt: now,
    })
    .where(
      and(
        eq(projectInvites.id, inv.id),
        lt(projectInvites.codesSent, MAX_CODES_PER_INVITE),
        or(isNull(projectInvites.codeSentAt), lt(projectInvites.codeSentAt, new Date(now.getTime() - CODE_COOLDOWN_MS))),
      ),
    )
    .returning();
  if (invite) return { ok: true, code, invite };
  return { ok: false, reason: inv.codesSent + 1 >= MAX_CODES_PER_INVITE ? "limit" : "cooldown" };
}

export type AcceptResult =
  | { ok: true; projectId: string; role: Role }
  | { ok: true; orgId: string; role: string }
  | { ok: false; reason: "invalid" | "code_required" | "bad_code" | "too_many_tries" };

/**
 * Single-use: the conditional UPDATE on `acceptedAt IS NULL` is the replay
 * guard, so two concurrent accepts cannot both win.
 */
export async function acceptInvite(input: {
  token: string;
  userId: string;
  code?: string;
}): Promise<AcceptResult> {
  const found = await resolveInvite(input.token);
  if (!found) return { ok: false, reason: "invalid" };
  const { invite, org } = found;

  if (invite.codeRequired) {
    if (!input.code || !invite.codeHash) return { ok: false, reason: "code_required" };
    if (invite.codeTries >= MAX_CODE_TRIES) return { ok: false, reason: "too_many_tries" };
    const expired = !invite.codeExpiresAt || invite.codeExpiresAt.getTime() < Date.now();
    if (expired || hash(`${invite.id}:${input.code.trim()}`) !== invite.codeHash) {
      // Atomic increment: parallel guesses can't slip past the cap.
      await db
        .update(projectInvites)
        .set({ codeTries: sql`${projectInvites.codeTries} + 1` })
        .where(and(eq(projectInvites.id, invite.id), lt(projectInvites.codeTries, MAX_CODE_TRIES)));
      return { ok: false, reason: "bad_code" };
    }
  }

  const [won] = await db
    .update(projectInvites)
    .set({ acceptedAt: new Date(), acceptedBy: input.userId })
    .where(
      and(
        eq(projectInvites.id, invite.id),
        isNull(projectInvites.acceptedAt),
        // Re-checked in the same statement as the accept, so a racing guess burst can't win after the cap.
        ...(invite.codeRequired ? [lt(projectInvites.codeTries, MAX_CODE_TRIES)] : []),
      ),
    )
    .returning({ id: projectInvites.id });
  if (!won) return { ok: false, reason: "invalid" };

  if (org) {
    // Joining never downgrades: an existing admin/owner keeps their role.
    const current = await getOrgRole(org.id, input.userId);
    if (!current) {
      await db
        .insert(organizationMembers)
        .values({ orgId: org.id, userId: input.userId, role: invite.role, invitedBy: invite.invitedBy })
        .onConflictDoNothing();
    } else if (current === "member" && invite.role === "admin") {
      await db
        .update(organizationMembers)
        .set({ role: "admin" })
        .where(and(eq(organizationMembers.orgId, org.id), eq(organizationMembers.userId, input.userId)));
    }
    return { ok: true, orgId: org.id, role: current && current !== "member" ? current : invite.role };
  }
  const projectId = found.project.id;

  // Joining never downgrades someone who is already in the project.
  const current = await getRole(projectId, input.userId);
  const role = invite.role as Role;
  if (!current) {
    await db
      .insert(projectMembers)
      .values({
        projectId,
        principal: input.userId,
        role,
        invitedBy: invite.invitedBy,
      })
      .onConflictDoNothing();
  } else if (current === "viewer" && role === "member") {
    await db
      .update(projectMembers)
      .set({ role })
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.principal, input.userId),
        ),
      );
  }
  return { ok: true, projectId, role: current === "owner" ? "owner" : role };
}

export async function revokeInvite(input: {
  projectId: string;
  inviteId: string;
  userId: string;
}): Promise<boolean> {
  await requireOwner(input.projectId, input.userId);
  const rows = await db
    .update(projectInvites)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(projectInvites.id, input.inviteId),
        eq(projectInvites.projectId, input.projectId),
        isNull(projectInvites.acceptedAt),
        isNull(projectInvites.revokedAt),
      ),
    )
    .returning({ id: projectInvites.id });
  return rows.length > 0;
}

/** Give another machine's agent key read-only access (`+ agent:<machine>`). */
export async function addAgentViewer(input: {
  projectId: string;
  userId: string;
  keyId: string;
}): Promise<void> {
  await requireOwner(input.projectId, input.userId);
  await db
    .insert(projectMembers)
    .values({
      projectId: input.projectId,
      principal: keyPrincipal(input.keyId),
      role: "viewer",
      invitedBy: input.userId,
    })
    .onConflictDoNothing();
}

export async function removeMember(input: {
  projectId: string;
  userId: string;
  principal: string;
}): Promise<boolean> {
  await requireOwner(input.projectId, input.userId);
  if (input.principal === input.userId) throw new Error("The owner cannot be removed");
  const rows = await db
    .delete(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, input.projectId),
        eq(projectMembers.principal, input.principal),
      ),
    )
    .returning({ principal: projectMembers.principal });
  return rows.length > 0;
}

/**
 * Add someone who already has an account straight to a project — no invite
 * link or code. Only to people the owner shares a team with, so this can't be
 * used to drop strangers into projects.
 */
export async function addTeammate(input: {
  projectId: string;
  userId: string;
  target: string;
  role: "member" | "viewer";
}): Promise<"added" | "already"> {
  await requireOwner(input.projectId, input.userId);
  if (!(await sharesOrg(input.userId, input.target))) throw new Error("You can only add people from your team");
  const current = await getRole(input.projectId, input.target);
  if (current === "owner" || current === "member" || current === input.role) return "already";
  if (current) {
    await db
      .update(projectMembers)
      .set({ role: input.role })
      .where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.principal, input.target)));
    return "added";
  }
  await db
    .insert(projectMembers)
    .values({ projectId: input.projectId, principal: input.target, role: input.role, invitedBy: input.userId })
    .onConflictDoNothing();
  return "added";
}
