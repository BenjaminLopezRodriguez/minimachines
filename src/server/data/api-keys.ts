import { createHash, randomBytes } from "node:crypto";

import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "~/server/db";
import { apiKeys } from "~/server/db/schema";

export type ApiKeyRecord = {
  id: string;
  userId: string;
  keyHash: string;
  keyPrefix: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type ApiKeyPublic = Omit<ApiKeyRecord, "keyHash">;

type Row = typeof apiKeys.$inferSelect;

function toRecord(row: Row): ApiKeyRecord {
  return {
    id: row.id,
    userId: row.userId,
    keyHash: row.keyHash,
    keyPrefix: row.keyPrefix,
    label: row.label,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

function toPublic(record: ApiKeyRecord): ApiKeyPublic {
  const { keyHash, ...rest } = record;
  void keyHash;
  return rest;
}

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export async function createApiKey(input: {
  userId: string;
  label?: string;
}): Promise<{ key: ApiKeyPublic; secret: string }> {
  const raw = randomBytes(32).toString("hex");
  const secret = `mm_${raw}`;
  const [row] = await db
    .insert(apiKeys)
    .values({
      id: `key_${randomBytes(6).toString("hex")}`,
      userId: input.userId,
      keyHash: hashSecret(secret),
      keyPrefix: raw.slice(0, 8),
      label: input.label?.trim() ?? "Default",
    })
    .returning();

  if (!row) throw new Error("Failed to create API key");
  return { key: toPublic(toRecord(row)), secret };
}

export async function listApiKeys(userId: string): Promise<ApiKeyPublic[]> {
  const rows = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
    .orderBy(desc(apiKeys.createdAt));
  return rows.map((r) => toPublic(toRecord(r)));
}

export async function revokeApiKey(input: {
  userId: string;
  id: string;
}): Promise<boolean> {
  // Ownership is part of the WHERE clause, so one user cannot revoke
  // another's key even by guessing an id.
  const revoked = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiKeys.id, input.id),
        eq(apiKeys.userId, input.userId),
        isNull(apiKeys.revokedAt),
      ),
    )
    .returning({ id: apiKeys.id });
  return revoked.length > 0;
}

export async function verifyApiKey(
  secret: string,
): Promise<{ userId: string; keyId: string } | null> {
  if (!secret.startsWith("mm_")) return null;

  // Single statement: match live key by hash and stamp last-used atomically.
  const [row] = await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(
      and(eq(apiKeys.keyHash, hashSecret(secret)), isNull(apiKeys.revokedAt)),
    )
    .returning({ id: apiKeys.id, userId: apiKeys.userId });

  return row ? { userId: row.userId, keyId: row.id } : null;
}
