import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { joinEarlyAccess } from "~/server/data/beta";
import {
  enforceRateLimit,
  requestIp,
  RequestLimitError,
} from "~/server/lib/distributed-rate-limit";
export const waitlistRouter = createTRPCRouter({
  join: publicProcedure
    .input(
      z.object({
        email: z
          .string()
          .trim()
          .toLowerCase()
          .max(320)
          .email("Enter a valid email address."),
        website: z.string().max(200).optional(),
        feedbackConsent: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.website) return { ok: true };
      try {
        await enforceRateLimit(
          `waitlist:ip:${requestIp(ctx.headers)}`,
          5,
          10 * 60_000,
        );
        await enforceRateLimit(`waitlist:email:${input.email}`, 3, 60 * 60_000);
        await joinEarlyAccess(input.email, input.feedbackConsent);
        return { ok: true };
      } catch (error) {
        if (error instanceof RequestLimitError)
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: error.message,
          });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "We couldn’t save your signup. Please try again shortly.",
        });
      }
    }),
});
