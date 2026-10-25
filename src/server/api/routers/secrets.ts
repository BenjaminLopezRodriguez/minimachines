import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { deleteSecret, listSecrets, secretsEnabled, setSecret } from "~/server/data/secrets";

/** Provider keys: write-only from the browser — values never come back, only the last four. */
export const secretsRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => ({ enabled: secretsEnabled(), keys: await listSecrets(ctx.userId) })),

  set: protectedProcedure
    .input(z.object({ name: z.string().trim().min(2).max(64), value: z.string().min(1).max(8192) }))
    .mutation(async ({ ctx, input }) => {
      try {
        await setSecret({ userId: ctx.userId, ...input });
      } catch (err) {
        throw new TRPCError({ code: "BAD_REQUEST", message: err instanceof Error ? err.message : "Couldn't save" });
      }
      return { ok: true };
    }),

  delete: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => ({ ok: await deleteSecret(ctx.userId, input.name) })),
});
