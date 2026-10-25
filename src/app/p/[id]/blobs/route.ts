import { withAuth } from "@workos-inc/authkit-nextjs";

import { uploadFromRequest } from "~/server/data/project-blobs";
import { getRole } from "~/server/data/projects";

type Ctx = { params: Promise<{ id: string }> };

/** Browser uploads (whiteboard images) with the signed-in session. Members and owners only. */
export async function POST(request: Request, ctx: Ctx) {
  const { user } = await withAuth();
  const { id } = await ctx.params;
  const role = user?.id ? await getRole(id, user.id) : null;
  if (role !== "owner" && role !== "member") return new Response("Not found", { status: 404 });
  return uploadFromRequest(id, request);
}
