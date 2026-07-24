import { createHash, randomBytes } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "~/server/db";
import { mailbox, pagerContacts, pagerEvents } from "~/server/db/schema";

const TOKEN_TTL_MS = 30 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type PagerContact = {
  email: string | null;
  phone: string | null;
  channels: string;
};

export async function getContact(
  ownerUserId: string,
): Promise<PagerContact | null> {
  const [row] = await db
    .select()
    .from(pagerContacts)
    .where(eq(pagerContacts.ownerUserId, ownerUserId))
    .limit(1);
  return row
    ? { email: row.email ?? null, phone: row.phone ?? null, channels: row.channels }
    : null;
}

export async function setContact(input: {
  ownerUserId: string;
  email?: string;
  phone?: string;
}): Promise<PagerContact> {
  // The owner is already authenticated (dashboard/CLI), so a set email counts
  // as verified. Phone/SMS verification is deferred to v1.1.
  const now = new Date();
  const set = {
    email: input.email ?? null,
    phone: input.phone ?? null,
    emailVerifiedAt: input.email ? now : null,
  };
  const [row] = await db
    .insert(pagerContacts)
    .values({ ownerUserId: input.ownerUserId, channels: "email", ...set })
    .onConflictDoUpdate({ target: pagerContacts.ownerUserId, set })
    .returning();
  if (!row) throw new Error("Failed to save pager contact");
  return { email: row.email ?? null, phone: row.phone ?? null, channels: row.channels };
}

/** Create a page + its single-use reply token. Returns the raw token (not stored). */
export async function createEvent(input: {
  machineId: string;
  ownerUserId: string;
  kind: string;
  text: string;
}): Promise<{ eventId: string; token: string }> {
  const token = randomBytes(24).toString("hex");
  const [row] = await db
    .insert(pagerEvents)
    .values({
      machineId: input.machineId,
      ownerUserId: input.ownerUserId,
      kind: input.kind,
      text: input.text,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    })
    .returning({ id: pagerEvents.id });
  if (!row) throw new Error("Failed to create pager event");
  return { eventId: row.id, token };
}

export type ReplyEvent = {
  id: string;
  machineId: string;
  ownerUserId: string;
  kind: string;
  text: string;
};

/** Validate a reply token without consuming it (for rendering the reply page). */
export async function resolveReplyToken(
  token: string,
): Promise<ReplyEvent | null> {
  const [row] = await db
    .select()
    .from(pagerEvents)
    .where(
      and(
        eq(pagerEvents.tokenHash, hashToken(token)),
        isNull(pagerEvents.consumedAt),
      ),
    )
    .limit(1);
  if (!row || row.expiresAt.getTime() < Date.now()) return null;
  return {
    id: row.id,
    machineId: row.machineId,
    ownerUserId: row.ownerUserId,
    kind: row.kind,
    text: row.text,
  };
}

/**
 * Consume a reply token (single-use) and drop the reply in the mailbox.
 * The conditional UPDATE is the replay guard: two concurrent posts race on
 * `consumedAt IS NULL`, only the winner returns a row and inserts.
 */
export async function submitReply(input: {
  token: string;
  body: string;
  model?: string;
}): Promise<boolean> {
  const [ev] = await db
    .update(pagerEvents)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(pagerEvents.tokenHash, hashToken(input.token)),
        isNull(pagerEvents.consumedAt),
      ),
    )
    .returning();
  if (!ev || ev.expiresAt.getTime() < Date.now()) return false;
  await db.insert(mailbox).values({
    machineId: ev.machineId,
    ownerUserId: ev.ownerUserId,
    eventId: ev.id,
    body: input.body,
    model: input.model ?? null,
  });
  return true;
}

export type Reply = {
  id: string;
  body: string;
  model: string | null;
  createdAt: Date;
};

/** Return undelivered replies for a machine and mark them delivered (drain-once). */
export async function pollMailbox(
  machineId: string,
  ownerUserId: string,
): Promise<Reply[]> {
  const rows = await db
    .update(mailbox)
    .set({ deliveredAt: new Date() })
    .where(
      and(
        eq(mailbox.machineId, machineId),
        eq(mailbox.ownerUserId, ownerUserId),
        isNull(mailbox.deliveredAt),
      ),
    )
    .returning({
      id: mailbox.id,
      body: mailbox.body,
      model: mailbox.model,
      createdAt: mailbox.createdAt,
    });
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    model: r.model ?? null,
    createdAt: r.createdAt,
  }));
}
