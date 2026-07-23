import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from "~/server/data/api-keys";

export const apiKeysRouter = createTRPCRouter({
  list: protectedProcedure.query(({ ctx }) => listApiKeys(ctx.userId)),

  create: protectedProcedure
    .input(z.object({ label: z.string().min(1).max(64).optional() }).optional())
    .mutation(({ ctx, input }) =>
      createApiKey({ userId: ctx.userId, label: input?.label }),
    ),

  revoke: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const ok = await revokeApiKey({ userId: ctx.userId, id: input.id });
      return { ok };
    }),
});
