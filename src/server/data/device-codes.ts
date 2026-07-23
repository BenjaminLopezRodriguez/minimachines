import { createHash, randomBytes, randomInt } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "~/server/db";
import { deviceCodes } from "~/server/db/schema";

import { createApiKey } from "./api-keys";

/**
 * CLI/agent device-authorization flow (RFC 8628 shaped).
 *
 * 1. `createDeviceCode` — CLI gets an opaque `deviceCode` + human `userCode`.
 * 2. signed-in user approves `userCode` in the dashboard → `approveDeviceCode`.
 * 3. CLI polls `redeemDeviceToken(deviceCode)`; on first approved poll the API
 *    key is minted and returned once.
 *
 * The API key is NOT minted at approval and never stored at rest — it is
 * created lazily inside the poll and handed straight to the CLI.
 */

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_INTERVAL_SEC = 5;

// No ambiguous chars (0/O, 1/I) — this gets read off a screen.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function hash(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function makeUserCode(): string {
  const pick = () =>
    Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(
      "",
    );
  return `${pick()}-${pick()}`;
}

export type CreatedDeviceCode = {
  deviceCode: string;
  userCode: string;
  expiresAt: string;
  interval: number;
};

export async function createDeviceCode(opts?: {
  ttlMs?: number;
}): Promise<CreatedDeviceCode> {
  const deviceCode = `mmdc_${randomBytes(32).toString("hex")}`;
  const expiresAt = new Date(Date.now() + (opts?.ttlMs ?? DEFAULT_TTL_MS));

  // userCode is unique while active — retry on the rare collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const userCode = makeUserCode();
    try {
      await db.insert(deviceCodes).values({
        userCode,
        deviceCodeHash: hash(deviceCode),
        expiresAt,
      });
      return {
        deviceCode,
        userCode,
        expiresAt: expiresAt.toISOString(),
        interval: DEFAULT_INTERVAL_SEC,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (!/unique|duplicate/i.test(msg)) throw err;
    }
  }
  throw new Error("Could not allocate a unique device code");
}

export type PendingDeviceCode = {
  userCode: string;
  approved: boolean;
  consumed: boolean;
  expired: boolean;
};

/** For the approve page: look up a user_code to display before approving. */
export async function getByUserCode(
  userCode: string,
): Promise<PendingDeviceCode | null> {
  const [row] = await db
    .select()
    .from(deviceCodes)
    .where(eq(deviceCodes.userCode, userCode.trim().toUpperCase()))
    .limit(1);
  if (!row) return null;
  return {
    userCode: row.userCode,
    approved: row.approvedUserId !== null,
    consumed: row.consumedAt !== null,
    expired: row.expiresAt.getTime() < Date.now(),
  };
}

export type ApproveResult =
  | { ok: true }
  | { ok: false; error: "not_found" | "expired" | "already" };

export async function approveDeviceCode(input: {
  userCode: string;
  userId: string;
}): Promise<ApproveResult> {
  const [row] = await db
    .select()
    .from(deviceCodes)
    .where(eq(deviceCodes.userCode, input.userCode.trim().toUpperCase()))
    .limit(1);

  if (!row) return { ok: false, error: "not_found" };
  if (row.consumedAt || row.approvedUserId || row.deniedAt) {
    return { ok: false, error: "already" };
  }
  if (row.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: "expired" };
  }

  // Only claim the row if it is still pending — guards against a double
  // approve racing two browser tabs.
  const claimed = await db
    .update(deviceCodes)
    .set({ approvedUserId: input.userId })
    .where(
      and(
        eq(deviceCodes.id, row.id),
        isNull(deviceCodes.approvedUserId),
        isNull(deviceCodes.deniedAt),
      ),
    )
    .returning({ id: deviceCodes.id });

  return claimed.length > 0 ? { ok: true } : { ok: false, error: "already" };
}

export async function denyDeviceCode(userCode: string): Promise<boolean> {
  const denied = await db
    .update(deviceCodes)
    .set({ deniedAt: new Date() })
    .where(
      and(
        eq(deviceCodes.userCode, userCode.trim().toUpperCase()),
        isNull(deviceCodes.approvedUserId),
        isNull(deviceCodes.consumedAt),
      ),
    )
    .returning({ id: deviceCodes.id });
  return denied.length > 0;
}

export type RedeemResult =
  | { status: "authorization_pending" }
  | { status: "access_denied" }
  | { status: "expired_token" }
  | { status: "already_used" }
  | { status: "success"; apiKey: string; keyId: string; keyPrefix: string };

/**
 * CLI poll. Mints the API key on the first approved call and returns the
 * secret once; subsequent calls report `already_used`.
 */
export async function redeemDeviceToken(
  deviceCode: string,
): Promise<RedeemResult> {
  const [row] = await db
    .select()
    .from(deviceCodes)
    .where(eq(deviceCodes.deviceCodeHash, hash(deviceCode)))
    .limit(1);

  if (!row) return { status: "expired_token" };
  if (row.consumedAt || row.mintedKeyId) return { status: "already_used" };
  if (row.deniedAt) return { status: "access_denied" };
  if (row.expiresAt.getTime() < Date.now()) return { status: "expired_token" };
  if (!row.approvedUserId) return { status: "authorization_pending" };

  // Claim the row for consumption before minting, so two racing polls can't
  // both mint a key. The loser sees a consumed row and reports already_used.
  const claimed = await db
    .update(deviceCodes)
    .set({ consumedAt: new Date() })
    .where(and(eq(deviceCodes.id, row.id), isNull(deviceCodes.consumedAt)))
    .returning({ id: deviceCodes.id });
  if (claimed.length === 0) return { status: "already_used" };

  const { key, secret } = await createApiKey({
    userId: row.approvedUserId,
    label: `CLI · ${row.userCode}`,
  });
  await db
    .update(deviceCodes)
    .set({ mintedKeyId: key.id })
    .where(eq(deviceCodes.id, row.id));

  return {
    status: "success",
    apiKey: secret,
    keyId: key.id,
    keyPrefix: key.keyPrefix,
  };
}
