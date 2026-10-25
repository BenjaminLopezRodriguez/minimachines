import { isApiAuth, requireApiKey } from "~/server/api/v1/auth";
import { botError } from "~/server/api/v1/bots-route";
import { jsonOk } from "~/server/api/v1/respond";
import { listConversations, newConversation } from "~/server/data/bots";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireApiKey(request);
  if (!isApiAuth(auth)) return auth;
  const { id } = await ctx.params;
  try {
    return jsonOk({ conversations: await listConversations(id, auth.userId) });
  } catch (err) {
    return botError(err);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireApiKey(request);
  if (!isApiAuth(auth)) return auth;
  const { id } = await ctx.params;
  try {
    return jsonOk({ conversation: await newConversation(id, auth.userId) }, 201);
  } catch (err) {
    return botError(err);
  }
}
