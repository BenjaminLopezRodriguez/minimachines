import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";

import {
  createEvent,
  getContact,
  pollMailbox,
  resolveReplyToken,
  setContact,
  submitReply,
} from "./pager";

// Postgres-backed, scoped by unique owner/machine per test — safe on a shared DB.
const uid = () => `user_${randomBytes(6).toString("hex")}`;
const mid = () => `vm_${randomBytes(3).toString("hex")}`;

void test("reply token is single-use — no replay", async () => {
  const owner = uid();
  const machine = mid();
  const { token } = await createEvent({
    machineId: machine,
    ownerUserId: owner,
    kind: "question",
    text: "which db?",
  });
  assert.equal(await submitReply({ token, body: "postgres" }), true);
  assert.equal(await submitReply({ token, body: "again" }), false);
  const replies = await pollMailbox(machine, owner);
  assert.equal(replies.length, 1);
  assert.equal(replies[0]?.body, "postgres");
});

void test("mailbox drains once", async () => {
  const owner = uid();
  const machine = mid();
  const { token } = await createEvent({
    machineId: machine,
    ownerUserId: owner,
    kind: "finished",
    text: "done",
  });
  await submitReply({ token, body: "ok" });
  assert.equal((await pollMailbox(machine, owner)).length, 1);
  assert.equal((await pollMailbox(machine, owner)).length, 0);
});

void test("resolve rejects unknown and consumed tokens", async () => {
  assert.equal(await resolveReplyToken("deadbeef"), null);
  const owner = uid();
  const machine = mid();
  const { token } = await createEvent({
    machineId: machine,
    ownerUserId: owner,
    kind: "succeeded",
    text: "shipped",
  });
  assert.notEqual(await resolveReplyToken(token), null);
  await submitReply({ token, body: "gg" });
  assert.equal(await resolveReplyToken(token), null);
});

void test("contact upsert is idempotent", async () => {
  const owner = uid();
  assert.equal(await getContact(owner), null);
  await setContact({ ownerUserId: owner, email: "a@x.com" });
  const c = await setContact({ ownerUserId: owner, email: "b@x.com" });
  assert.equal(c.email, "b@x.com");
});
