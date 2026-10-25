import { botSchema } from "~/lib/bots";
import { isApiAuth, requireApiKey } from "~/server/api/v1/auth";
import { botError } from "~/server/api/v1/bots-route";
import { jsonError, jsonOk } from "~/server/api/v1/respond";
import { listBots, saveBot } from "~/server/data/bots";

export async function GET(request: Request) {
  const auth = await requireApiKey(request);
  if (!isApiAuth(auth)) return auth;
  return jsonOk({ bots: await listBots(auth.userId) });
}

export async function POST(request: Request) {
  const auth = await requireApiKey(request);
  if (!isApiAuth(auth)) return auth;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("validation_error", "Invalid JSON body", 400);
  }
  const parsed = botSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("validation_error", parsed.error.issues[0]?.message ?? "Invalid body", 400);
  }
  try {
    return jsonOk({ bot: await saveBot(auth.userId, parsed.data) }, 201);
  } catch (err) {
    return botError(err);
  }
}
