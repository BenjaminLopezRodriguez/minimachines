import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import { createMachine, listMachines } from "~/server/data/machine-store";
import { loadTemplates, searchTemplates } from "~/server/data/templates";

export const machinesRouter = createTRPCRouter({
  list: protectedProcedure.query(({ ctx }) =>
    listMachines({ ownerUserId: ctx.userId }),
  ),

  templates: publicProcedure
    .input(z.object({ query: z.string().optional() }).optional())
    .query(({ input }) => {
      const q = input?.query?.trim();
      return q ? searchTemplates(q) : loadTemplates();
    }),

  create: protectedProcedure
    .input(
      z.object({
        templateId: z.string().min(1),
        name: z.string().min(1).max(64).optional(),
        task: z.string().min(1).max(200).optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      try {
        return createMachine({ ...input, ownerUserId: ctx.userId });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Create failed";
        if (message.startsWith("Unknown template")) {
          throw new TRPCError({ code: "NOT_FOUND", message });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
      }
    }),
});
