import { db } from "~/server/db";
import { waitlist } from "~/server/db/schema";

/**
 * Optional seed entrypoint. Intentionally empty — no dummy waitlist rows.
 * Add real emails here only when you need fixtures for local QA.
 */
async function main() {
  const count = await db.$count(waitlist);
  console.log(`Waitlist rows: ${count}. No seed data inserted.`);
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error("Failed to seed database:", error);
  process.exit(1);
});
