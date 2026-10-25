import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { partnerRequests } from "~/server/db/schema";
import { enforceRateLimit } from "~/server/lib/distributed-rate-limit";

export const partnersRouter = createTRPCRouter({
  // Public: agent-builders request being added to the platform.
  request: publicProcedure
    .input(
      z.object({
        kind: z.enum(["agent", "model"]).default("agent"),
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
      await enforceRateLimit(`partners:${ip}`, 5, 10 * 60_000);

      const [entry] = await ctx.db
        .insert(partnerRequests)
        .values({
          kind: input.kind,
          company: input.company,
          email: input.email,
          agentName: input.agentName ?? null,
          note: input.note ?? null,
        })
        .returning({ id: partnerRequests.id });

      return { id: entry?.id };
    }),
});
