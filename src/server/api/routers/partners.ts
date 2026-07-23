import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { partnerRequests } from "~/server/db/schema";
import { rateLimit } from "~/server/lib/rate-limit";

export const partnersRouter = createTRPCRouter({
  // Public: agent-builders request being added to the platform.
  request: publicProcedure
    .input(
      z.object({
        company: z.string().trim().min(1, "Company is required.").max(200),
        email: z
          .string()
          .trim()
          .toLowerCase()
          .email("Enter a valid email address."),
        agentName: z.string().trim().max(200).optional(),
        note: z.string().trim().max(2000).optional(),
        // Honeypot — bots fill it, humans never see it.
        website: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.website) return { id: undefined };

      const ip = ctx.headers.get("x-real-ip")?.trim() ?? "unknown";
      if (
        !rateLimit(`partners:${ip}`, { limit: 5, windowMs: 10 * 60_000 }).ok
      ) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many attempts. Please try again in a few minutes.",
        });
      }

      const [entry] = await ctx.db
        .insert(partnerRequests)
        .values({
          company: input.company,
          email: input.email,
          agentName: input.agentName ?? null,
          note: input.note ?? null,
        })
        .returning({ id: partnerRequests.id });

      return { id: entry?.id };
    }),
});
