import { getWorkOS } from "@workos-inc/authkit-nextjs";

import { env } from "~/env";

import { sendEmail } from "./notify-email";
import type { OrgRow } from "./orgs";
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

/** What the invite is to: a project, or a team. */
export type InviteTarget = { kind: "project"; project: ProjectRow } | { kind: "team"; org: OrgRow };

export function targetName(t: InviteTarget): string {
  return t.kind === "project" ? t.project.name : `the ${t.org.name} team`;
}

export function inviteText(input: {
  inviter: string;
  target: InviteTarget;
  invite: InviteRow;
  url: string;
}): string {
  const t = input.target;
  const what =
    t.kind === "team"
      ? `join ${targetName(t)}`
      : `${input.invite.role === "viewer" ? "view" : "work on"} ${t.project.name}${t.project.repoKey ? ` (${t.project.repoKey})` : ""}`;
  return [
    `${input.inviter} invited you to ${what} on minimachines.`,
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
  target: InviteTarget;
  invite: InviteRow;
  token: string;
}): Promise<Delivery> {
  const message = inviteText({ ...input, url: joinUrl(input.token) });
  if (input.invite.channel === "email") {
    const sent = await sendEmail({
      to: input.invite.contact,
      from: env.INVITE_FROM_EMAIL,
      subject: `${input.inviter} invited you to ${targetName(input.target)}`,
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

/** Tell a teammate they were added to a project directly. Best-effort. */
export async function notifyAdded(input: { inviter: string; project: ProjectRow; userId: string }): Promise<boolean> {
  const { email } = await displayName(input.userId);
  if (!email) return false;
  return sendEmail({
    to: email,
    from: env.INVITE_FROM_EMAIL,
    subject: `${input.inviter} added you to ${input.project.name}`,
    text: `${input.inviter} added you to ${input.project.name} on minimachines.\n\nOpen it: ${BASE}/p/${input.project.id}`,
  }).catch(() => false);
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
