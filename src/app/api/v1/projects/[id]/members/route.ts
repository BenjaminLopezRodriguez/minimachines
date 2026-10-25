import { z } from "zod";

import { isApiAuth, requireApiKey } from "~/server/api/v1/auth";
import { jsonError, jsonOk } from "~/server/api/v1/respond";
import { displayName, notifyAdded } from "~/server/data/invite-delivery";
import { addTeammate, getProject } from "~/server/data/projects";

type Ctx = { params: Promise<{ id: string }> };

/** Add teammates who already have accounts straight to the project, and email them the link. */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireApiKey(request);
  if (!isApiAuth(auth)) return auth;
  if (auth.agent) {
    return jsonError("forbidden", "Agent keys cannot add people; ask the user to run mm people", 403);
  }
  const { id } = await ctx.params;
  const parsed = z
    .object({
      userIds: z.array(z.string().min(1).max(128)).min(1).max(20),
      role: z.enum(["member", "viewer"]).default("member"),
    })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError("validation_error", parsed.error.issues[0]?.message ?? "Invalid body", 400);
  }
  const project = await getProject(id);
  if (!project) return jsonError("project_not_found", "Project not found", 404);

  const inviter = (await displayName(auth.userId)).name;
  const results: Record<string, unknown>[] = [];
  for (const userId of parsed.data.userIds) {
    try {
      const status = await addTeammate({ projectId: id, userId: auth.userId, target: userId, role: parsed.data.role });
      const notified = status === "added" && (await notifyAdded({ inviter, project, userId }));
      results.push({ userId, status, role: parsed.data.role, notified });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Add failed";
      if (message.startsWith("Only the project owner")) return jsonError("forbidden", message, 403);
      results.push({ userId, status: "failed", error: message });
    }
  }
  return jsonOk({ members: results }, 201);
}
