import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";

import {
  createMachine,
  getMachine,
  listMachines,
  stopMachine,
} from "./machine-store";
import {
  createJob,
  execMachine,
  getJob,
  getMachineFile,
  putMachineFile,
} from "./session-store";

// Everything is Postgres-backed now; isolate by a unique owner per test
// rather than wiping shared tables.
const uid = () => `user_${randomBytes(6).toString("hex")}`;

void test("scopes machines by ownerUserId", async () => {
  const a = uid();
  const b = uid();
  await createMachine({ templateId: "node-ts", ownerUserId: a });
  await createMachine({ templateId: "python", ownerUserId: b });
  assert.equal((await listMachines({ ownerUserId: a })).length, 1);
  assert.equal((await listMachines({ ownerUserId: b })).length, 1);
});

void test("stop, exec, files, and jobs stubs", async () => {
  const a = uid();
  const b = uid();

  const machine = await createMachine({
    templateId: "node-ts",
    ownerUserId: a,
    task: "build",
  });
  const stopped = await stopMachine(machine.id, { ownerUserId: a });
  assert.equal(stopped?.status, "stopped");

  const m2 = await createMachine({ templateId: "agent-shell", ownerUserId: a });

  const exec = await execMachine(m2.id, { cmd: "pnpm build" }, { ownerUserId: a });
  assert.equal(exec.exitCode, 0);
  assert.match(exec.stdout, /pnpm build/);

  await putMachineFile(m2.id, "src/app.ts", "console.log(1)", {
    ownerUserId: a,
  });
  const file = await getMachineFile(m2.id, "src/app.ts", { ownerUserId: a });
  assert.equal(Buffer.from(file!).toString("utf8"), "console.log(1)");

  const job = await createJob(
    m2.id,
    { type: "render", input: { w: 10 } },
    { ownerUserId: a },
  );
  assert.equal(job.status, "succeeded");
  assert.equal((await getJob(job.id, { ownerUserId: a }))?.id, job.id);
  assert.equal(await getJob(job.id, { ownerUserId: b }), null);
  assert.equal(await getMachine(m2.id, { ownerUserId: b }), null);
});

void test("cross-owner machine access is denied", async () => {
  const owner = uid();
  const attacker = uid();
  const m = await createMachine({ templateId: "node-ts", ownerUserId: owner });
  assert.equal(await getMachine(m.id, { ownerUserId: attacker }), null);
  assert.equal(await stopMachine(m.id, { ownerUserId: attacker }), null);
  assert.equal(
    (await getMachine(m.id, { ownerUserId: owner }))?.status,
    "running",
  );
});

void test("session ops reject a machine the caller does not own", async () => {
  const owner = uid();
  const attacker = uid();
  const m = await createMachine({ templateId: "node-ts", ownerUserId: owner });

  await assert.rejects(
    () => execMachine(m.id, { cmd: "whoami" }, { ownerUserId: attacker }),
    /Machine not found/,
  );
  await assert.rejects(
    () => getMachineFile(m.id, "src/app.ts", { ownerUserId: attacker }),
    /Machine not found/,
  );
  await assert.rejects(
    () => putMachineFile(m.id, "x.txt", "pwned", { ownerUserId: attacker }),
    /Machine not found/,
  );
});

void test("file writes upsert rather than duplicate", async () => {
  const owner = uid();
  const m = await createMachine({ templateId: "node-ts", ownerUserId: owner });
  await putMachineFile(m.id, "a.txt", "one", { ownerUserId: owner });
  const second = await putMachineFile(m.id, "a.txt", "two-longer", {
    ownerUserId: owner,
  });
  assert.equal(second.bytes, 10);
  const got = await getMachineFile(m.id, "a.txt", { ownerUserId: owner });
  assert.equal(Buffer.from(got!).toString("utf8"), "two-longer");
});
