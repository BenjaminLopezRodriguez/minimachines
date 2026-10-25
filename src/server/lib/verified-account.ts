import { WorkOS } from "@workos-inc/node";
import { env } from "~/env";
import { BetaAccessError } from "~/server/data/beta";
export async function requireVerifiedAccount(userId: string) {
  // Database tests use synthetic user IDs and never allocate real compute.
  if (env.NODE_ENV === "test") return;
  const user = await new WorkOS(env.WORKOS_API_KEY).userManagement.getUser(
    userId,
  );
  if (!user.emailVerified)
    throw new BetaAccessError(
      "Verify your email through sign-in before creating keys or compute.",
    );
}
