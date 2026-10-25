import { requireVerifiedAccount } from "./verified-account";
import { and, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { env } from "~/env";
import { db } from "~/server/db";
import { computeReservations, machines } from "~/server/db/schema";
import {
  BetaAccessError,
  requireBetaAccess,
  isBetaAdmin,
} from "~/server/data/beta";
import { enforceRateLimit, RequestLimitError } from "./distributed-rate-limit";

export async function reserveCompute(
  userId: string | undefined,
  machineId: string,
  restarting = false,
  resources?: { cpu: number; memoryGb: number },
) {
  if (env.COMPUTE_ENABLED === "false")
    throw new BetaAccessError(
      "New compute is temporarily paused. Your files and existing machines remain accessible.",
    );
  if (!userId)
    throw new BetaAccessError(
      "A verified account is required to create compute.",
    );
  await requireVerifiedAccount(userId);
  await requireBetaAccess(userId);
  // Operators manage the existing development fleet separately from tester quotas.
  if (isBetaAdmin(userId)) return;
  if (
    resources &&
    (resources.cpu > env.BETA_MAX_MACHINE_CPU ||
      resources.memoryGb > env.BETA_MAX_MACHINE_MEMORY_GB)
  )
    throw new BetaAccessError(
      `This template exceeds the beta limit of ${env.BETA_MAX_MACHINE_CPU} CPUs and ${env.BETA_MAX_MACHINE_MEMORY_GB} GB of memory. Choose a smaller template.`,
    );
  try {
    await enforceRateLimit(
      `compute:day:${userId}`,
      env.BETA_MAX_MACHINE_CREATES_PER_DAY,
      24 * 60 * 60_000,
    );
  } catch (error) {
    if (error instanceof RequestLimitError)
      throw new RequestLimitError(
        "Daily machine start limit reached. Try again after the daily window resets.",
        error.retryAfter,
      );
    throw error;
  }
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`compute:${userId}`}, 0))`,
    );
    await tx
      .delete(computeReservations)
      .where(
        and(
          eq(computeReservations.userId, userId),
          sql`${computeReservations.expiresAt} <= now()`,
        ),
      );
    const [active] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(machines)
      .where(
        and(
          eq(machines.ownerUserId, userId),
          inArray(machines.status, ["running", "starting"]),
          restarting ? ne(machines.id, machineId) : undefined,
        ),
      );
    const [pending] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(computeReservations)
      .where(
        and(
          eq(computeReservations.userId, userId),
          gt(computeReservations.expiresAt, new Date()),
        ),
      );
    if (
      (active?.count ?? 0) + (pending?.count ?? 0) >=
      env.BETA_MAX_ACTIVE_MACHINES
    )
      throw new RequestLimitError(
        `You can run ${env.BETA_MAX_ACTIVE_MACHINES} machines at a time during the beta. Stop a machine before creating another.`,
        60,
      );
    const reserved = await tx
      .insert(computeReservations)
      .values({
        id: machineId,
        userId,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      })
      .onConflictDoNothing()
      .returning({ id: computeReservations.id });
    if (!reserved.length)
      throw new RequestLimitError("This machine is already being started.", 30);
  });
}
export const releaseCompute = (id: string) =>
  db.delete(computeReservations).where(eq(computeReservations.id, id));
