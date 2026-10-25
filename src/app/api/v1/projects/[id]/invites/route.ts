import { z } from "zod";

import { isApiAuth, requireApiKey } from "~/server/api/v1/auth";
import { jsonError, jsonOk } from "~/server/api/v1/respond";
import { agentKeyIdFor } from "~/server/data/api-keys";
import { deliverInvite, displayName } from "~/server/data/invite-delivery";
import { getMachine } from "~/server/data/machine-store";
import { addAgentViewer, type Channel, createInvites, getProject } from "~/server/data/projects";
import { smsEnabled } from "~/server/data/sms";

type Ctx = { params: Promise<{ id: string }> };

const Contact = z.union([
  z.object({ email: z.string().trim().email().max(320) }),
  z.object({ phone: z.string().trim().regex(/^\+[1-9]\d{6,14}$/, "phone must be E.164, e.g. +14155550123") }),
  z.object({ agentMachineId: z.string().trim().min(1).max(64) }),
]);

/**
 * Invites people (email/phone) or another machine's agent (always viewer).
 * Agent keys are refused outright: a human key must send every message.
 */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireApiKey(request);
  if (!isApiAuth(auth)) return auth;
  if (auth.agent) {
    return jsonError("forbidden", "Agent keys cannot send invites; ask the user to run mm people", 403);
  }
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("validation_error", "Invalid JSON body", 400);
  }
  const parsed = z
    .object({
      contacts: z.array(Contact).min(1).max(20),
      role: z.enum(["member", "viewer"]).default("member"),
      note: z.string().trim().max(280).optional(),
    })
    .safeParse(body);
  if (!parsed.success) {
    return jsonError("validation_error", parsed.error.issues[0]?.message ?? "Invalid body", 400);
  }
  const project = await getProject(id);
  if (!project) return jsonError("project_not_found", "Project not found", 404);

  const results: Record<string, unknown>[] = [];
  try {
    for (const c of parsed.data.contacts) {
      if (!("agentMachineId" in c)) continue;
      // The agent's machine must be one the inviter can act on.
      const machine = await getMachine(c.agentMachineId, { ownerUserId: auth.userId });
      const keyId = machine?.ownerUserId
        ? await agentKeyIdFor(machine.ownerUserId, machine.id)
        : null;
      if (!keyId) {
        results.push({ contact: `agent:${c.agentMachineId}`, status: "failed", error: "No running agent on that machine" });
        continue;
      }
      await addAgentViewer({ projectId: id, userId: auth.userId, keyId });
      results.push({ contact: `agent:${c.agentMachineId}`, status: "added", role: "viewer" });
    }

    const people: { channel: Channel; contact: string; codeRequired: boolean }[] = [];
    for (const c of parsed.data.contacts) {
      if ("email" in c) people.push({ channel: "email", contact: c.email, codeRequired: true });
      // Without Twilio there is no way to send a code, so the link alone joins.
      if ("phone" in c) people.push({ channel: "sms", contact: c.phone, codeRequired: smsEnabled() });
    }
    if (people.length) {
      const minted = await createInvites({
        projectId: id,
        invitedBy: auth.userId,
        role: parsed.data.role,
        note: parsed.data.note,
        contacts: people,
      });
      const inviter = (await displayName(auth.userId)).name;
      for (const { invite, token } of minted) {
        try {
          const delivery = await deliverInvite({ inviter, project, invite, token });
          results.push({ id: invite.id, contact: invite.contact, channel: invite.channel, role: invite.role, ...delivery });
        } catch (err) {
          results.push({
            id: invite.id,
            contact: invite.contact,
            channel: invite.channel,
            status: "failed",
            error: err instanceof Error ? err.message : "Send failed",
          });
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invite failed";
    const status = message.startsWith("Only the project owner") ? 403 : 400;
    return jsonError("invite_error", message, status);
  }
  return jsonOk({ invites: results }, 201);
}
