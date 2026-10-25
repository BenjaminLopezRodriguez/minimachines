import { isApiAuth, requireApiKey } from "~/server/api/v1/auth";
import { jsonError, jsonOk } from "~/server/api/v1/respond";
import { revokeInvite } from "~/server/data/projects";

type Ctx = { params: Promise<{ id: string; inviteId: string }> };

export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireApiKey(request);
  if (!isApiAuth(auth)) return auth;
  const { id, inviteId } = await ctx.params;
  try {
    const ok = await revokeInvite({ projectId: id, inviteId, userId: auth.userId });
    if (!ok) return jsonError("invite_not_found", "No pending invite with that id", 404);
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError("forbidden", err instanceof Error ? err.message : "Revoke failed", 403);
  }
}
