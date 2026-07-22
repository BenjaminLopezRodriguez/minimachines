import { db } from "~/server/db";
import { waitlist } from "~/server/db/schema";

const seedEmails = [
  "founder@minimachines.dev",
  "early-tester@minimachines.dev",
  "beta@minimachines.dev",
];

async function main() {
  await db
    .insert(waitlist)
    .values(seedEmails.map((email) => ({ email })))
    .onConflictDoNothing();

  console.log(`Seeded ${seedEmails.length} waitlist entries.`);
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error("Failed to seed database:", error);
  process.exit(1);
});
