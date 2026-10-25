import { env } from "~/env";

export function smsEnabled(): boolean {
  return Boolean(
    env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_MESSAGING_SERVICE_SID,
  );
}

/**
 * Send one SMS through a Twilio Messaging Service (REST, no SDK). The service
 * owns sender numbers, A2P registration and STOP handling. Throws on failure.
 */
export async function sendSms(input: { to: string; body: string }): Promise<void> {
  if (!smsEnabled()) throw new Error("SMS is not configured");
  const sid = env.TWILIO_ACCOUNT_SID!;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${sid}:${env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      To: input.to,
      MessagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID!,
      Body: input.body,
    }),
  });
  if (!res.ok) {
    throw new Error(`Twilio ${res.status}: ${await res.text().catch(() => "")}`);
  }
}
