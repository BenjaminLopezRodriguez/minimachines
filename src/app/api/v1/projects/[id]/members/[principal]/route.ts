import { isApiAuth, requireApiKey } from "~/server/api/v1/auth";
import { jsonError, jsonOk } from "~/server/api/v1/respond";
import { removeMember } from "~/server/data/projects";

type Ctx = { params: Promise<{ id: string; principal: string }> };

export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireApiKey(request);
  if (!isApiAuth(auth)) return auth;
  const { id, principal } = await ctx.params;
  try {
    const ok = await removeMember({
      projectId: id,
      userId: auth.userId,
      principal: decodeURIComponent(principal),
    });
    if (!ok) return jsonError("member_not_found", "Not a member", 404);
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError("forbidden", err instanceof Error ? err.message : "Remove failed", 403);
  }
}
