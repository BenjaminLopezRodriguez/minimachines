import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { waitlist } from "~/server/db/schema";

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
      }),
    )
    .mutation(async ({ ctx, input }) => {
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
