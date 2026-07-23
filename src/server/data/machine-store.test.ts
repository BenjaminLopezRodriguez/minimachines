import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";

import { createMachine, listMachines } from "./machine-store";

// Postgres-backed: scope by a unique owner per test instead of wiping the
// table, so these are safe to run against a shared database.
const uid = () => `user_${randomBytes(6).toString("hex")}`;

void test("creates a running machine from a template", async () => {
  const owner = uid();
  const machine = await createMachine({
    templateId: "node-ts",
    task: "refactor auth",
    ownerUserId: owner,
  });
  assert.equal(machine.status, "running");
  assert.equal(machine.templateId, "node-ts");
  assert.equal(machine.dockerfile, "node-ts/Dockerfile");
  assert.equal(machine.task, "refactor auth");
  assert.equal((await listMachines({ ownerUserId: owner })).length, 1);
});

void test("rejects unknown templates", async () => {
  await assert.rejects(
    () => createMachine({ templateId: "missing", ownerUserId: uid() }),
    /Unknown template/,
  );
});

void test("machines persist across calls and newest comes first", async () => {
  const owner = uid();
  await createMachine({ templateId: "node-ts", task: "first", ownerUserId: owner });
  await createMachine({ templateId: "python", task: "second", ownerUserId: owner });
  const list = await listMachines({ ownerUserId: owner });
  assert.equal(list.length, 2);
  assert.equal(list[0]?.task, "second");
});
