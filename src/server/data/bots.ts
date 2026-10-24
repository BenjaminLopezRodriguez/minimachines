import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNull, lt, or } from "drizzle-orm";
import type { BotInput } from "~/lib/bots";
import { botWorker, conversationContext } from "~/server/bots/runner";
import { db } from "~/server/db";
import {
  bots,
  botConversations,
  botMessages,
  machines,
} from "~/server/db/schema";
import { getMachine } from "./machine-store";
import { execSandbox, modalEnabled } from "./modal-driver";

const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
export const listBots = (owner: string) =>
  db
    .select()
    .from(bots)
    .where(eq(bots.ownerUserId, owner))
    .orderBy(desc(bots.updatedAt));
async function ownedBot(id: string, owner: string) {
  const [bot] = await db
    .select()
    .from(bots)
    .where(and(eq(bots.id, id), eq(bots.ownerUserId, owner)))
    .limit(1);
  if (!bot) throw new Error("Bot not found.");
  return bot;
}
export async function saveBot(owner: string, input: BotInput, id?: string) {
  if (!(await getMachine(input.machineId, { ownerUserId: owner })))
    throw new Error("Machine not found.");
  if (id) {
    await ownedBot(id, owner);
    const [bot] = await db
      .update(bots)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(bots.id, id), eq(bots.ownerUserId, owner)))
      .returning();
    return bot!;
  }
  const [bot] = await db
    .insert(bots)
    .values({ ...input, ownerUserId: owner })
    .returning();
  return bot!;
}
export async function listConversations(botId: string, owner: string) {
  await ownedBot(botId, owner);
  return db
    .select()
    .from(botConversations)
    .where(
      and(
        eq(botConversations.botId, botId),
        eq(botConversations.ownerUserId, owner),
      ),
    )
    .orderBy(desc(botConversations.updatedAt));
}
export async function newConversation(botId: string, owner: string) {
  await ownedBot(botId, owner);
  const [conversation] = await db
    .insert(botConversations)
    .values({ botId, ownerUserId: owner })
    .returning();
  return conversation!;
}
async function ownedConversation(id: string, owner: string) {
  const [conversation] = await db
    .select()
    .from(botConversations)
    .where(
      and(eq(botConversations.id, id), eq(botConversations.ownerUserId, owner)),
    )
    .limit(1);
  if (!conversation) throw new Error("Conversation not found.");
  return conversation;
}
export async function getConversation(id: string, owner: string) {
  const conversation = await ownedConversation(id, owner);
  const messages = await db
    .select()
    .from(botMessages)
    .where(eq(botMessages.conversationId, id))
    .orderBy(asc(botMessages.createdAt), asc(botMessages.id));
  return { ...conversation, messages };
}
export async function deleteConversation(id: string, owner: string) {
  const conversation = await ownedConversation(id, owner);
  if (
    conversation.generationId &&
    conversation.generationStartedAt &&
    Date.now() - conversation.generationStartedAt.getTime() < 180000
  )
    throw new Error(
      "Wait for the current reply before deleting this conversation.",
    );
  await db
    .delete(botConversations)
    .where(
      and(eq(botConversations.id, id), eq(botConversations.ownerUserId, owner)),
    );
  return { ok: true };
}
export async function deleteBot(id: string, owner: string) {
  await ownedBot(id, owner);
  const conversations = await listConversations(id, owner);
  if (
    conversations.some(
      (c) =>
        c.generationId &&
        c.generationStartedAt &&
        Date.now() - c.generationStartedAt.getTime() < 180000,
    )
  )
    throw new Error("Wait for active replies before deleting this bot.");
  await db
    .delete(bots)
    .where(and(eq(bots.id, id), eq(bots.ownerUserId, owner)));
  return { ok: true };
}

