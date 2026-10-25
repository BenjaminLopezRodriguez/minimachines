import { isApiAuth, requireApiKey } from "~/server/api/v1/auth";
import { jsonError, jsonOk } from "~/server/api/v1/respond";
import { displayName } from "~/server/data/invite-delivery";
import { getProject, listPeople } from "~/server/data/projects";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireApiKey(request);
  if (!isApiAuth(auth)) return auth;
  const { id } = await ctx.params;
  try {
    const [project, people] = await Promise.all([getProject(id), listPeople(id, auth.userId)]);
    const members = await Promise.all(
      people.members.map(async (m) => ({
        ...m,
        ...(m.principal.startsWith("key:")
          ? { name: "agent", email: null }
          : await displayName(m.principal)),
      })),
    );
    return jsonOk({ project, members, pending: people.pending });
  } catch {
    return jsonError("project_not_found", "Project not found", 404);
  }
}
