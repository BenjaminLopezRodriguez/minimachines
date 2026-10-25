import { desc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { betaApplications, betaFeedback, waitlist } from "~/server/db/schema";
import { env } from "~/env";

export const betaGateEnabled = () => env.BETA_GATE_ENABLED === "true";
export const isBetaAdmin = (id: string) =>
  (env.BETA_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .includes(id);
export class BetaAccessError extends Error {
  constructor(message = "Your beta application is awaiting approval.") {
    super(message);
    this.name = "BetaAccessError";
  }
}
export async function requireBetaAccess(userId: string) {
  if (!betaGateEnabled()) return;
  return requireApprovedEnrollment(userId);
}
export async function requireApprovedEnrollment(userId: string) {
  if (isBetaAdmin(userId)) return;
  const [entry] = await db
    .select({
      status: betaApplications.status,
      verifiedAt: betaApplications.verifiedAt,
    })
    .from(betaApplications)
    .where(eq(betaApplications.userId, userId))
    .limit(1);
  if (!entry?.verifiedAt || entry.status !== "approved")
    throw new BetaAccessError();
}
export async function enrollVerifiedUser(user: {
  id: string;
  email: string;
  emailVerified: boolean;
}) {
  if (!user.emailVerified)
    throw new BetaAccessError(
      "Verify your email through sign-in before joining the beta.",
    );
  const email = user.email.trim().toLowerCase();
  const [existingUser] = await db
    .select()
    .from(betaApplications)
    .where(eq(betaApplications.userId, user.id))
    .limit(1);
  if (existingUser && existingUser.email !== email) {
    // An email change requires a fresh verified enrollment, but retains reviewed admission.
    await db
      .update(betaApplications)
      .set({ email, verifiedAt: new Date() })
      .where(eq(betaApplications.id, existingUser.id));
  } else {
    await db
      .insert(betaApplications)
      .values({
        email,
        userId: user.id,
        verifiedAt: new Date(),
        status: isBetaAdmin(user.id) ? "approved" : "pending",
      })
      .onConflictDoUpdate({
        target: betaApplications.email,
        set: { userId: user.id, verifiedAt: new Date() },
        setWhere: or(
          isNull(betaApplications.userId),
          eq(betaApplications.userId, user.id),
        ),
      });
  }
  const [entry] = await db
    .select()
    .from(betaApplications)
    .where(eq(betaApplications.userId, user.id))
    .limit(1);
  if (!entry)
    throw new BetaAccessError(
      "This email belongs to another enrollment. Contact support.",
    );
  return entry;
}
export async function joinEarlyAccess(email: string, feedbackConsent: boolean) {
  await db.transaction(async (tx) => {
    await tx.insert(waitlist).values({ email }).onConflictDoNothing();
    // Repeated public submissions never change reviewed admission or user ownership.
    await tx
      .insert(betaApplications)
      .values({ email, feedbackConsent })
      .onConflictDoNothing();
  });
}
export async function updateBetaProfile(
  userId: string,
  input: { role: string; useCase: string; feedbackConsent: boolean },
) {
  await db
    .update(betaApplications)
    .set(input)
    .where(eq(betaApplications.userId, userId));
}
export const betaQueue = () =>
  db
    .select()
    .from(betaApplications)
    .orderBy(desc(betaApplications.createdAt))
    .limit(300);
export const feedbackQueue = () =>
  db
    .select()
    .from(betaFeedback)
    .orderBy(desc(betaFeedback.createdAt))
    .limit(200);
export async function reviewApplication(
  admin: string,
  id: string,
  status: "approved" | "pending" | "revoked",
  cohort: string,
) {
  if (!isBetaAdmin(admin))
    throw new BetaAccessError("Administrator access is required.");
  const [entry] = await db
    .select()
    .from(betaApplications)
    .where(eq(betaApplications.id, id))
    .limit(1);
  if (!entry) throw new Error("Application not found.");
  if (status === "approved" && !entry.verifiedAt)
    throw new Error("The applicant must verify their account before approval.");
  await db
    .update(betaApplications)
    .set({ status, cohort, reviewedBy: admin, reviewedAt: new Date() })
    .where(eq(betaApplications.id, id));
}
export async function betaMetrics() {
  const [metrics] = await db.execute<{
    applicants: number;
    verified: number;
    approved: number;
    feedback: number;
  }>(
    sql`SELECT (SELECT count(*)::int FROM minimachines_beta_application) applicants, (SELECT count(*)::int FROM minimachines_beta_application WHERE "verifiedAt" IS NOT NULL) verified, (SELECT count(*)::int FROM minimachines_beta_application WHERE status = 'approved') approved, (SELECT count(*)::int FROM minimachines_beta_feedback) feedback`,
  );
  return metrics!;
}
export async function saveFeedback(
  userId: string,
  input: {
    kind: "bug" | "idea" | "experience";
    message: string;
    rating?: number;
    surface: "bot" | "whiteboard" | "machines" | "other";
  },
) {
  await db.insert(betaFeedback).values({ ...input, userId });
}
export async function markFeedback(
  id: string,
  status: "new" | "reviewed" | "resolved",
) {
  await db.update(betaFeedback).set({ status }).where(eq(betaFeedback.id, id));
}
