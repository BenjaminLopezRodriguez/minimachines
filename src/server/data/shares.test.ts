import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";

import { db } from "~/server/db";
import { machines as machinesTable } from "~/server/db/schema";

import {
  assertSafeOrigin,
  checkGate,
  createShare,
  getShareBySlug,
  revokeShare,
} from "./shares";

const uid = () => `user_${randomBytes(6).toString("hex")}`;
const basic = (pass: string) => "Basic " + Buffer.from("x:" + pass).toString("base64");

void test("assertSafeOrigin blocks SSRF targets", () => {
  for (const bad of [
    "http://foo.com", // not https
    "https://localhost",
    "https://127.0.0.1",
    "https://10.1.2.3",
    "https://192.168.0.5",
    "https://172.16.9.9",
    "https://169.254.169.254", // cloud metadata
    "https://svc.internal",
  ]) {
    assert.throws(() => assertSafeOrigin(bad), new RegExp("Origin"), bad);
  }
  assert.equal(
    assertSafeOrigin("https://abc123.trycloudflare.com/x"),
    "https://abc123.trycloudflare.com",
  );
});

void test("local share: gated needs a secret; gate checks Basic", async () => {
  const owner = uid();
  await assert.rejects(
    () =>
      createShare({
        ownerUserId: owner,
        originKind: "local",
        localUrl: "https://demo.trycloudflare.com",
        kind: "website",
        access: "gated",
      }),
    /secret/,
  );
  const row = await createShare({
    ownerUserId: owner,
    originKind: "local",
    localUrl: "https://demo.trycloudflare.com",
    kind: "api",
    access: "gated",
    secret: "hunter2",
  });
  assert.equal(checkGate(row, null), false);
  assert.equal(checkGate(row, basic("wrong")), false);
  assert.equal(checkGate(row, basic("hunter2")), true);
});

void test("public share resolves; revoke disables it", async () => {
  const owner = uid();
  const row = await createShare({
    ownerUserId: owner,
    originKind: "local",
    localUrl: "https://pub.trycloudflare.com",
    kind: "website",
    access: "public",
  });
  assert.equal(checkGate(row, null), true);
  assert.notEqual(await getShareBySlug(row.slug), null);
  assert.equal(await revokeShare({ ownerUserId: owner, slug: row.slug }), true);
  assert.equal(await getShareBySlug(row.slug), null); // enabled=false → gone
});

void test("machine share resolves origin from the port map, rejects missing", async () => {
  const owner = uid();
  const id = `vm_${randomBytes(3).toString("hex")}`;
  await db.insert(machinesTable).values({
    id,
    name: "t",
    title: "t",
    agent: "any",
    task: "t",
    status: "running",
    region: "modal",
    cpu: 1,
    memoryGb: 1,
    uptime: "0m",
    lastActive: "now",
    ownerUserId: owner,
    ports: { "3000": "https://tunnel-3000.modal.host" },
  });
  const row = await createShare({
    ownerUserId: owner,
    originKind: "machine",
    machineId: id,
    port: 3000,
    kind: "website",
    access: "public",
  });
  assert.equal(row.originUrl, "https://tunnel-3000.modal.host");
  await assert.rejects(
    () =>
      createShare({
        ownerUserId: owner,
        originKind: "machine",
        machineId: id,
        port: 9999,
        kind: "api",
        access: "public",
      }),
    /not exposed/,
  );
});
