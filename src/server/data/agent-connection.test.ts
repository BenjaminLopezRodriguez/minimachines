import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { agentConnection, agentStatusScript } from "./agent-connection";
import { createMachine } from "./machine-store";
void test("agent account checks reject another owner before touching compute", async () => {
  const owner = `user_${randomUUID()}`;
  const m = await createMachine({ templateId: "node-ts", ownerUserId: owner });
  await assert.rejects(
    () => agentConnection(`user_${randomUUID()}`, m.id, "codex"),
    /Machine not found/,
  );
  await assert.rejects(
    () => agentConnection(owner, m.id, "claude"),
    /Start a cloud machine/,
  );
});

void test("agent status executes without exposing CLI account diagnostics", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const { execFileSync } = await import("node:child_process");
  const dir = await mkdtemp(path.join(tmpdir(), "mm-agent-auth-"));
  try {
    await writeFile(
      path.join(dir, "codex"),
      '#!/bin/sh\necho "secret-account-token"\necho "private-diagnostic" >&2\nexit 0\n',
      { mode: 0o755 },
    );
    const output = execFileSync(
      "python3",
      ["-c", agentStatusScript(["codex", "login", "status"])],
      {
        encoding: "utf8",
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
      },
    );
    assert.deepEqual(JSON.parse(output), { installed: true, connected: true });
    assert.doesNotMatch(output, /secret|private/);
    await writeFile(path.join(dir, "codex"), "#!/bin/sh\nexit 1\n", {
      mode: 0o755,
    });
    const failed = execFileSync(
      "python3",
      ["-c", agentStatusScript(["codex", "login", "status"])],
      {
        encoding: "utf8",
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
      },
    );
    assert.equal(
      (JSON.parse(failed) as { connected: boolean }).connected,
      false,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
