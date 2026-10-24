import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { botSchema } from "~/lib/bots";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  deleteBot,
  deleteConversation,
  getConversation,
  listBots,
  listConversations,
  newConversation,
  saveBot,
  sendBotMessage,
} from "~/server/data/bots";

const id = z.object({ id: z.string().uuid() });
async function handled<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        error instanceof Error
          ? error.message
          : "Bots could not complete this request.",
    });
  }
}
export const botsRouter = createTRPCRouter({
  list: protectedProcedure.query(({ ctx }) => listBots(ctx.userId)),
  save: protectedProcedure
    .input(botSchema.extend({ id: z.string().uuid().optional() }))
    .mutation(({ ctx, input }) =>
      handled(() => saveBot(ctx.userId, input, input.id)),
    ),
  delete: protectedProcedure
    .input(id)
    .mutation(({ ctx, input }) =>
      handled(() => deleteBot(input.id, ctx.userId)),
    ),
  conversations: protectedProcedure
    .input(id)
    .query(({ ctx, input }) =>
      handled(() => listConversations(input.id, ctx.userId)),
    ),
  newConversation: protectedProcedure
    .input(id)
    .mutation(({ ctx, input }) =>
      handled(() => newConversation(input.id, ctx.userId)),
    ),
  conversation: protectedProcedure
    .input(id)
    .query(({ ctx, input }) =>
      handled(() => getConversation(input.id, ctx.userId)),
    ),
  deleteConversation: protectedProcedure
    .input(id)
    .mutation(({ ctx, input }) =>
      handled(() => deleteConversation(input.id, ctx.userId)),
    ),
  send: protectedProcedure
    .input(
      z.object({
        conversationId: z.string().uuid(),
        requestId: z.string().uuid(),
        content: z.string().trim().min(1).max(4000),
      }),
    )
    .mutation(({ ctx, input }) =>
      handled(() => sendBotMessage(ctx.userId, input)),
    ),
});
