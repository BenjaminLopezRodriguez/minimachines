import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";

import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  verifyApiKey,
} from "./api-keys";

// Postgres-backed: isolate by unique userId per test rather than by temp dir,
// so tests can run concurrently against a shared database without a wipe.
const uid = () => `user_${randomBytes(6).toString("hex")}`;

void test("create returns mm_ secret and verifies", async () => {
  const user = uid();
  const { secret, key } = await createApiKey({ userId: user, label: "cli" });
  assert.match(secret, /^mm_/);
  assert.equal((await listApiKeys(user)).length, 1);
  assert.equal((await verifyApiKey(secret))?.userId, user);
  assert.ok(key.keyPrefix.length > 0);
  assert.equal(key.label, "cli");
});

void test("revoked key fails verify", async () => {
  const user = uid();
  const { secret, key } = await createApiKey({ userId: user });
  assert.equal(await revokeApiKey({ userId: user, id: key.id }), true);
  assert.equal(await verifyApiKey(secret), null);
});

void test("list hides other users and revoked keys", async () => {
  const a = uid();
  const b = uid();
  await createApiKey({ userId: a });
  await createApiKey({ userId: b });
  const { key } = await createApiKey({ userId: a, label: "temp" });
  await revokeApiKey({ userId: a, id: key.id });
  assert.equal((await listApiKeys(a)).length, 1);
  assert.equal((await listApiKeys(b)).length, 1);
});

void test("a user cannot revoke another user's key", async () => {
  const owner = uid();
  const attacker = uid();
  const { secret, key } = await createApiKey({ userId: owner });
  assert.equal(await revokeApiKey({ userId: attacker, id: key.id }), false);
  // Still usable by its real owner.
  assert.equal((await verifyApiKey(secret))?.userId, owner);
});

void test("secrets are not recoverable from the store", async () => {
  const user = uid();
  const { secret, key } = await createApiKey({ userId: user });
  const [listed] = await listApiKeys(user);
  assert.ok(listed);
  assert.equal("keyHash" in listed, false);
  assert.equal(JSON.stringify(listed).includes(secret), false);
  assert.equal(listed.id, key.id);
});

void test("garbage and non-mm secrets are rejected", async () => {
  assert.equal(await verifyApiKey("not-a-key"), null);
  assert.equal(await verifyApiKey("mm_deadbeef"), null);
});
