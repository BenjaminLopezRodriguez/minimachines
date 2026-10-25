import { env } from "~/env";

/**
 * Send a plain-text email via Resend's REST API (no SDK — one fetch).
 * Unset config → logs and returns false (dev no-op). Configured + failure →
 * throws, so the caller can report a send failure.
 */
export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  from?: string;
}): Promise<boolean> {
  const from = input.from ?? env.PAGER_FROM_EMAIL;
  if (!env.RESEND_API_KEY || !from) {
    console.warn("[email] RESEND_API_KEY/from address unset — email not sent", {
      subject: input.subject,
    });
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
    }),
  });
  if (!res.ok) {
    throw new Error(`Email delivery failed (${res.status}).`);
  }
  return true;
}

export async function sendPagerEmail(input: {
  to: string;
  kind: string;
  text: string;
  link: string;
}): Promise<void> {
  const sent = await sendEmail({
    to: input.to,
    subject: `[minimachines] agent ${input.kind}`,
    text: `${input.text}\n\nReply: ${input.link}`,
  });
  if (!sent) throw new Error("Email delivery is not configured.");
}
