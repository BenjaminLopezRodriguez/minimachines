import { isApiAuth, requireApiKey } from "~/server/api/v1/auth";
import { jsonError, jsonOk } from "~/server/api/v1/respond";
import { revokeShare } from "~/server/data/shares";

type Ctx = { params: Promise<{ slug: string }> };

export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireApiKey(request);
  if (!isApiAuth(auth)) return auth;
  const { slug } = await ctx.params;
  const ok = await revokeShare({ ownerUserId: auth.userId, slug });
  if (!ok) return jsonError("share_not_found", "Share not found", 404);
  return jsonOk({ ok: true });
}
