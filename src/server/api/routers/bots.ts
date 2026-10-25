import { agentConnection } from "~/server/data/agent-connection";
import { ensureEmailContact } from "~/server/data/pager";
import { RequestLimitError } from "~/server/lib/distributed-rate-limit";
import { enforceRateLimit } from "~/server/lib/distributed-rate-limit";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { botSchema } from "~/lib/bots";
import { designAssistantReply } from "~/server/assistant/design-assistant";
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
      code:
        error instanceof RequestLimitError
          ? "TOO_MANY_REQUESTS"
          : "BAD_REQUEST",
      message:
        error instanceof Error
          ? error.message
          : "Bots could not complete this request.",
    });
  }
}
export const botsRouter = createTRPCRouter({
  connection: protectedProcedure
    .input(
      z.object({
        machineId: z.string().min(1).max(64),
        provider: z.enum(["claude", "codex"]),
        disconnect: z.boolean().default(false),
      }),
    )
    .mutation(({ ctx, input }) =>
      handled(async () => {
        if (!ctx.user) throw new Error("Sign in to connect your agent.");
        await ensureEmailContact(ctx.user);
        return agentConnection(
          ctx.userId,
          input.machineId,
          input.provider,
          input.disconnect,
        );
      }),
    ),
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
  assist: protectedProcedure
    .input(
      z.object({
        messages: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string().trim().min(1).max(8000),
            }),
          )
          .min(1)
          .max(40),
      }),
    )
    .mutation(({ ctx, input }) =>
      handled(async () => {
        await enforceRateLimit(`assistant:${ctx.userId}`, 60, 60 * 60_000);
        try {
          return await designAssistantReply(input.messages);
        } catch (error) {
          if (error instanceof RequestLimitError) throw error;
          console.error("[assistant] reply failed", error);
          throw new Error("The assistant couldn't reply. Try again.");
        }
      }),
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
      handled(async () => {
        await enforceRateLimit(`bot-send:${ctx.userId}`, 20, 60 * 60_000);
        return sendBotMessage(ctx.userId, input);
      }),
    ),
});
