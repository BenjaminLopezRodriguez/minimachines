/**
 * Create a WorkOS AuthKit user (agent / test helper).
 *
 * Usage:
 *   pnpm auth:create-user -- --email you@example.com --password 'ChangeMe_now_1!'
 *   pnpm auth:create-user -- --email you@example.com --password '…' --first Ada --last Lovelace --verified --json
 *
 * Requires WORKOS_API_KEY in .env.local (loaded via package script --env-file).
 * Docs: AUTH.md · https://workos.com/docs/reference/user-management/user/create
 */

import { WorkOS } from "@workos-inc/node";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}

function has(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const email = flag("email");
  const password = flag("password");
  const firstName = flag("first");
  const lastName = flag("last");
  const emailVerified = has("verified");
  const asJson = has("json");

  if (!email || !password) {
    console.error(
      "Usage: pnpm auth:create-user -- --email <email> --password <password> [--first N] [--last N] [--verified] [--json]",
    );
    process.exit(1);
  }

  const apiKey = process.env.WORKOS_API_KEY;
  if (!apiKey?.startsWith("sk_")) {
    console.error("WORKOS_API_KEY missing or invalid (expected sk_…). See AUTH.md.");
    process.exit(1);
  }

  const workos = new WorkOS(apiKey);
  const user = await workos.userManagement.createUser({
    email,
    password,
    firstName,
    lastName,
    emailVerified,
  });

  if (asJson) {
    console.log(JSON.stringify(user, null, 2));
  } else {
    console.log(`Created WorkOS user ${user.id}`);
    console.log(`  email: ${user.email}`);
    console.log("Sign in at http://localhost:3000/sign-in");
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
