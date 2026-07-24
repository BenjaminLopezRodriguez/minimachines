import { env } from "~/env";

/**
 * Send a pager email via Resend's REST API (no SDK — one fetch).
 * Unset config → logs and returns (dev no-op). Configured + failure → throws,
 * so the caller keeps the event and reports a send failure.
 */
export async function sendPagerEmail(input: {
  to: string;
  kind: string;
  text: string;
  link: string;
}): Promise<void> {
  if (!env.RESEND_API_KEY || !env.PAGER_FROM_EMAIL) {
    console.warn("[pager] RESEND_API_KEY/PAGER_FROM_EMAIL unset — email not sent", {
      kind: input.kind,
      link: input.link,
    });
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: env.PAGER_FROM_EMAIL,
      to: input.to,
      subject: `[minimachines] agent ${input.kind}`,
      text: `${input.text}\n\nReply: ${input.link}`,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${await res.text().catch(() => "")}`);
  }
}
