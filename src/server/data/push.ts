import webpush from "web-push";

import { and, eq } from "drizzle-orm";

import { env } from "~/env";
import { db } from "~/server/db";
import { pushSubscriptions } from "~/server/db/schema";

let configured = false;
function vapidReady(): boolean {
  const pub = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = env.VAPID_PRIVATE_KEY;
  const subj = env.VAPID_SUBJECT;
  if (!pub || !priv || !subj) return false;
  if (!configured) {
    webpush.setVapidDetails(subj, pub, priv);
    configured = true;
  }
  return true;
}

export type WebPushSub = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export async function saveSubscription(input: {
  ownerUserId: string;
  sub: WebPushSub;
  ua?: string;
}): Promise<void> {
  await db
    .insert(pushSubscriptions)
    .values({
      ownerUserId: input.ownerUserId,
      endpoint: input.sub.endpoint,
      p256dh: input.sub.keys.p256dh,
      auth: input.sub.keys.auth,
      ua: input.ua ?? null,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        ownerUserId: input.ownerUserId,
        p256dh: input.sub.keys.p256dh,
        auth: input.sub.keys.auth,
      },
    });
}

export async function deleteSubscription(endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

export async function listSubscriptions(ownerUserId: string) {
  return db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.ownerUserId, ownerUserId));
}

/**
 * Push to all of an owner's subscriptions. Dead endpoints (404/410) are pruned.
 * Never throws — a push failure must not fail the notify path.
 */
export async function sendPush(
  ownerUserId: string,
  payload: { title: string; body: string; url: string },
): Promise<number> {
  if (!vapidReady()) {
    console.warn("[pager] VAPID unset — push not sent");
    return 0;
  }
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.ownerUserId, ownerUserId),
        eq(pushSubscriptions.kind, "webpush"),
      ),
    );
  const body = JSON.stringify(payload);
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
        sent++;
      } catch (err: unknown) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await deleteSubscription(s.endpoint);
        else console.error("[pager] push failed", s.endpoint, code);
      }
    }),
  );
  return sent;
}
