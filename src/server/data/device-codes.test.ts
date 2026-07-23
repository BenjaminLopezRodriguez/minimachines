import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";

import { verifyApiKey } from "./api-keys";
import {
  approveDeviceCode,
  createDeviceCode,
  denyDeviceCode,
  getByUserCode,
  redeemDeviceToken,
} from "./device-codes";

const uid = () => `user_${randomBytes(6).toString("hex")}`;

void test("full flow: create -> pending -> approve -> mint once", async () => {
  const user = uid();
  const { deviceCode, userCode } = await createDeviceCode();

  assert.match(userCode, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal((await redeemDeviceToken(deviceCode)).status, "authorization_pending");

  assert.deepEqual(await approveDeviceCode({ userCode, userId: user }), {
    ok: true,
  });

  const redeemed = await redeemDeviceToken(deviceCode);
  assert.equal(redeemed.status, "success");
  if (redeemed.status !== "success") return;
  assert.match(redeemed.apiKey, /^mm_/);
  // The minted key is a real, usable key owned by the approver.
  assert.equal((await verifyApiKey(redeemed.apiKey))?.userId, user);

  // Second poll must not mint a second key.
  assert.equal((await redeemDeviceToken(deviceCode)).status, "already_used");
});

void test("expired code cannot be approved or redeemed", async () => {
  const user = uid();
  const { deviceCode, userCode } = await createDeviceCode({ ttlMs: -1 });
  assert.equal((await redeemDeviceToken(deviceCode)).status, "expired_token");
  assert.deepEqual(await approveDeviceCode({ userCode, userId: user }), {
    ok: false,
    error: "expired",
  });
});

void test("denied code reports access_denied", async () => {
  const { deviceCode, userCode } = await createDeviceCode();
  assert.equal(await denyDeviceCode(userCode), true);
  assert.equal((await redeemDeviceToken(deviceCode)).status, "access_denied");
});

void test("double approve is rejected", async () => {
  const { userCode } = await createDeviceCode();
  assert.deepEqual(await approveDeviceCode({ userCode, userId: uid() }), {
    ok: true,
  });
  assert.deepEqual(await approveDeviceCode({ userCode, userId: uid() }), {
    ok: false,
    error: "already",
  });
});

void test("unknown code lookups are safe", async () => {
  assert.equal(await getByUserCode("ZZZZ-ZZZZ"), null);
  assert.equal((await redeemDeviceToken("mmdc_nope")).status, "expired_token");
  assert.deepEqual(await approveDeviceCode({ userCode: "ZZZZ-ZZZZ", userId: uid() }), {
    ok: false,
    error: "not_found",
  });
});
