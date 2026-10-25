import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { authenticatedProcedure, createTRPCRouter } from "~/server/api/trpc";
import {
  betaMetrics,
  betaQueue,
  enrollVerifiedUser,
  feedbackQueue,
  isBetaAdmin,
  markFeedback,
  reviewApplication,
  saveFeedback,
  updateBetaProfile,
} from "~/server/data/beta";
import { betaApplications } from "~/server/db/schema";
import { eq } from "drizzle-orm";
import { enforceRateLimit } from "~/server/lib/distributed-rate-limit";
const adminProcedure = authenticatedProcedure.use(({ ctx, next }) => {
  if (!isBetaAdmin(ctx.userId))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Administrator access is required.",
    });
  return next();
});
export const betaRouter = createTRPCRouter({
  status: authenticatedProcedure.query(
    async ({ ctx }) =>
      (
        await ctx.db
          .select()
          .from(betaApplications)
          .where(eq(betaApplications.userId, ctx.userId))
          .limit(1)
      )[0] ?? null,
  ),
  enroll: authenticatedProcedure.mutation(({ ctx }) =>
    enrollVerifiedUser(ctx.user!),
  ),
  profile: authenticatedProcedure
    .input(
      z.object({
        role: z.string().trim().max(80),
        useCase: z.string().trim().max(1000),
        feedbackConsent: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await enrollVerifiedUser(ctx.user!);
      await updateBetaProfile(ctx.userId, input);
      return { ok: true };
    }),
  feedback: authenticatedProcedure
    .input(
      z.object({
        kind: z.enum(["bug", "idea", "experience"]),
        message: z
          .string()
          .trim()
          .min(10, "Add a little more detail so we can act on this.")
          .max(3000),
        rating: z.number().int().min(1).max(5).optional(),
        surface: z.enum(["bot", "whiteboard", "machines", "other"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await enforceRateLimit(`feedback:${ctx.userId}`, 10, 60 * 60_000);
      await saveFeedback(ctx.userId, input);
      return { ok: true };
    }),
  queue: adminProcedure.query(async () => ({
    applicants: await betaQueue(),
    feedback: await feedbackQueue(),
    metrics: await betaMetrics(),
  })),
  review: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.enum(["approved", "pending", "revoked"]),
        cohort: z.string().trim().max(80),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await reviewApplication(ctx.userId, input.id, input.status, input.cohort);
      return { ok: true };
    }),
  reviewFeedback: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.enum(["new", "reviewed", "resolved"]),
      }),
    )
    .mutation(async ({ input }) => {
      await markFeedback(input.id, input.status);
      return { ok: true };
    }),
});
