import { isIP } from "node:net";
import { createHash, randomBytes } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";

import { db } from "~/server/db";
import { machines as machinesTable, shares } from "~/server/db/schema";

import { machineAccess } from "./machine-store";

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function newSlug(): string {
  return randomBytes(5).toString("hex"); // 10 lowercase hex chars, DNS-safe
}

/**
 * Reject anything that could turn the proxy into an SSRF vector: only https
 * to a public host. IP literals in private/loopback/link-local/CGNAT ranges
 * are blocked; so are localhost/metadata hostnames. Returns the origin base.
 * (ponytail: no DNS-rebind resolve in v1 — hostname is trusted at fetch time.)
 */
export function assertSafeOrigin(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("Invalid origin URL");
  }
  if (u.protocol !== "https:") throw new Error("Origin must be https");
  const host = u.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal"
  ) {
    throw new Error("Origin host not allowed");
  }
  if (isIP(host) && isPrivateIp(host)) {
    throw new Error("Origin host not allowed");
  }
  return u.origin;
}

function isPrivateIp(host: string): boolean {
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80"))
    return true;
  const p = host.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return false;
  const [a, b] = p as [number, number, number, number];
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) || // link-local + cloud metadata
    (a === 100 && b >= 64 && b <= 127) // CGNAT
  );
}

export type ShareInput = {
  ownerUserId: string;
  originKind: "machine" | "local";
  machineId?: string;
  port?: number;
  localUrl?: string;
  kind: "api" | "website";
  access: "public" | "gated";
  secret?: string;
  label?: string;
};

export type ShareRow = typeof shares.$inferSelect;

export async function createShare(input: ShareInput): Promise<ShareRow> {
  if (input.access === "gated" && !input.secret) {
    throw new Error("Gated share requires a secret");
  }

  let originUrl: string;
  if (input.originKind === "machine") {
    if (!input.machineId || input.port == null) {
      throw new Error("machineId and port required");
    }
    // Owner-scoped read; origin is derived server-side, never client-supplied.
    const [m] = await db
      .select({ ports: machinesTable.ports })
      .from(machinesTable)
      .where(
        and(
          eq(machinesTable.id, input.machineId),
          machineAccess(input.ownerUserId),
        ),
      )
      .limit(1);
    const ports = (m?.ports ?? {}) as Record<string, string>;
    const url = ports[String(input.port)];
    if (!url) throw new Error(`Port ${input.port} is not exposed on that machine`);
    originUrl = url;
  } else {
    if (!input.localUrl) throw new Error("localUrl required");
    originUrl = assertSafeOrigin(input.localUrl);
  }

  // Unique slug with a small collision retry.
  for (let i = 0; i < 5; i++) {
    const slug = newSlug();
    const [row] = await db
      .insert(shares)
      .values({
        slug,
        ownerUserId: input.ownerUserId,
        originKind: input.originKind,
        originUrl,
        machineId: input.machineId ?? null,
        port: input.port ?? null,
        label: input.label ?? "",
        kind: input.kind,
        access: input.access,
        secretHash: input.secret ? hashSecret(input.secret) : null,
      })
      .onConflictDoNothing({ target: shares.slug })
      .returning();
    if (row) return row;
  }
  throw new Error("Could not allocate a slug");
}

/** Proxy path — no auth; only an enabled share resolves. */
export async function getShareBySlug(slug: string): Promise<ShareRow | null> {
  const [row] = await db
    .select()
    .from(shares)
    .where(and(eq(shares.slug, slug), eq(shares.enabled, true)))
    .limit(1);
  return row ?? null;
}

export function checkGate(row: ShareRow, authHeader: string | null): boolean {
  if (row.access !== "gated") return true;
  const m = /^Basic\s+(.+)$/i.exec(authHeader ?? "");
  if (!m?.[1]) return false;
  const decoded = Buffer.from(m[1], "base64").toString("utf8");
  const pass = decoded.slice(decoded.indexOf(":") + 1); // user ignored
  return Boolean(row.secretHash) && hashSecret(pass) === row.secretHash;
}

export async function listShares(ownerUserId: string): Promise<ShareRow[]> {
  return db
    .select()
    .from(shares)
    .where(eq(shares.ownerUserId, ownerUserId))
    .orderBy(desc(shares.createdAt));
}

export async function revokeShare(input: {
  ownerUserId: string;
  slug: string;
}): Promise<boolean> {
  const rows = await db
    .update(shares)
    .set({ enabled: false })
    .where(
      and(eq(shares.slug, input.slug), eq(shares.ownerUserId, input.ownerUserId)),
    )
    .returning({ slug: shares.slug });
  return rows.length > 0;
}

export async function touchShare(slug: string): Promise<void> {
  await db.update(shares).set({ lastUsedAt: new Date() }).where(eq(shares.slug, slug));
}
