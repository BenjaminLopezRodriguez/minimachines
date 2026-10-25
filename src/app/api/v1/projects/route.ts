import { z } from "zod";

import { isApiAuth, requireApiKey } from "~/server/api/v1/auth";
import { jsonError, jsonOk } from "~/server/api/v1/respond";
import { listProjects, upsertProject } from "~/server/data/projects";

export async function GET(request: Request) {
  const auth = await requireApiKey(request);
  if (!isApiAuth(auth)) return auth;
  return jsonOk({ projects: await listProjects(auth.userId) });
}

/** Find-or-create the caller's project for a repo (or a name, when there is no repo). */
export async function PUT(request: Request) {
  const auth = await requireApiKey(request);
  if (!isApiAuth(auth)) return auth;
  if (auth.agent) return jsonError("forbidden", "Agent keys cannot create projects", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("validation_error", "Invalid JSON body", 400);
  }
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(128),
      repoKey: z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9.-]+(\/[\w.-]+)+$/, "repoKey must look like host/owner/repo")
        .max(256)
        .optional(),
    })
    .safeParse(body);
  if (!parsed.success) {
    return jsonError("validation_error", parsed.error.issues[0]?.message ?? "Invalid body", 400);
  }
  const project = await upsertProject({ ownerUserId: auth.userId, ...parsed.data });
  return jsonOk({ project });
}
