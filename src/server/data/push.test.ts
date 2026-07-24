import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";

import {
  deleteSubscription,
  listSubscriptions,
  saveSubscription,
} from "./push";

const uid = () => `user_${randomBytes(6).toString("hex")}`;

void test("subscription upserts by endpoint and is owner-scoped", async () => {
  const owner = uid();
  const endpoint = `https://push.example/${randomBytes(8).toString("hex")}`;

  await saveSubscription({
    ownerUserId: owner,
    sub: { endpoint, keys: { p256dh: "k1", auth: "a1" } },
  });
  // Same endpoint again → update, not a duplicate row.
  await saveSubscription({
    ownerUserId: owner,
    sub: { endpoint, keys: { p256dh: "k2", auth: "a2" } },
  });

  const subs = await listSubscriptions(owner);
  assert.equal(subs.length, 1);
  assert.equal(subs[0]?.p256dh, "k2");
  assert.equal((await listSubscriptions(uid())).length, 0); // other owner sees nothing

  await deleteSubscription(endpoint);
  assert.equal((await listSubscriptions(owner)).length, 0);
});
