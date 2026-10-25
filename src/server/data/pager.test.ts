import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";

import {
  batonStatus,
  ensureEmailContact,
  createEvent,
  getContact,
  pollMailbox,
  resolveReplyToken,
  setContact,
  submitReply,
} from "./pager";
import { createMachine } from "./machine-store";
import { execMachine } from "./session-store";

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

void test("baton status shows work after the reply and flips done", async () => {
  const owner = uid();
  const machine = mid();
  const { token } = await createEvent({
    machineId: machine,
    ownerUserId: owner,
    kind: "question",
    text: "which db?",
  });
  await submitReply({ token, body: "postgres" });

  const before = await batonStatus(token);
  // The question itself predates the reply — the feed starts after it.
  assert.equal(before?.events.length, 0);
  assert.equal(before?.done, false);

  await createEvent({
    machineId: machine,
    ownerUserId: owner,
    kind: "finished",
    text: "migrated to postgres",
  });
  const after = await batonStatus(token);
  assert.equal(after?.events.length, 1);
  assert.equal(after?.events[0]?.text, "migrated to postgres");
  assert.equal(after?.done, true);
});

void test("baton status mirrors commands run after the reply", async () => {
  const owner = uid();
  const machine = await createMachine({
    templateId: "node-ts",
    ownerUserId: owner,
  });
  const { token } = await createEvent({
    machineId: machine.id,
    ownerUserId: owner,
    kind: "question",
    text: "accent color?",
  });
  await submitReply({ token, body: "lime" });

  assert.equal((await batonStatus(token))?.commands.length, 0);

  await execMachine(
    machine.id,
    { cmd: "npm run build" },
    { ownerUserId: owner },
  );
  const status = await batonStatus(token);
  assert.equal(status?.commands.length, 1);
  assert.equal(status?.commands[0]?.cmd, "npm run build");
  // The stub driver completes immediately, so the row is closed out, not stuck.
  assert.equal(status?.commands[0]?.running, false);
  assert.equal(status?.commands[0]?.ok, true);
  assert.match(status?.commands[0]?.tail ?? "", /npm run build/);
});

void test("contact upsert is idempotent", async () => {
  const owner = uid();
  assert.equal(await getContact(owner), null);
  await setContact({ ownerUserId: owner, email: "a@x.com" });
  const c = await setContact({ ownerUserId: owner, email: "b@x.com" });
  assert.equal(c.email, "b@x.com");
});

void test("default baton address requires verification and preserves custom contacts", async () => {
  const id = uid();
  await assert.rejects(() =>
    ensureEmailContact({
      id,
      email: "unverified@example.test",
      emailVerified: false,
    }),
  );
  assert.equal(await getContact(id), null);
  await ensureEmailContact({
    id,
    email: "verified@example.test",
    emailVerified: true,
  });
  assert.equal((await getContact(id))?.email, "verified@example.test");
  await setContact({ ownerUserId: id, email: "custom@example.test" });
  await ensureEmailContact({
    id,
    email: "verified@example.test",
    emailVerified: true,
  });
  assert.equal((await getContact(id))?.email, "custom@example.test");
});
void test("concurrent baton replies deliver exactly once", async () => {
  const owner = uid(),
    machine = mid();
  const { token } = await createEvent({
    machineId: machine,
    ownerUserId: owner,
    kind: "question",
    text: "Choose?",
  });
  const results = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      submitReply({ token, body: String(i) }),
    ),
  );
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal((await pollMailbox(machine, owner)).length, 1);
});
