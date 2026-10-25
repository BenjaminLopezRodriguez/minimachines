/** Dry run by default. Run with --apply only after reviewing the selected users. No emails are sent. */
import { WorkOS } from "@workos-inc/node";
import { sql } from "drizzle-orm";
import { env } from "../src/env.js";
import { db } from "../src/server/db";
import { enrollVerifiedUser, reviewApplication } from "../src/server/data/beta";
const admins = (env.BETA_ADMIN_USER_IDS ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);
if (!admins.length)
  throw new Error(
    "Set BETA_ADMIN_USER_IDS to verified WorkOS user IDs before bootstrapping.",
  );
const candidates = new Set(admins);
if (process.argv.includes("--include-existing")) {
  const users = await db.execute<{ id: string }>(
    sql`SELECT "ownerUserId" id FROM minimachines_machine WHERE "ownerUserId" IS NOT NULL UNION SELECT "userId" id FROM minimachines_api_key WHERE "revokedAt" IS NULL`,
  );
  for (const user of users) candidates.add(user.id);
}
console.log(
  `Review ${candidates.size} account IDs (${admins.length} administrators). No email is sent.`,
);
const workos = new WorkOS(env.WORKOS_API_KEY);
for (const id of candidates) {
  const user = await workos.userManagement.getUser(id);
  if (!user.emailVerified) {
    console.log(`${id}: skipped; email unverified`);
    continue;
  }
  console.log(
    `${id}: verified; ${admins.includes(id) ? "administrator" : "existing tester"}`,
  );
  if (process.argv.includes("--apply")) {
    const entry = await enrollVerifiedUser(user);
    await reviewApplication(
      admins[0]!,
      entry.id,
      "approved",
      admins.includes(id) ? "operators" : "existing-users",
    );
  }
}
console.log(
  process.argv.includes("--apply")
    ? "Beta admissions updated."
    : "Dry run complete. Re-run with --apply to admit these verified accounts.",
);
process.exit(0);