export async function sendBotMessage(
  owner: string,
  input: { conversationId: string; requestId: string; content: string },
  replyRunner = accountReply,
) {
  const conversation = await ownedConversation(input.conversationId, owner);
  const bot = await ownedBot(conversation.botId, owner);
  const [existing] = await db
    .select()
    .from(botMessages)
    .where(eq(botMessages.id, input.requestId))
    .limit(1);
  if (
    existing &&
    (existing.conversationId !== conversation.id ||
      existing.content !== input.content ||
      existing.role !== "user")
  )
    throw new Error("This message request has already been used.");
  if (existing) {
    const [reply] = await db
      .select()
      .from(botMessages)
      .where(
        and(
          eq(botMessages.conversationId, conversation.id),
          eq(botMessages.replyTo, input.requestId),
        ),
      )
      .limit(1);
    if (reply) return { reply };
  }
  const generationId = randomUUID();
  const [lease] = await db
    .update(botConversations)
    .set({
      generationId,
      generationStartedAt: new Date(),
      updatedAt: new Date(),
      title:
        conversation.title === "New conversation"
          ? input.content.slice(0, 160)
          : conversation.title,
    })
    .where(
      and(
        eq(botConversations.id, conversation.id),
        eq(botConversations.ownerUserId, owner),
        or(
          isNull(botConversations.generationId),
          lt(
            botConversations.generationStartedAt,
            new Date(Date.now() - 180000),
          ),
        ),
      ),
    )
    .returning({ id: botConversations.id });
  if (!lease)
    throw new Error("A reply is already in progress. Wait for it to finish.");
  try {
    if (!existing)
      await db
        .insert(botMessages)
        .values({
          id: input.requestId,
          conversationId: conversation.id,
          role: "user",
          content: input.content,
        });
    const recent = await db
      .select({ role: botMessages.role, content: botMessages.content })
      .from(botMessages)
      .where(eq(botMessages.conversationId, conversation.id))
      .orderBy(desc(botMessages.createdAt), desc(botMessages.id))
      .limit(20);
    const content = await replyRunner(
      bot.machineId,
      owner,
      bot.provider as BotInput["provider"],
      conversationContext(bot.instructions, recent.reverse()),
    );
    const reply = await db.transaction(async (tx) => {
      const [current] = await tx
        .update(botConversations)
        .set({
          generationId: null,
          generationStartedAt: null,
          updatedAt: new Date(),
          title:
            conversation.title === "New conversation"
              ? input.content.slice(0, 160)
              : conversation.title,
        })
        .where(
          and(
            eq(botConversations.id, conversation.id),
            eq(botConversations.generationId, generationId),
          ),
        )
        .returning({ id: botConversations.id });
      if (!current)
        throw new Error("This reply expired. Please retry your message.");
      const [saved] = await tx
        .insert(botMessages)
        .values({
          conversationId: conversation.id,
          role: "assistant",
          content,
          replyTo: input.requestId,
        })
        .returning();
      return saved!;
    });
    return { reply };
  } finally {
    await db
      .update(botConversations)
      .set({ generationId: null, generationStartedAt: null })
      .where(
        and(
          eq(botConversations.id, conversation.id),
          eq(botConversations.generationId, generationId),
        ),
      );
  }
}

async function accountReply(
  machineId: string,
  owner: string,
  provider: BotInput["provider"],
  context: ReturnType<typeof conversationContext>,
) {
  const [machine] = await db
    .select()
    .from(machines)
    .where(and(eq(machines.id, machineId), eq(machines.ownerUserId, owner)))
    .limit(1);
  if (!machine)
    throw new Error(
      "The bot’s machine no longer exists. Choose another machine in bot settings.",
    );
  if (machine.status !== "running")
    throw new Error("Start this bot’s machine before sending a message.");
  if (!machine.sandboxId || !modalEnabled())
    throw new Error(
      "Connect a cloud machine with a signed-in coding agent to use Bots.",
    );
  const source = Buffer.from(botWorker).toString("base64");
  const payload = Buffer.from(
    JSON.stringify({ provider, ...context }),
  ).toString("base64");
  const command = `python3 -c ${quote(`import base64; exec(base64.b64decode('${source}'))`)} ${quote(payload)}`;
  const result = await execSandbox(machine.sandboxId, [
    "sh",
    "-c",
    `exec "$(command -v gosu || command -v su-exec)" agent sh -c ${quote(command)}`,
  ]);
  if (result.exitCode !== 0)
    throw new Error(
      "Could not start the bot. Check Python 3 and the coding agent in the machine console.",
    );
  let response: { ok: boolean; reply?: string; error?: string };
  try {
    response = JSON.parse(result.stdout) as typeof response;
  } catch {
    throw new Error(
      "The agent returned an invalid response. Check its CLI version.",
    );
  }
  if (!response.ok || !response.reply)
    throw new Error(response.error ?? "The bot returned no reply.");
  return response.reply;
}
