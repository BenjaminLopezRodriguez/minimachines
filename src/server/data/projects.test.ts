import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";

import { createMachine, getMachine, listMachines } from "./machine-store";
import {
  acceptInvite,
  addAgentViewer,
  createInvites,
  issueJoinCode,
  listPeople,
  resolveInvite,
  revokeInvite,
  upsertProject,
} from "./projects";

// Postgres-backed, scoped by unique owners/repos per test — safe on a shared DB.
const uid = () => `user_${randomBytes(6).toString("hex")}`;
const repo = () => `github.com/test/${randomBytes(4).toString("hex")}`;

async function invite(owner: string, role: "member" | "viewer" = "member") {
  const project = await upsertProject({ ownerUserId: owner, name: "app", repoKey: repo() });
  const [sent] = await createInvites({
    projectId: project.id,
    invitedBy: owner,
    role,
    contacts: [{ channel: "email", contact: "Ana@Acme.dev", codeRequired: true }],
  });
  assert.ok(sent);
  return { project, ...sent };
}

void test("upsert is idempotent per repo and makes the owner a member", async () => {
  const owner = uid();
  const key = repo();
  const a = await upsertProject({ ownerUserId: owner, name: "app", repoKey: key });
  const b = await upsertProject({ ownerUserId: owner, name: "app", repoKey: key });
  assert.equal(a.id, b.id);
  const people = await listPeople(a.id, owner);
  assert.deepEqual(people.members.map((m) => m.role), ["owner"]);
});

void test("a forwarded link alone cannot be accepted; link + code can, once", async () => {
  const owner = uid();
  const { project, token, invite: row } = await invite(owner);
  assert.equal(row.contact, "ana@acme.dev");

  const joiner = uid();
  assert.deepEqual(await acceptInvite({ token, userId: joiner }), {
    ok: false,
    reason: "code_required",
  });
  const issued = await issueJoinCode(token);
  assert.ok(issued.ok);
  assert.deepEqual(await acceptInvite({ token, userId: joiner, code: issued.code }), {
    ok: true,
    projectId: project.id,
    role: "member",
  });
  // Single-use.
  assert.equal((await acceptInvite({ token, userId: uid(), code: issued.code })).ok, false);
  assert.equal(await resolveInvite(token), null);
});

void test("wrong codes are capped", async () => {
  const { token } = await invite(uid());
  const issued = await issueJoinCode(token);
  assert.ok(issued.ok);
  const wrong = issued.code === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) {
    assert.equal((await acceptInvite({ token, userId: uid(), code: wrong })).ok, false);
  }
  assert.deepEqual(await acceptInvite({ token, userId: uid(), code: issued.code }), {
    ok: false,
    reason: "too_many_tries",
  });
});

void test("re-inviting a contact kills the old link; revoke works; only the owner invites", async () => {
  const owner = uid();
  const { project, token: first } = await invite(owner);
  const [again] = await createInvites({
    projectId: project.id,
    invitedBy: owner,
    role: "member",
    contacts: [{ channel: "email", contact: "ana@acme.dev", codeRequired: true }],
  });
  assert.ok(again);
  assert.equal(await resolveInvite(first), null);
  assert.equal((await listPeople(project.id, owner)).pending.length, 1);

  assert.equal(
    await revokeInvite({ projectId: project.id, inviteId: again.invite.id, userId: owner }),
    true,
  );
  assert.equal(await resolveInvite(again.token), null);

  await assert.rejects(
    () =>
      createInvites({
        projectId: project.id,
        invitedBy: uid(),
        role: "member",
        contacts: [{ channel: "sms", contact: "+14155550123", codeRequired: false }],
      }),
    /Only the project owner/,
  );
});

void test("members read+write, viewers and agent keys read only, strangers nothing", async () => {
  const owner = uid();
  const project = await upsertProject({ ownerUserId: owner, name: "app", repoKey: repo() });
  const machine = await createMachine({
    templateId: "node-ts",
    ownerUserId: owner,
    projectId: project.id,
  });

  async function join(role: "member" | "viewer") {
    const [sent] = await createInvites({
      projectId: project.id,
      invitedBy: owner,
      role,
      contacts: [{ channel: "sms", contact: `+1415${randomBytes(3).readUIntBE(0, 3)}`, codeRequired: false }],
    });
    assert.ok(sent);
    const user = uid();
    assert.equal((await acceptInvite({ token: sent.token, userId: user })).ok, true);
    return user;
  }
  const member = await join("member");
  const viewer = await join("viewer");
  const stranger = uid();
  const keyId = `key_${randomBytes(4).toString("hex")}`;
  await addAgentViewer({ projectId: project.id, userId: owner, keyId });
  const agentOwner = uid();

  const can = async (userId: string, access: "read" | "write", key?: string) =>
    Boolean(await getMachine(machine.id, { ownerUserId: userId, access, keyId: key }));

  assert.equal(await can(member, "write"), true);
  assert.equal(await can(viewer, "read"), true);
  assert.equal(await can(viewer, "write"), false);
  assert.equal(await can(agentOwner, "read", keyId), true);
  assert.equal(await can(agentOwner, "write", keyId), false);
  assert.equal(await can(stranger, "read"), false);
  assert.equal((await listMachines({ ownerUserId: viewer })).length, 1);
  assert.equal((await listMachines({ ownerUserId: stranger })).length, 0);
});

void test("repos may share a name; named projects stay unique per owner", async () => {
  const owner = uid();
  const a = await upsertProject({ ownerUserId: owner, name: "app", repoKey: repo() });
  const b = await upsertProject({ ownerUserId: owner, name: "app", repoKey: repo() });
  assert.notEqual(a.id, b.id);
  const named = await upsertProject({ ownerUserId: owner, name: "app" });
  assert.equal((await upsertProject({ ownerUserId: owner, name: "app" })).id, named.id);
  assert.notEqual(named.id, a.id);
});

void test("join codes: one per minute, five per invite", async () => {
  const { token, invite: row } = await invite(uid());
  assert.equal((await issueJoinCode(token)).ok, true);
  assert.deepEqual(await issueJoinCode(token), { ok: false, reason: "cooldown" });
  // Simulate the minute passing and the cap being nearly used.
  const { db } = await import("~/server/db");
  const { projectInvites } = await import("~/server/db/schema");
  const { eq } = await import("drizzle-orm");
  await db.update(projectInvites).set({ codeSentAt: new Date(Date.now() - 120_000), codesSent: 4 }).where(eq(projectInvites.id, row.id));
  assert.equal((await issueJoinCode(token)).ok, true);
  await db.update(projectInvites).set({ codeSentAt: new Date(Date.now() - 120_000) }).where(eq(projectInvites.id, row.id));
  assert.deepEqual(await issueJoinCode(token), { ok: false, reason: "limit" });
});
