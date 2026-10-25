import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { env } from "~/env";
import { db } from "~/server/db";
import { userSecrets } from "~/server/db/schema";

/** Env var names only: these land in machine environments verbatim. */
export const SECRET_NAME = /^[A-Z][A-Z0-9_]{1,63}$/;
// Never let a user secret shadow what the platform injects.
const RESERVED = /^(MINIMACHINE_|MM_)/;
const MAX_SECRETS = 30;
const MAX_VALUE = 8 * 1024;

function key(): Buffer {
  const k = env.SECRETS_KEY ? Buffer.from(env.SECRETS_KEY, "base64") : null;
  if (k?.length !== 32) throw new Error("Provider keys aren't configured on this server (SECRETS_KEY)");
  return k;
}

export const secretsEnabled = () => Buffer.from(env.SECRETS_KEY ?? "", "base64").length === 32;

/** base64(iv ‖ tag ‖ ciphertext), AES-256-GCM; the AAD binds a value to its owner and name. */
export function seal(plain: string, aad: string, k = key()): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv).setAAD(Buffer.from(aad));
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]).toString("base64");
}

export function open(sealed: string, aad: string, k = key()): string {
  const buf = Buffer.from(sealed, "base64");
  const d = createDecipheriv("aes-256-gcm", k, buf.subarray(0, 12)).setAAD(Buffer.from(aad));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
}

const aad = (userId: string, name: string) => `${userId}:${name}`;

export async function listSecrets(userId: string) {
  return db
    .select({ name: userSecrets.name, lastFour: userSecrets.lastFour, updatedAt: userSecrets.updatedAt })
    .from(userSecrets)
    .where(eq(userSecrets.userId, userId))
    .orderBy(userSecrets.name);
}

export async function setSecret(input: { userId: string; name: string; value: string }): Promise<void> {
  const name = input.name.trim().toUpperCase();
  const value = input.value.trim();
  if (!SECRET_NAME.test(name)) throw new Error("Name must look like an env var, e.g. ANTHROPIC_API_KEY");
  if (RESERVED.test(name)) throw new Error("MINIMACHINE_ and MM_ names are reserved");
  if (!value || value.length > MAX_VALUE) throw new Error("Value must be 1–8192 characters");
  const existing = await listSecrets(input.userId);
  if (!existing.some((s) => s.name === name) && existing.length >= MAX_SECRETS) {
    throw new Error(`Key limit reached (${MAX_SECRETS})`);
  }
  const row = { ciphertext: seal(value, aad(input.userId, name)), lastFour: value.slice(-4), updatedAt: new Date() };
  await db
    .insert(userSecrets)
    .values({ userId: input.userId, name, ...row })
    .onConflictDoUpdate({ target: [userSecrets.userId, userSecrets.name], set: row });
}

export async function deleteSecret(userId: string, name: string): Promise<boolean> {
  const rows = await db
    .delete(userSecrets)
    .where(and(eq(userSecrets.userId, userId), eq(userSecrets.name, name)))
    .returning({ name: userSecrets.name });
  return rows.length > 0;
}

/** Decrypted env for a machine the user creates. Unreadable rows are skipped, never fatal. */
export async function machineSecrets(userId: string): Promise<Record<string, string>> {
  if (!secretsEnabled()) return {};
  const rows = await db.select().from(userSecrets).where(eq(userSecrets.userId, userId));
  const out: Record<string, string> = {};
  for (const r of rows) {
    try {
      out[r.name] = open(r.ciphertext, aad(userId, r.name));
    } catch {
      console.error(`[minimachines] could not decrypt secret ${r.name} for ${userId}`);
    }
  }
  return out;
}
