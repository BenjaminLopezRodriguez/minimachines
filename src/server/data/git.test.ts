import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { db } from "~/server/db";
import { execs } from "~/server/db/schema";
import { createMachine, stopMachine } from "./machine-store";
import { machineGit } from "./git";
import { execMachine } from "./session-store";

void test("Git rejects cross-owner and stopped machines before running any commands", async () => {
  const owner = `git-test-${randomUUID()}`;
  const machine = await createMachine({
    ownerUserId: owner,
    templateId: "node-ts",
  });
  await assert.rejects(
    () =>
      machineGit(machine.id, "someone-else", {
        action: "status",
        path: "/workspace",
      }),
    /Machine not found/,
  );
  await stopMachine(machine.id, { ownerUserId: owner });
  await assert.rejects(
    () =>
      machineGit(machine.id, owner, { action: "status", path: "/workspace" }),
    /Start the machine/,
  );
});
void test("checkpoint-enabled exec fails closed when it cannot save the checkpoint", async () => {
  const owner = `git-test-${randomUUID()}`;
  const machine = await createMachine({
    ownerUserId: owner,
    templateId: "node-ts",
  });
  await assert.rejects(
    () =>
      execMachine(
        machine.id,
        { cmd: "touch important.txt", checkpoint: { path: "/workspace" } },
        { ownerUserId: owner },
      ),
    /connected cloud machine/,
  );
  assert.equal(
    (await db.select().from(execs).where(eq(execs.machineId, machine.id)))
      .length,
    0,
  );
});
