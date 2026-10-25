import { createHash, randomBytes } from "node:crypto";

import { and, asc, desc, eq, gte, isNull, ne } from "drizzle-orm";

import { db } from "~/server/db";
import {
  execs,
  machines,
  mailbox,
  pagerContacts,
  pagerEvents,
  shares,
} from "~/server/db/schema";

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
    ? {
        email: row.email ?? null,
        phone: row.phone ?? null,
        channels: row.channels,
      }
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
  return {
    email: row.email ?? null,
    phone: row.phone ?? null,
    channels: row.channels,
  };
}

/** Default only to the identity provider's verified address; preserve explicit contacts. */
export async function ensureEmailContact(user: {
  id: string;
  email: string;
  emailVerified: boolean;
}) {
  if (!user.emailVerified) throw new Error("Verify your account email first.");
  await db
    .insert(pagerContacts)
    .values({
      ownerUserId: user.id,
      email: user.email,
      emailVerifiedAt: new Date(),
      channels: "email",
    })
    .onConflictDoNothing();
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
  return db.transaction(async (tx) => {
    const [ev] = await tx
      .update(pagerEvents)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(pagerEvents.tokenHash, hashToken(input.token)),
          isNull(pagerEvents.consumedAt),
          gte(pagerEvents.expiresAt, new Date()),
        ),
      )
      .returning();
    if (!ev) return false;
    await tx
      .insert(mailbox)
      .values({
        machineId: ev.machineId,
        ownerUserId: ev.ownerUserId,
        eventId: ev.id,
        body: input.body,
        model: input.model ?? null,
      });
    return true;
  });
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

export type BatonStatus = {
  /** Everything the agent has paged about this machine since you were asked. */
  events: { kind: string; text: string; at: string }[];
  /** Commands the agent has run on the box since then — the live build log. */
  commands: {
    cmd: string;
    running: boolean;
    ok: boolean;
    /** Last line of output, so a failure reads without opening a terminal. */
    tail: string;
    at: string;
  }[];
  /** Where to go look at the result, once there is one. */
  liveUrl: string | null;
  /** The agent has reported the work landed. */
  done: boolean;
};

/** Last non-empty line of a command's output, trimmed for a phone screen. */
function lastLine(stdout: string, stderr: string): string {
  const lines = `${stdout}\n${stderr}`.split("\n").filter((l) => l.trim());
  return (lines.at(-1) ?? "").trim().slice(0, 200);
}

const SHARE_DOMAIN = process.env.SHARE_BASE_DOMAIN ?? "minimachin.es";

/**
 * Read the machine's baton feed using a reply token that has already been
 * consumed. `resolveReplyToken` deliberately refuses a used token so a reply
 * cannot be submitted twice; watching what the agent did next is a different,
 * read-only capability, so it only needs the token to be unexpired.
 */
export async function batonStatus(token: string): Promise<BatonStatus | null> {
  const [origin] = await db
    .select()
    .from(pagerEvents)
    .where(eq(pagerEvents.tokenHash, hashToken(token)))
    .limit(1);
  if (!origin || origin.expiresAt.getTime() < Date.now()) return null;

  // Anchor on the reply itself when there is one: what matters is what the
  // agent did *with the answer*, not the question you already read.
  const since = origin.consumedAt ?? origin.createdAt;
  const rows = await db
    .select({
      kind: pagerEvents.kind,
      text: pagerEvents.text,
      createdAt: pagerEvents.createdAt,
    })
    .from(pagerEvents)
    .where(
      and(
        eq(pagerEvents.machineId, origin.machineId),
        gte(pagerEvents.createdAt, since),
        // Timestamps are millisecond-granular, so a fast reply can tie with the
        // question's own createdAt — exclude it by id, not by clock.
        ne(pagerEvents.id, origin.id),
      ),
    )
    .orderBy(asc(pagerEvents.createdAt))
    .limit(20);

  // Newest-first + limit, then flipped: the tail of a long build is the part
  // worth watching.
  const cmdRows = await db
    .select({
      cmd: execs.cmd,
      exitCode: execs.exitCode,
      stdout: execs.stdout,
      stderr: execs.stderr,
      createdAt: execs.createdAt,
    })
    .from(execs)
    .where(
      and(eq(execs.machineId, origin.machineId), gte(execs.createdAt, since)),
    )
    .orderBy(desc(execs.createdAt))
    .limit(12);

  const [share] = await db
    .select({ slug: shares.slug })
    .from(shares)
    .where(
      and(eq(shares.machineId, origin.machineId), eq(shares.enabled, true)),
    )
    .orderBy(desc(shares.createdAt))
    .limit(1);
  const [machine] = await db
    .select({ appUrl: machines.appUrl })
    .from(machines)
    .where(eq(machines.id, origin.machineId))
    .limit(1);

  const events = rows.map((r) => ({
    kind: r.kind,
    text: r.text,
    at: r.createdAt.toISOString(),
  }));
  return {
    events,
    commands: cmdRows.reverse().map((r) => ({
      cmd: r.cmd,
      // ponytail: negative exitCode is the in-flight sentinel (EXEC_RUNNING).
      running: r.exitCode < 0,
      ok: r.exitCode === 0,
      tail: lastLine(r.stdout, r.stderr),
      at: r.createdAt.toISOString(),
    })),
    // A branded share link is the one the owner chose to hand out; fall back
    // to the machine's own public port.
    liveUrl: share
      ? `https://${share.slug}.${SHARE_DOMAIN}`
      : (machine?.appUrl ?? null),
    done: events.some((e) => e.kind === "finished" || e.kind === "succeeded"),
  };
}
