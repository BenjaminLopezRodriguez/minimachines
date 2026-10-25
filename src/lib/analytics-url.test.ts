import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeAnalyticsUrl } from "./analytics-url";
void test("analytics excludes auth and private bearer-link routes", () => {
  for (const path of [
    "/auth/callback?code=secret",
    "/join/invite-secret",
    "/pager/reply/private-token",
    "/api/trpc/beta.status",
    "/sign-in",
  ])
    assert.equal(
      sanitizeAnalyticsUrl(`https://www.minimachin.es${path}`),
      null,
    );
});
void test("analytics strips queries, fragments, and project identifiers", () => {
  assert.equal(
    sanitizeAnalyticsUrl(
      "https://www.minimachin.es/p/abc-123?token=secret#private",
    ),
    "https://www.minimachin.es/p/project",
  );
  assert.equal(
    sanitizeAnalyticsUrl(
      "https://www.minimachin.es/dashboard?email=private@example.test",
    ),
    "https://www.minimachin.es/dashboard",
  );
  assert.equal(
    sanitizeAnalyticsUrl(
      "https://www.minimachin.es/?utm_source=github&utm_campaign=beta-01&other=secret",
    ),
    "https://www.minimachin.es/?utm_source=github&utm_campaign=beta-01",
  );
  assert.equal(sanitizeAnalyticsUrl("not a url"), null);
});

void test("baton reply tokens never reach analytics", () => {
  assert.equal(
    sanitizeAnalyticsUrl("https://www.minimachin.es/m/secret-reply-token"),
    null,
  );
});
