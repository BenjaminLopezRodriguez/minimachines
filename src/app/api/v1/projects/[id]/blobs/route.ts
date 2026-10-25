import { isApiAuth, requireApiKey } from "~/server/api/v1/auth";
import { jsonError } from "~/server/api/v1/respond";
import { uploadFromRequest } from "~/server/data/project-blobs";
import { getRole } from "~/server/data/projects";

type Ctx = { params: Promise<{ id: string }> };

/** Upload a binary project file (raw body, ?type=<mime>). Members and owners only. */
export async function PUT(request: Request, ctx: Ctx) {
  const auth = await requireApiKey(request);
  if (!isApiAuth(auth)) return auth;
  const { id } = await ctx.params;
  const role = await getRole(id, auth.userId);
  if (role !== "owner" && role !== "member") return jsonError("project_not_found", "Project not found", 404);
  return uploadFromRequest(id, request);
}
