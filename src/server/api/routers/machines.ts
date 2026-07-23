import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import { createMachine, listMachines } from "~/server/data/machine-store";
import { execMachine } from "~/server/data/session-store";
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

  // Cookie-auth exec for the dashboard's remote-control tab. The /api/v1 exec
  // route is Bearer-key only; this lets the signed-in owner run a command in
  // their own machine's Modal sandbox. Ownership is enforced in execMachine.
  exec: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        cmd: z.string().min(1).max(4000),
        cwd: z.string().max(512).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await execMachine(
          input.id,
          { cmd: input.cmd, cwd: input.cwd },
          { ownerUserId: ctx.userId },
        );
        return {
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          durationMs: result.durationMs,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Exec failed";
        if (message.startsWith("Machine not found")) {
          throw new TRPCError({ code: "NOT_FOUND", message });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
      }
    }),
});
