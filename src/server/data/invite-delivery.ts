import { getWorkOS } from "@workos-inc/authkit-nextjs";

import { env } from "~/env";

import { sendEmail } from "./notify-email";
import type { InviteRow, ProjectRow } from "./projects";
import { sendSms, smsEnabled } from "./sms";

const BASE = (env.APP_BASE_URL ?? "https://www.minimachin.es").replace(/\/$/, "");

export function joinUrl(token: string): string {
  return `${BASE}/join/${token}`;
}

/** Display name for a WorkOS user; never fails the caller. */
export async function displayName(userId: string): Promise<{ name: string; email: string | null }> {
  try {
    const u = await getWorkOS().userManagement.getUser(userId);
    const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
    return { name: name || u.email, email: u.email };
  } catch {
    return { name: "A teammate", email: null };
  }
}

export function inviteText(input: {
  inviter: string;
  project: ProjectRow;
  invite: InviteRow;
  url: string;
}): string {
  const where = input.project.repoKey ? ` (${input.project.repoKey})` : "";
  const access = input.invite.role === "viewer" ? "view" : "work on";
  return [
    `${input.inviter} invited you to ${access} ${input.project.name}${where} on minimachines.`,
    input.invite.note ? `\n"${input.invite.note}"` : "",
    `\nJoin: ${input.url}`,
    `This link works once and expires ${input.invite.expiresAt.toDateString()}.`,
    `Ignore this if you don't know ${input.inviter}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export type Delivery = { status: "sent" } | { status: "handoff"; message: string };

/**
 * Email always goes from the server. SMS goes through Twilio when configured;
 * otherwise the message is handed back for the CLI to open in Messages.
 */
export async function deliverInvite(input: {
  inviter: string;
  project: ProjectRow;
  invite: InviteRow;
  token: string;
}): Promise<Delivery> {
  const message = inviteText({ ...input, url: joinUrl(input.token) });
  if (input.invite.channel === "email") {
    const sent = await sendEmail({
      to: input.invite.contact,
      from: env.INVITE_FROM_EMAIL,
      subject: `${input.inviter} invited you to ${input.project.name}`,
      text: message,
    });
    return sent ? { status: "sent" } : { status: "handoff", message };
  }
  if (smsEnabled()) {
    await sendSms({ to: input.invite.contact, body: message });
    return { status: "sent" };
  }
  return { status: "handoff", message };
}

export async function deliverCode(invite: InviteRow, code: string): Promise<boolean> {
  const body = `Your minimachines join code is ${code}. It expires in 10 minutes.`;
  if (invite.channel === "email") {
    return sendEmail({
      to: invite.contact,
      from: env.INVITE_FROM_EMAIL,
      subject: `Your join code: ${code}`,
      text: body,
    });
  }
  if (!smsEnabled()) return false;
  await sendSms({ to: invite.contact, body });
  return true;
}
