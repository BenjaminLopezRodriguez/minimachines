import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { waitlist } from "~/server/db/schema";
import { rateLimit } from "~/server/lib/rate-limit";

const POSTGRES_UNIQUE_VIOLATION = "23505";

export const waitlistRouter = createTRPCRouter({
  join: publicProcedure
    .input(
      z.object({
        email: z
          .string()
          .trim()
          .toLowerCase()
          .email("Enter a valid email address."),
        // Honeypot — bots fill it, humans never see it.
        website: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Honeypot tripped: look successful, insert nothing.
      if (input.website) return { id: undefined };

      // x-real-ip is set by Vercel to the true client IP. Don't trust the
      // leftmost x-forwarded-for entry — the client can spoof it.
      const ip = ctx.headers.get("x-real-ip")?.trim() ?? "unknown";
      if (!rateLimit(`waitlist:${ip}`, { limit: 5, windowMs: 10 * 60_000 }).ok) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many attempts. Please try again in a few minutes.",
        });
      }

      try {
        const [entry] = await ctx.db
          .insert(waitlist)
          .values({ email: input.email })
          .returning({ id: waitlist.id });

        return { id: entry?.id };
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === POSTGRES_UNIQUE_VIOLATION
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This email is already on the waitlist.",
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Something went wrong. Please try again.",
        });
      }
    }),
});
