import { isApiAuth, requireApiKey } from "~/server/api/v1/auth";
import { botError } from "~/server/api/v1/bots-route";
import { jsonError, jsonOk } from "~/server/api/v1/respond";
import { getConversation } from "~/server/data/bots";

type Ctx = { params: Promise<{ id: string; cid: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireApiKey(request);
  if (!isApiAuth(auth)) return auth;
  const { id, cid } = await ctx.params;
  try {
    const conversation = await getConversation(cid, auth.userId);
    if (conversation.botId !== id) return jsonError("not_found", "Conversation not found.", 404);
    return jsonOk({ conversation });
  } catch (err) {
    return botError(err);
  }
}
