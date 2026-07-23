import { isApiAuth, requireApiKey } from "~/server/api/v1/auth";
import { jsonOk } from "~/server/api/v1/respond";
import { revokeApiKey } from "~/server/data/api-keys";

export async function POST(request: Request) {
  const auth = await requireApiKey(request);
  if (!isApiAuth(auth)) return auth;
  const revoked = await revokeApiKey({ userId: auth.userId, id: auth.keyId });
  return jsonOk({ revoked });
}
