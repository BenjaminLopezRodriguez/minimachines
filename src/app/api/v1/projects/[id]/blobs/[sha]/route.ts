import { isApiAuth, requireApiKey } from "~/server/api/v1/auth";
import { jsonError } from "~/server/api/v1/respond";
import { projectBlobResponse } from "~/server/data/project-blobs";
import { getRole, keyPrincipal } from "~/server/data/projects";

type Ctx = { params: Promise<{ id: string; sha: string }> };

/** Read a project file by its sha256. Anyone in the project, viewers and agent viewers included. */
export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireApiKey(request);
  if (!isApiAuth(auth)) return auth;
  const { id, sha } = await ctx.params;
  const role = (await getRole(id, auth.userId)) ?? (await getRole(id, keyPrincipal(auth.keyId)));
  if (!role) return jsonError("project_not_found", "Project not found", 404);
  return projectBlobResponse(id, sha);
}
