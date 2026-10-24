import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { db } from "~/server/db";
import { botMessages } from "~/server/db/schema";
import { eq } from "drizzle-orm";
import { createMachine } from "./machine-store";
import {
  deleteBot,
  getConversation,
  listBots,
  listConversations,
  newConversation,
  saveBot,
  sendBotMessage,
} from "./bots";

async function fixture() {
  const owner = `bot-test-${randomUUID()}`;
  const machine = await createMachine({
    templateId: "node-ts",
    ownerUserId: owner,
  });
  const bot = await saveBot(owner, {
    name: "Thinking partner",
    instructions: "Be concise.",
    machineId: machine.id,
    provider: "claude",
  });
  const conversation = await newConversation(bot.id, owner);
  return { owner, bot, conversation };
}
void test("Bots persist multi-turn context and idempotent replies", async () => {
  const f = await fixture();
  try {
    let calls = 0;
    const first = {
      conversationId: f.conversation.id,
      requestId: randomUUID(),
      content: "My project is called Kestrel.",
    };
    const runner = async (
      _machine: string,
      _owner: string,
      _provider: string,
      context: { transcript: string },
    ) => {
      calls++;
      assert.match(context.transcript, /Kestrel/);
      return "I remember Kestrel.";
    };
    await sendBotMessage(f.owner, first, runner);
    await sendBotMessage(f.owner, first, runner);
    assert.equal(calls, 1);
    await sendBotMessage(
      f.owner,
      {
        conversationId: f.conversation.id,
        requestId: randomUUID(),
        content: "What is my project called?",
      },
      runner,
    );
    const saved = await getConversation(f.conversation.id, f.owner);
    assert.equal(saved.messages.length, 4);
    assert.equal(saved.generationId, null);
    assert.equal(
      (await listConversations(f.bot.id, f.owner))[0]?.title,
      first.content,
    );
  } finally {
    await deleteBot(f.bot.id, f.owner);
  }
});
void test("Bots enforce ownership across profiles, machines, conversations and message requests", async () => {
  const f = await fixture();
  const other = `bot-test-${randomUUID()}`;
  try {
    assert.equal((await listBots(other)).length, 0);
    await assert.rejects(
      () => getConversation(f.conversation.id, other),
      /not found/,
    );
    await assert.rejects(() => newConversation(f.bot.id, other), /not found/);
    await assert.rejects(
      () =>
        saveBot(other, {
          name: "Steal",
          instructions: "x",
          provider: "claude",
          machineId: f.bot.machineId,
        }),
      /Machine not found/,
    );
    await assert.rejects(
      () =>
        sendBotMessage(other, {
          conversationId: f.conversation.id,
          requestId: randomUUID(),
          content: "read",
        }),
      /not found/,
    );
    await assert.rejects(() => deleteBot(f.bot.id, other), /not found/);
  } finally {
    await deleteBot(f.bot.id, f.owner);
  }
});
void test("failed agent replies are retryable without duplicating the user message", async () => {
  const f = await fixture();
  try {
    const input = {
      conversationId: f.conversation.id,
      requestId: randomUUID(),
      content: "Retry me",
    };
    await assert.rejects(
      () =>
        sendBotMessage(f.owner, input, async () => {
          throw new Error("Account unavailable");
        }),
      /Account unavailable/,
    );
    let saved = await getConversation(f.conversation.id, f.owner);
    assert.equal(saved.messages.length, 1);
    assert.equal(saved.title, input.content);
    assert.equal(saved.generationId, null);
    await sendBotMessage(f.owner, input, async () => "Recovered");
    saved = await getConversation(f.conversation.id, f.owner);
    assert.equal(saved.messages.length, 2);
    const messageId = saved.messages[0]!.id;
    await deleteBot(f.bot.id, f.owner);
    assert.equal(
      (await db.select().from(botMessages).where(eq(botMessages.id, messageId)))
        .length,
      0,
    );
  } finally {
    if ((await listBots(f.owner)).length) await deleteBot(f.bot.id, f.owner);
  }
});
void test("a conversation accepts only one in-flight generation", async () => {
  const f = await fixture();
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started!: () => void;
  const running = new Promise<void>((resolve) => {
    started = resolve;
  });
  try {
    const first = sendBotMessage(
      f.owner,
      {
        conversationId: f.conversation.id,
        requestId: randomUUID(),
        content: "First",
      },
      async () => {
        started();
        await waiting;
        return "Done";
      },
    );
    await running;
    await assert.rejects(
      () =>
        sendBotMessage(
          f.owner,
          {
            conversationId: f.conversation.id,
            requestId: randomUUID(),
            content: "Second",
          },
          async () => "No",
        ),
      /already in progress/,
    );
    release();
    await first;
    assert.equal(
      (await getConversation(f.conversation.id, f.owner)).messages.length,
      2,
    );
  } finally {
    release();
    await deleteBot(f.bot.id, f.owner);
  }
});
