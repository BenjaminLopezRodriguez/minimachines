import { z } from "zod";

import { isApiAuth, requireApiKey } from "~/server/api/v1/auth";
import { botError } from "~/server/api/v1/bots-route";
import { jsonError, jsonOk } from "~/server/api/v1/respond";
import { getConversation, sendBotMessage } from "~/server/data/bots";

type Ctx = { params: Promise<{ id: string; cid: string }> };

/**
 * Sends a message and waits for the bot's reply (it runs on the bot's machine).
 * `requestId` makes retries safe: resending the same id returns the same reply.
 */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireApiKey(request);
  if (!isApiAuth(auth)) return auth;
  const { id, cid } = await ctx.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("validation_error", "Invalid JSON body", 400);
  }
  const parsed = z
    .object({ requestId: z.string().uuid(), content: z.string().trim().min(1).max(4000) })
    .safeParse(body);
  if (!parsed.success) {
    return jsonError("validation_error", parsed.error.issues[0]?.message ?? "Invalid body", 400);
  }
  try {
    if ((await getConversation(cid, auth.userId)).botId !== id) {
      return jsonError("not_found", "Conversation not found.", 404);
    }
    const { reply } = await sendBotMessage(auth.userId, { conversationId: cid, ...parsed.data });
    return jsonOk({ reply });
  } catch (err) {
    return botError(err);
  }
}
