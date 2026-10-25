import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { deliverInvite, displayName, notifyAdded } from "~/server/data/invite-delivery";
import {
  createOrg,
  getOrg,
  listOrgPeople,
  listOrgs,
  removeOrgMember,
  revokeOrgInvite,
  setOrgRole,
} from "~/server/data/orgs";
import { addTeammate, createInvites, getProject, listPeople, listProjects } from "~/server/data/projects";
import { smsEnabled } from "~/server/data/sms";

/** Data-layer permission errors become 403s with their message intact. */
async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw new TRPCError({ code: "FORBIDDEN", message: err instanceof Error ? err.message : "Not allowed" });
  }
}

const Contact = z.union([
  z.object({ email: z.string().trim().email().max(320) }),
  z.object({ phone: z.string().trim().regex(/^\+[1-9]\d{6,14}$/, "Phone must include the country code, e.g. +14155550123") }),
]);

export const orgsRouter = createTRPCRouter({
  /** Every team I'm in, with members (named) and pending invites. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const teams = await listOrgs(ctx.userId);
    return Promise.all(
      teams.map(async (t) => {
        const people = await listOrgPeople(t.id, ctx.userId);
        const members = await Promise.all(
          people.members.map(async (m) => ({ ...m, ...(await displayName(m.userId)), you: m.userId === ctx.userId })),
        );
        return { ...t, members, pending: people.pending };
      }),
    );
  }),

  create: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1).max(80) }))
    .mutation(({ ctx, input }) => guard(() => createOrg({ userId: ctx.userId, name: input.name }))),

  invite: protectedProcedure
    .input(z.object({ orgId: z.string().uuid(), contacts: z.array(Contact).min(1).max(20), role: z.enum(["member", "admin"]).default("member") }))
    .mutation(async ({ ctx, input }) => {
      const org = await getOrg(input.orgId);
      if (!org) throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
      const minted = await guard(() =>
        createInvites({
          orgId: org.id,
          invitedBy: ctx.userId,
          role: input.role,
          contacts: input.contacts.map((c) =>
            "email" in c
              ? { channel: "email" as const, contact: c.email, codeRequired: true }
              : { channel: "sms" as const, contact: c.phone, codeRequired: smsEnabled() },
          ),
        }),
      );
      const inviter = (await displayName(ctx.userId)).name;
      return Promise.all(
        minted.map(async ({ invite, token }) => {
          const delivery = await deliverInvite({ inviter, target: { kind: "team", org }, invite, token }).catch(
            (err: unknown) => ({ status: "failed" as const, error: err instanceof Error ? err.message : "Send failed" }),
          );
          return { contact: invite.contact, ...delivery };
        }),
      );
    }),

  revokeInvite: protectedProcedure
    .input(z.object({ orgId: z.string().uuid(), inviteId: z.string().uuid() }))
    .mutation(({ ctx, input }) => guard(() => revokeOrgInvite({ ...input, userId: ctx.userId }))),

  setRole: protectedProcedure
    .input(z.object({ orgId: z.string().uuid(), userId: z.string().min(1), role: z.enum(["admin", "member"]) }))
    .mutation(({ ctx, input }) => guard(() => setOrgRole({ orgId: input.orgId, userId: ctx.userId, target: input.userId, role: input.role }))),

  remove: protectedProcedure
    .input(z.object({ orgId: z.string().uuid(), userId: z.string().min(1) }))
    .mutation(({ ctx, input }) => guard(() => removeOrgMember({ orgId: input.orgId, userId: ctx.userId, target: input.userId }))),

  /** Projects I own, with who's in each — for the "add a teammate" picker. */
  projects: protectedProcedure.query(async ({ ctx }) => {
    const owned = (await listProjects(ctx.userId)).filter((p) => p.role === "owner");
    return Promise.all(
      owned.map(async (p) => ({
        id: p.id,
        name: p.name,
        repoKey: p.repoKey,
        members: (await listPeople(p.id, ctx.userId)).members.map((m) => ({ principal: m.principal, role: m.role })),
      })),
    );
  }),

  addToProject: protectedProcedure
    .input(z.object({ projectId: z.string().uuid(), userId: z.string().min(1), role: z.enum(["member", "viewer"]).default("member") }))
    .mutation(async ({ ctx, input }) => {
      const project = await getProject(input.projectId);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      const status = await guard(() => addTeammate({ projectId: project.id, userId: ctx.userId, target: input.userId, role: input.role }));
      if (status === "added") await notifyAdded({ inviter: (await displayName(ctx.userId)).name, project, userId: input.userId });
      return { status };
    }),
});
