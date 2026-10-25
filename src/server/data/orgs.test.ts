import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";

import { createOrg, listColleagues, listOrgPeople, removeOrgMember, setOrgRole } from "./orgs";
import { acceptInvite, addTeammate, createInvites, getRole, issueJoinCode, resolveInvite, upsertProject } from "./projects";
import { deleteSecret, listSecrets, open, seal, setSecret } from "./secrets";

const uid = () => `user_${randomBytes(6).toString("hex")}`;

async function join(orgId: string, by: string, who: string, role: "member" | "admin" = "member") {
  const [sent] = await createInvites({
    orgId,
    invitedBy: by,
    role,
    contacts: [{ channel: "email", contact: `${who}@acme.dev`, codeRequired: true }],
  });
  assert.ok(sent);
  const issued = await issueJoinCode(sent.token);
  assert.ok(issued.ok);
  return acceptInvite({ token: sent.token, userId: who, code: issued.code });
}

void test("a team invite resolves to the team and joins it with the code", async () => {
  const owner = uid();
  const org = await createOrg({ userId: owner, name: "Acme" });
  const [sent] = await createInvites({
    orgId: org.id,
    invitedBy: owner,
    role: "member",
    contacts: [{ channel: "email", contact: "ana@acme.dev", codeRequired: true }],
  });
  assert.ok(sent);
  const found = await resolveInvite(sent.token);
  assert.equal(found?.org?.id, org.id);
  assert.equal(found?.project, null);

  const ana = uid();
  const issued = await issueJoinCode(sent.token);
  assert.ok(issued.ok);
  assert.deepEqual(await acceptInvite({ token: sent.token, userId: ana, code: issued.code }), {
    ok: true,
    orgId: org.id,
    role: "member",
  });
  const people = await listOrgPeople(org.id, owner);
  assert.deepEqual(people.members.map((m) => m.role), ["owner", "member"]);
  assert.equal(people.pending.length, 0);
});

void test("only owners and admins invite; only the owner makes admins", async () => {
  const owner = uid();
  const org = await createOrg({ userId: owner, name: "Acme" });
  const ana = uid();
  await join(org.id, owner, ana);
  const bob = uid();
  await assert.rejects(join(org.id, ana, bob), /owners and admins/);

  assert.ok(await setOrgRole({ orgId: org.id, userId: owner, target: ana, role: "admin" }));
  assert.deepEqual(await join(org.id, ana, bob), { ok: true, orgId: org.id, role: "member" });
  await assert.rejects(join(org.id, ana, uid(), "admin"), /Only the team owner/);
  await assert.rejects(removeOrgMember({ orgId: org.id, userId: ana, target: owner }), /owner can't be removed/);
  assert.ok(await removeOrgMember({ orgId: org.id, userId: ana, target: bob }));
});

void test("teammates can be added to a project directly; strangers can't", async () => {
  const owner = uid();
  const org = await createOrg({ userId: owner, name: "Acme" });
  const ana = uid();
  await join(org.id, owner, ana);
  assert.deepEqual((await listColleagues(owner)).map((c) => c.userId), [ana]);

  const project = await upsertProject({ ownerUserId: owner, name: "app", repoKey: `github.com/t/${randomBytes(4).toString("hex")}` });
  assert.equal(await addTeammate({ projectId: project.id, userId: owner, target: ana, role: "member" }), "added");
  assert.equal(await getRole(project.id, ana), "member");
  assert.equal(await addTeammate({ projectId: project.id, userId: owner, target: ana, role: "viewer" }), "already");
  assert.equal(await getRole(project.id, ana), "member"); // never downgraded

  await assert.rejects(addTeammate({ projectId: project.id, userId: owner, target: uid(), role: "member" }), /from your team/);
  await assert.rejects(addTeammate({ projectId: project.id, userId: ana, target: owner, role: "member" }), /owner/);
});

void test("provider keys are sealed per owner and name, and listed without values", async () => {
  const k = randomBytes(32);
  const sealed = seal("sk-ant-123", "u:A", k);
  assert.equal(open(sealed, "u:A", k), "sk-ant-123");
  assert.throws(() => open(sealed, "u:B", k)); // moved to another name/owner → unreadable

  const me = uid();
  await setSecret({ userId: me, name: "anthropic_api_key", value: "sk-ant-abcd1234" });
  await setSecret({ userId: me, name: "ANTHROPIC_API_KEY", value: "sk-ant-wxyz9876" });
  assert.deepEqual((await listSecrets(me)).map((s) => [s.name, s.lastFour]), [["ANTHROPIC_API_KEY", "9876"]]);
  await assert.rejects(setSecret({ userId: me, name: "MINIMACHINE_API_KEY", value: "x" }), /reserved/);
  await assert.rejects(setSecret({ userId: me, name: "bad name", value: "x" }), /env var/);
  assert.ok(await deleteSecret(me, "ANTHROPIC_API_KEY"));
});
