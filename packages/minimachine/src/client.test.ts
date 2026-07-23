import assert from "node:assert/strict";
import { test } from "node:test";

import { Minimachine } from "./client.js";
import { MinimachineError } from "./errors.js";

void test("creates machine with bearer auth", async () => {
  const calls: { url: string; headers: Headers }[] = [];
  const mm = new Minimachine({
    apiKey: "mm_test",
    baseUrl: "https://example.test",
    fetch: async (input, init) => {
      const url = String(input);
      calls.push({ url, headers: new Headers(init?.headers) });
      return new Response(
        JSON.stringify({
          machine: {
            id: "vm_1",
            name: "vm-1",
            title: "t",
            agent: "any",
            task: "build",
            status: "running",
            region: "us-west-2",
            cpu: 2,
            memoryGb: 4,
          },
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      );
    },
  });

  const machine = await mm.machines.create({ templateId: "node-ts" });
  assert.equal(machine.id, "vm_1");
  assert.equal(calls[0]?.url, "https://example.test/api/v1/machines");
  assert.equal(calls[0]?.headers.get("authorization"), "Bearer mm_test");
});

void test("maps API errors to MinimachineError", async () => {
  const mm = new Minimachine({
    apiKey: "mm_test",
    baseUrl: "https://example.test",
    fetch: async () =>
      new Response(
        JSON.stringify({
          error: { code: "unauthorized", message: "Invalid API key" },
        }),
        { status: 401, headers: { "content-type": "application/json" } },
      ),
  });

  await assert.rejects(
    () => mm.machines.list(),
    (err: unknown) => {
      assert.ok(err instanceof MinimachineError);
      assert.equal(err.status, 401);
      assert.equal(err.code, "unauthorized");
      return true;
    },
  );
});
