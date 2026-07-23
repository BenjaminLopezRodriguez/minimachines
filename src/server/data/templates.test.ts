import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getTemplate,
  loadTemplates,
  recommendTemplates,
  searchTemplates,
} from "./templates";

void test("loads all expected template ids", () => {
  const templates = loadTemplates();
  const ids = templates.map((t) => t.id).sort();
  assert.deepEqual(ids, [
    "agent-shell",
    "claude-devbox",
    "codex-devbox",
    "cursor-workspace",
    "data-ml",
    "fullstack-web",
    "gemini-devbox",
    "grok-bench",
    "node-ts",
    "python",
  ]);
});

void test("searchTemplates matches tags and agents", () => {
  const hits = searchTemplates("python pytest");
  assert.ok(hits.some((t) => t.id === "python"));
  const claude = searchTemplates("claude");
  assert.ok(claude.some((t) => t.id === "claude-devbox"));
});

void test("recommendTemplates ranks agent + stack signals", () => {
  const recs = recommendTemplates(
    "Claude should refactor a TypeScript Next.js dashboard",
  );
  assert.ok(recs.length > 0);
  assert.ok(
    ["claude-devbox", "fullstack-web", "node-ts", "cursor-workspace"].includes(
      recs[0]!.template.id,
    ),
  );
  assert.ok(recs[0]!.reason.length > 10);
});

void test("getTemplate returns undefined for unknown ids", () => {
  assert.equal(getTemplate("nope"), undefined);
});
