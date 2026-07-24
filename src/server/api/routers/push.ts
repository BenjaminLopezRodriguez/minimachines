import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { deleteSubscription, saveSubscription } from "~/server/data/push";

export const pushRouter = createTRPCRouter({
  subscribe: protectedProcedure
    .input(
      z.object({
        endpoint: z.string().url(),
        keys: z.object({ p256dh: z.string(), auth: z.string() }),
        ua: z.string().max(256).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await saveSubscription({
        ownerUserId: ctx.userId,
        sub: { endpoint: input.endpoint, keys: input.keys },
        ua: input.ua,
      });
      return { ok: true };
    }),

  unsubscribe: protectedProcedure
    .input(z.object({ endpoint: z.string().url() }))
    .mutation(async ({ input }) => {
      await deleteSubscription(input.endpoint);
      return { ok: true };
    }),
});
