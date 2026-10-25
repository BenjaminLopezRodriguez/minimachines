import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { eq, sql } from "drizzle-orm";
import { db } from "~/server/db";
import {
  betaApplications,
  computeReservations,
  waitlist,
} from "~/server/db/schema";
import {
  enforceRateLimit,
  RequestLimitError,
  bucketIdentity,
} from "./distributed-rate-limit";
import { reserveCompute, releaseCompute } from "./compute-guard";
import { publicRequestLimit } from "./public-rate-limit";
import {
  enrollVerifiedUser,
  joinEarlyAccess,
  requireApprovedEnrollment,
  reviewApplication,
  BetaAccessError,
} from "~/server/data/beta";

void test("distributed buckets admit exactly five concurrent requests across database connections", async () => {
  const key = `limit-test:${randomUUID()}`;
  const results = await Promise.allSettled(
    Array.from({ length: 25 }, () => enforceRateLimit(key, 5, 60_000)),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 5);
  for (const result of results)
    if (result.status === "rejected") {
      assert.ok(result.reason instanceof RequestLimitError);
      assert.ok(result.reason.retryAfter > 0);
    }
  const bucket = bucketIdentity("ip:192.0.2.1", 60_000, 0);
  assert.equal(bucket.id.length, 64);
  assert.ok(!bucket.id.includes("192.0"));
  assert.notEqual(
    bucketIdentity("a", 1000, 0).id,
    bucketIdentity("a", 1000, 1000).id,
  );
});
void test("beta approval requires a verified account and public resubmissions cannot change access", async () => {
  const id = `user_beta_${randomUUID()}`;
  const email = `${randomUUID()}@example.test`;
  await joinEarlyAccess(email, true);
  const [lead] = await db
    .select()
    .from(betaApplications)
    .where(eq(betaApplications.email, email));
  await assert.rejects(
    () =>
      reviewApplication(
        "user_beta_admin_test",
        lead!.id,
        "approved",
        "beta-01",
      ),
    /verify/,
  );
  await assert.rejects(
    () => enrollVerifiedUser({ id, email, emailVerified: false }),
    BetaAccessError,
  );
  const entry = await enrollVerifiedUser({ id, email, emailVerified: true });
  await assert.rejects(() => requireApprovedEnrollment(id), BetaAccessError);
  await assert.rejects(
    () => reviewApplication("user_not_admin", entry.id, "approved", "beta-01"),
    BetaAccessError,
  );
  await reviewApplication(
    "user_beta_admin_test",
    entry.id,
    "approved",
    "beta-01",
  );
  await requireApprovedEnrollment(id);
  await assert.rejects(
    () =>
      enrollVerifiedUser({
        id: `other_${randomUUID()}`,
        email,
        emailVerified: true,
      }),
    BetaAccessError,
  );
  await joinEarlyAccess(email, false);
  const [unchanged] = await db
    .select()
    .from(betaApplications)
    .where(eq(betaApplications.id, entry.id));
  assert.equal(unchanged!.status, "approved");
  assert.equal(unchanged!.userId, id);
  assert.equal(unchanged!.feedbackConsent, true);
  await reviewApplication(
    "user_beta_admin_test",
    entry.id,
    "revoked",
    "beta-01",
  );
  await assert.rejects(() => requireApprovedEnrollment(id), BetaAccessError);
});
void test("concurrent compute reservations cannot bypass the active-machine cap", async () => {
  const id = `user_compute_${randomUUID()}`;
  const entry = await enrollVerifiedUser({
    id,
    email: `${randomUUID()}@example.test`,
    emailVerified: true,
  });
  await reviewApplication(
    "user_beta_admin_test",
    entry.id,
    "approved",
    "beta-01",
  );
  const ids = Array.from({ length: 3 }, () => `vm_${randomUUID()}`);
  const results = await Promise.allSettled(
    ids.map((machine) => reserveCompute(id, machine)),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 2);
  assert.ok(
    results.some(
      (r) => r.status === "rejected" && r.reason instanceof RequestLimitError,
    ),
  );
  await Promise.all(ids.map(releaseCompute));
  const stale = `vm_${randomUUID()}`;
  await db
    .insert(computeReservations)
    .values({ id: stale, userId: id, expiresAt: new Date(0) });
  await reserveCompute(id, stale, true);
  await releaseCompute(stale);
  await assert.rejects(
    () => reserveCompute(undefined, "vm_no_owner"),
    BetaAccessError,
  );
});
void test("public HTTP limits respond with 429 and Retry-After", async () => {
  const request = new Request("https://example.test", {
    headers: { "x-real-ip": `test-${randomUUID()}` },
  });
  assert.equal(await publicRequestLimit(request, "test", 1), null);
  const limited = await publicRequestLimit(request, "test", 1);
  assert.equal(limited?.status, 429);
  assert.ok(Number(limited?.headers.get("Retry-After")) > 0);
});

void test("legacy waitlist migration preserves leads without granting access", async () => {
  const email = `legacy-${randomUUID()}@example.test`;
  const createdAt = new Date("2026-01-01T00:00:00Z");
  await db.insert(waitlist).values({ email: email.toUpperCase(), createdAt });
  const migration = readFileSync(
    new URL(
      "../../../drizzle/migrations/0015_beta_program.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await db.execute(
    sql.raw(
      migration.slice(
        migration.indexOf("INSERT INTO minimachines_beta_application"),
      ),
    ),
  );
  const [entry] = await db
    .select()
    .from(betaApplications)
    .where(eq(betaApplications.email, email));
  assert.equal(entry!.status, "pending");
  assert.equal(entry!.verifiedAt, null);
  assert.equal(entry!.userId, null);
  assert.equal(entry!.createdAt.toISOString(), createdAt.toISOString());
});
