import { withAuth } from "@workos-inc/authkit-nextjs";

import { projectBlobResponse } from "~/server/data/project-blobs";
import { getRole } from "~/server/data/projects";

type Ctx = { params: Promise<{ id: string; sha: string }> };

/** Browser reads with the signed-in session; any project role. */
export async function GET(_request: Request, ctx: Ctx) {
  const { user } = await withAuth();
  const { id, sha } = await ctx.params;
  if (!user?.id || !(await getRole(id, user.id))) return new Response("Not found", { status: 404 });
  return projectBlobResponse(id, sha);
}
