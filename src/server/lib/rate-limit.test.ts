import assert from "node:assert/strict";
import { test } from "node:test";

import { rateLimit } from "./rate-limit";

void test("blocks past the limit, recovers after the window", () => {
  const key = `t-${Math.random()}`;
  const opts = { limit: 2, windowMs: 1000, now: 0 };

  assert.equal(rateLimit(key, { ...opts, now: 0 }).ok, true);
  assert.equal(rateLimit(key, { ...opts, now: 100 }).ok, true);
  assert.equal(rateLimit(key, { ...opts, now: 200 }).ok, false); // 3rd in window

  // Window has passed — earlier hits expire.
  assert.equal(rateLimit(key, { ...opts, now: 1300 }).ok, true);
});

void test("keys are isolated", () => {
  const opts = { limit: 1, windowMs: 1000, now: 0 };
  assert.equal(rateLimit("a", opts).ok, true);
  assert.equal(rateLimit("b", opts).ok, true);
  assert.equal(rateLimit("a", opts).ok, false);
});
