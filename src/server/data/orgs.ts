import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";

import { db } from "~/server/db";
import { organizationMembers, organizations, projectInvites } from "~/server/db/schema";

export type OrgRole = "owner" | "admin" | "member";
export type OrgRow = typeof organizations.$inferSelect;

const MAX_ORGS_PER_USER = 10;

export async function createOrg(input: { userId: string; name: string }): Promise<OrgRow> {
  const mine = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.ownerUserId, input.userId));
  if (mine.length >= MAX_ORGS_PER_USER) throw new Error(`Team limit reached (${MAX_ORGS_PER_USER})`);
  const [org] = await db
    .insert(organizations)
    .values({ name: input.name.trim().slice(0, 80), ownerUserId: input.userId })
    .returning();
  if (!org) throw new Error("Failed to create team");
  await db.insert(organizationMembers).values({ orgId: org.id, userId: input.userId, role: "owner" });
  return org;
}

export async function getOrg(orgId: string): Promise<OrgRow | null> {
  const [row] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  return row ?? null;
}

export async function getOrgRole(orgId: string, userId: string): Promise<OrgRole | null> {
  const [row] = await db
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.orgId, orgId), eq(organizationMembers.userId, userId)))
    .limit(1);
  return (row?.role as OrgRole | undefined) ?? null;
}

/** Owners and admins manage people; only the owner can change admins. */
export async function requireOrgAdmin(orgId: string, userId: string): Promise<OrgRole> {
  const role = await getOrgRole(orgId, userId);
  if (role !== "owner" && role !== "admin") throw new Error("Only team owners and admins can do that");
  return role;
}

/** Teams the user is in, with their role. */
export async function listOrgs(userId: string) {
  return db
    .select({ id: organizations.id, name: organizations.name, role: organizationMembers.role })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.orgId))
    .where(eq(organizationMembers.userId, userId))
    .orderBy(organizations.createdAt);
}

export async function listOrgPeople(orgId: string, userId: string) {
  if (!(await getOrgRole(orgId, userId))) throw new Error("Team not found");
  const members = await db
    .select()
    .from(organizationMembers)
    .where(eq(organizationMembers.orgId, orgId))
    .orderBy(organizationMembers.joinedAt);
  const invites = await db
    .select()
    .from(projectInvites)
    .where(eq(projectInvites.orgId, orgId))
    .orderBy(desc(projectInvites.createdAt));
  const now = Date.now();
  return {
    members: members.map((m) => ({ userId: m.userId, role: m.role as OrgRole, joinedAt: m.joinedAt })),
    pending: invites
      .filter((i) => !i.acceptedAt && !i.revokedAt && i.expiresAt.getTime() > now)
      .map((i) => ({ id: i.id, channel: i.channel, contact: i.contact, role: i.role, expiresAt: i.expiresAt })),
  };
}

export async function setOrgRole(input: {
  orgId: string;
  userId: string;
  target: string;
  role: "admin" | "member";
}): Promise<boolean> {
  const mine = await requireOrgAdmin(input.orgId, input.userId);
  const theirs = await getOrgRole(input.orgId, input.target);
  if (!theirs) return false;
  if (theirs === "owner") throw new Error("The team owner's role can't be changed");
  if (mine !== "owner" && (theirs === "admin" || input.role === "admin")) {
    throw new Error("Only the team owner can change admins");
  }
  await db
    .update(organizationMembers)
    .set({ role: input.role })
    .where(and(eq(organizationMembers.orgId, input.orgId), eq(organizationMembers.userId, input.target)));
  return true;
}

/** Admins remove members; anyone but the owner can leave. */
export async function removeOrgMember(input: { orgId: string; userId: string; target: string }): Promise<boolean> {
  const theirs = await getOrgRole(input.orgId, input.target);
  if (!theirs) return false;
  if (theirs === "owner") throw new Error("The team owner can't be removed");
  if (input.target !== input.userId) {
    const mine = await requireOrgAdmin(input.orgId, input.userId);
    if (theirs === "admin" && mine !== "owner") throw new Error("Only the team owner can remove admins");
  }
  const rows = await db
    .delete(organizationMembers)
    .where(and(eq(organizationMembers.orgId, input.orgId), eq(organizationMembers.userId, input.target)))
    .returning({ userId: organizationMembers.userId });
  return rows.length > 0;
}

/** Everyone who shares a team with the user (not the user), with the team they share. */
export async function listColleagues(userId: string): Promise<{ userId: string; orgId: string; orgName: string }[]> {
  const mine = db
    .select({ id: organizationMembers.orgId })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, userId));
  const rows = await db
    .select({ userId: organizationMembers.userId, orgId: organizations.id, orgName: organizations.name })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.orgId))
    .where(and(inArray(organizationMembers.orgId, mine), ne(organizationMembers.userId, userId)))
    .orderBy(organizationMembers.joinedAt);
  const seen = new Set<string>();
  return rows.filter((r) => !seen.has(r.userId) && seen.add(r.userId));
}

export async function sharesOrg(a: string, b: string): Promise<boolean> {
  return (await listColleagues(a)).some((c) => c.userId === b);
}

export async function revokeOrgInvite(input: { orgId: string; inviteId: string; userId: string }): Promise<boolean> {
  await requireOrgAdmin(input.orgId, input.userId);
  const rows = await db
    .update(projectInvites)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(projectInvites.id, input.inviteId),
        eq(projectInvites.orgId, input.orgId),
        isNull(projectInvites.acceptedAt),
        isNull(projectInvites.revokedAt),
      ),
    )
    .returning({ id: projectInvites.id });
  return rows.length > 0;
}
