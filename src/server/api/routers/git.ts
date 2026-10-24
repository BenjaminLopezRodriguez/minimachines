import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { gitRequestSchema, type GitStatus, type GitDiff } from "~/lib/git";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { machineGit } from "~/server/data/git";

const repo = z.object({
  id: z.string().min(1),
  path: z.string().max(512).default("/workspace"),
});
async function run<T>(
  id: string,
  owner: string,
  request: Parameters<typeof machineGit>[2],
) {
  try {
    return await machineGit<T>(id, owner, request);
  } catch (error) {
    throw new TRPCError({
      code:
        error instanceof Error && error.message === "Machine not found"
          ? "NOT_FOUND"
          : "BAD_REQUEST",
      message: error instanceof Error ? error.message : "Git operation failed.",
    });
  }
}
export const gitRouter = createTRPCRouter({
  discover: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(({ ctx, input }) =>
      run<string[]>(input.id, ctx.userId, {
        path: "/workspace",
        action: "discover",
      }),
    ),
  status: protectedProcedure
    .input(repo)
    .query(({ ctx, input }) =>
      run<GitStatus>(input.id, ctx.userId, {
        path: input.path,
        action: "status",
      }),
    ),
  diff: protectedProcedure
    .input(
      repo
        .merge(gitRequestSchema.pick({ file: true, layer: true, ref: true }))
        .extend({
          kind: z.enum(["file", "checkpoint", "stash"]).default("file"),
        }),
    )
    .query(({ ctx, input }) =>
      run<GitDiff>(input.id, ctx.userId, {
        ...input,
        action:
          input.kind === "checkpoint"
            ? "checkpointDiff"
            : input.kind === "stash"
              ? "stashDiff"
              : "diff",
      }),
    ),
  action: protectedProcedure
    .input(gitRequestSchema.extend({ id: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      run<{ message?: string }>(input.id, ctx.userId, input),
    ),
});
