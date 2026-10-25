import {
  enforceRateLimit,
  RequestLimitError,
} from "~/server/lib/distributed-rate-limit";
import { z } from "zod";

import { env } from "~/env";
import { isApiAuth, requireApiKey } from "~/server/api/v1/auth";
import { jsonError, jsonOk } from "~/server/api/v1/respond";
import { getMachine } from "~/server/data/machine-store";
import { sendPagerEmail } from "~/server/data/notify-email";
import { createEvent, getContact } from "~/server/data/pager";
import { listSubscriptions, sendPush } from "~/server/data/push";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireApiKey(request);
  if (!isApiAuth(auth)) return auth;
  const { id } = await ctx.params;

  // Owner-scoped: a wrong owner is a 404, no existence oracle.
  const machine = await getMachine(id, { ownerUserId: auth.userId });
  if (!machine) return jsonError("machine_not_found", "Machine not found", 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("validation_error", "Invalid JSON body", 400);
  }
  const parsed = z
    .object({
      kind: z.enum(["question", "finished", "succeeded"]),
      text: z.string().min(1).max(2000),
    })
    .safeParse(body);
  if (!parsed.success) {
    return jsonError(
      "validation_error",
      "kind must be question|finished|succeeded; text is required",
      400,
    );
  }

  try {
    await enforceRateLimit(`baton-email:${auth.userId}`, 20, 60 * 60_000);
  } catch (error) {
    if (error instanceof RequestLimitError)
      return new Response(
        JSON.stringify({ error: "rate_limited", message: error.message }),
        {
          status: 429,
          headers: {
            "content-type": "application/json",
            "Retry-After": String(error.retryAfter),
          },
        },
      );
    throw error;
  }
  const contact = await getContact(auth.userId);
  const subs = await listSubscriptions(auth.userId);
  if (!contact?.email && subs.length === 0) {
    return jsonError(
      "no_contact",
      "No pager target. Set an email (`mm pager set --email …`) or enable push at /pager.",
      409,
    );
  }

  const { eventId, token } = await createEvent({
    machineId: id,
    ownerUserId: auth.userId,
    kind: parsed.data.kind,
    text: parsed.data.text,
  });
  const base = env.APP_BASE_URL ?? "https://www.minimachin.es";
  const link = `${base}/m/${token}`;

  if (contact?.email) {
    try {
      await sendPagerEmail({
        to: contact.email,
        kind: parsed.data.kind,
        text: parsed.data.text,
        link,
      });
    } catch (err) {
      // Event is stored — only fail the request if email was the sole channel.
      console.error("[pager] email send failed; event kept", eventId, err);
      if (subs.length === 0) {
        return jsonError(
          "notify_send_failed",
          "Notification could not be sent",
          502,
        );
      }
    }
  }
  // Best-effort push; prunes dead subs, never throws.
  if (subs.length) {
    void sendPush(auth.userId, {
      title: `agent ${parsed.data.kind}`,
      body: parsed.data.text,
      url: link,
    });
  }
  return jsonOk({ ok: true, eventId }, 201);
}
