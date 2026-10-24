import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { botWorker, conversationContext } from "./runner";

void test("conversation context keeps recent roles and stays within the command byte limit", () => {
  const messages = Array.from({ length: 40 }, (_, i) => ({
    role: i % 2 ? "assistant" : "user",
    content: `${i}: ` + "你好🌳".repeat(600),
  }));
  const context = conversationContext("Be useful.", messages);
  const recent = JSON.parse(context.transcript) as { content: string }[];
  assert.ok(recent.length <= 20);
  assert.match(recent.at(-1)!.content, /^39:/);
  assert.ok(Buffer.byteLength(JSON.stringify(context)) <= 30000);
});
void test("account runner uses argv and stdin, disables tools and parses Claude and Codex results", () => {
  const root = mkdtempSync(join(tmpdir(), "mm-bot-test-"));
  try {
    const script =
      '#!/usr/bin/python3\nimport sys,json,os\nassert "--tools" in sys.argv if os.path.basename(sys.argv[0]) == "claude" else "features.shell_tool=false" in sys.argv\nprompt=sys.stdin.read()\nassert "$(touch /tmp/should-never-exist)" in prompt\nif os.path.basename(sys.argv[0]) == "claude":\n print(json.dumps({"is_error":False,"result":"Real adapter test reply"}))\nelse:\n print(json.dumps({"type":"item.completed","item":{"type":"agent_message","text":"Codex adapter reply"}}))\n';
    for (const name of ["claude", "codex"])
      writeFileSync(join(root, name), script, { mode: 0o755 });
    for (const provider of ["claude", "codex"]) {
      const payload = Buffer.from(
        JSON.stringify({
          provider,
          instructions: "Be helpful",
          transcript: "$(touch /tmp/should-never-exist)",
        }),
      ).toString("base64");
      const result = JSON.parse(
        execFileSync("python3", ["-c", botWorker, payload], {
          encoding: "utf8",
          env: { ...process.env, PATH: `${root}:/usr/bin:/bin` },
        }),
      ) as { ok: boolean; reply: string };
      assert.equal(result.ok, true);
      assert.match(result.reply, /reply/);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
void test("missing CLI is a real setup error and never fabricates an answer", () => {
  const payload = Buffer.from(
    JSON.stringify({
      provider: "claude",
      instructions: "x",
      transcript: "hello",
    }),
  ).toString("base64");
  const result = JSON.parse(
    execFileSync("/usr/bin/python3", ["-c", botWorker, payload], {
      encoding: "utf8",
      env: { ...process.env, PATH: "/nonexistent" },
    }),
  ) as { ok: boolean; error: string };
  assert.equal(result.ok, false);
  assert.match(result.error, /Install claude/);
});
