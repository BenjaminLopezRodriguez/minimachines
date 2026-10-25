import { isApiAuth, requireApiKey } from "~/server/api/v1/auth";
import { jsonError, jsonOk } from "~/server/api/v1/respond";
import { getRole, keyPrincipal } from "~/server/data/projects";
import { roomAccess, syncEnabled } from "~/server/data/sync-token";

type Ctx = { params: Promise<{ id: string }> };

/** A short-lived token for the project's live room. Members can write; viewers and agent viewers read. */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireApiKey(request);
  if (!isApiAuth(auth)) return auth;
  if (!syncEnabled()) return jsonError("sync_disabled", "Live sync is not configured on this server", 503);
  const { id } = await ctx.params;
  const role = (await getRole(id, auth.userId)) ?? (await getRole(id, keyPrincipal(auth.keyId)));
  if (!role) return jsonError("project_not_found", "Project not found", 404);
  return jsonOk(roomAccess(id, auth.userId, role));
}
