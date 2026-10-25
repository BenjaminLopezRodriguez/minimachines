import { ChatDeepSeek } from "@langchain/deepseek";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { z } from "zod";
import { env } from "~/env";

const SYSTEM = `You are the minimachines assistant. Be genuinely useful: answer directly and warmly, keep replies concise, infer sensible defaults, and ask at most one question only when it truly blocks progress. Use plain text with short paragraphs or simple lists.

When the user wants something designed or made — a UI, web page, app screen, logo, illustration, image, slide, diagram, product or brand — also turn their request into one self-contained design prompt that a design tool or image model could execute without extra context. Cover subject and purpose, audience, layout or composition, style and mood, color, typography, key content, and constraints. Write it as plain prose under 120 words, in the user's language. If the request is not about designing or making something, designPrompt must be null.

Never claim you ran code, opened files, or accessed the user's machine or accounts.`;

const replySchema = z.object({
  reply: z
    .string()
    .describe("The helpful reply shown to the user in the chat."),
  designPrompt: z
    .string()
    .nullable()
    .describe(
      "A standalone design prompt when the user asked to design or make something; otherwise null.",
    ),
});

export type AssistantTurn = { role: "user" | "assistant"; content: string };
export type AssistantReply = z.infer<typeof replySchema>;

const prompt = ChatPromptTemplate.fromMessages([
  ["system", SYSTEM],
  new MessagesPlaceholder("history"),
]);

export function assistantEnabled() {
  return !!env.DEEPSEEK_API_KEY;
}

export async function designAssistantReply(
  turns: AssistantTurn[],
): Promise<AssistantReply> {
  if (!env.DEEPSEEK_API_KEY) throw new Error("The assistant isn't set up yet.");
  const model = new ChatDeepSeek({
    apiKey: env.DEEPSEEK_API_KEY,
    model: "deepseek-chat",
    temperature: 0.6,
    maxRetries: 1,
  });
  const chain = prompt.pipe(
    model.withStructuredOutput(replySchema, { name: "assistant_reply" }),
  );
  const history = turns
    .slice(-20)
    .map((t) =>
      t.role === "user" ? new HumanMessage(t.content) : new AIMessage(t.content),
    );
  const result = await chain.invoke({ history });
  const reply = result.reply.trim();
  if (!reply) throw new Error("The assistant returned an empty reply.");
  return { reply, designPrompt: result.designPrompt?.trim() || null };
}
