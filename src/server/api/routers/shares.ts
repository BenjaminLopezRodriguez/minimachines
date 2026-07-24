import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  createShare,
  listShares,
  revokeShare,
  type ShareRow,
} from "~/server/data/shares";

const DOMAIN = process.env.SHARE_BASE_DOMAIN ?? "minimachin.es";

function withUrl(r: ShareRow) {
  return {
    slug: r.slug,
    url: `https://${r.slug}.${DOMAIN}`,
    machineId: r.machineId,
    port: r.port,
    kind: r.kind,
    access: r.access,
    label: r.label,
    enabled: r.enabled,
  };
}

export const sharesRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) =>
    (await listShares(ctx.userId)).map(withUrl),
  ),

  create: protectedProcedure
    .input(
      z.object({
        machineId: z.string().min(1),
        port: z.number().int().min(1).max(65535),
        kind: z.enum(["api", "website"]).default("website"),
        access: z.enum(["public", "gated"]).default("public"),
        secret: z.string().min(1).max(200).optional(),
        label: z.string().max(128).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      withUrl(
        await createShare({
          ownerUserId: ctx.userId,
          originKind: "machine",
          ...input,
        }),
      ),
    ),

  revoke: protectedProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const ok = await revokeShare({ ownerUserId: ctx.userId, slug: input.slug });
      return { ok };
    }),
});
