import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";

export class RequestLimitError extends Error {
  constructor(
    message = "Too many requests. Please try again shortly.",
    public retryAfter = 60,
  ) {
    super(message);
    this.name = "RequestLimitError";
  }
}
export function bucketIdentity(
  key: string,
  windowMs: number,
  now = Date.now(),
) {
  const start = Math.floor(now / windowMs) * windowMs;
  return {
    id: createHash("sha256").update(`${key}:${start}`).digest("hex"),
    expiresAt: new Date(start + windowMs),
    retryAfter: Math.max(1, Math.ceil((start + windowMs - now) / 1000)),
  };
}
export async function enforceRateLimit(
  key: string,
  limit: number,
  windowMs: number,
) {
  const bucket = bucketIdentity(key, windowMs);
  const result = await db.execute<{ hits: number }>(sql`
    INSERT INTO minimachines_request_bucket (id, hits, "expiresAt") VALUES (${bucket.id}, 1, ${bucket.expiresAt.toISOString()})
    ON CONFLICT (id) DO UPDATE SET hits = minimachines_request_bucket.hits + 1
    WHERE minimachines_request_bucket.hits < ${limit} RETURNING hits
  `);
  if (!result.length) throw new RequestLimitError(undefined, bucket.retryAfter);
  // Bounded opportunistic cleanup; a failed cleanup never affects an admitted request.
  if (Math.random() < 0.02)
    await db
      .execute(
        sql`DELETE FROM minimachines_request_bucket WHERE id IN (SELECT id FROM minimachines_request_bucket WHERE "expiresAt" < now() LIMIT 500)`,
      )
      .catch(() => undefined);
}
export function requestIp(headers: Headers) {
  // In production Vercel sets this header; never trust client-provided X-Forwarded-For.
  const value = headers.get("x-real-ip")?.trim();
  return value?.length ? value : "unknown";
}
