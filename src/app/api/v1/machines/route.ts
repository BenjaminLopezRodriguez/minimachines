import { RequestLimitError } from "~/server/lib/distributed-rate-limit";
import { BetaAccessError } from "~/server/data/beta";
import { z } from "zod";

import { isApiAuth, requireApiKey } from "~/server/api/v1/auth";
import { jsonError, jsonOk } from "~/server/api/v1/respond";
import { createMachine, listMachines } from "~/server/data/machine-store";
import { getRole } from "~/server/data/projects";
import { loadTemplates } from "~/server/data/templates";

export async function GET(request: Request) {
  const auth = await requireApiKey(request);
  if (!isApiAuth(auth)) return auth;
  return jsonOk({
    machines: await listMachines({
      ownerUserId: auth.userId,
      keyId: auth.keyId,
    }),
  });
}

export async function POST(request: Request) {
  const auth = await requireApiKey(request);
  if (!isApiAuth(auth)) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("validation_error", "Invalid JSON body", 400);
  }

  const parsed = z
    .object({
      templateId: z.string().min(1),
      name: z.string().min(1).max(64).optional(),
      task: z.string().min(1).max(200).optional(),
      projectId: z.string().uuid().optional(),
    })
    .safeParse(body);
  if (!parsed.success) {
    const known = loadTemplates()
      .map((t) => t.id)
      .join(", ");
    const field = parsed.error.issues[0]?.path.join(".") ?? "body";
    return jsonError(
      "validation_error",
      `Invalid create payload: "${field}" is required. templateId must be one of: ${known}`,
      400,
    );
  }

  const { projectId } = parsed.data;
  if (projectId) {
    const role = await getRole(projectId, auth.userId);
    if (role !== "owner" && role !== "member") {
      return jsonError("project_not_found", "Project not found", 404);
    }
  }

  try {
    const machine = await createMachine({
      ...parsed.data,
      ownerUserId: auth.userId,
    });
    return jsonOk({ machine }, 201);
  } catch (err) {
    if (err instanceof RequestLimitError) {
      const response = jsonError("rate_limit", err.message, 429);
      response.headers.set("Retry-After", String(err.retryAfter));
      return response;
    }
    if (err instanceof BetaAccessError)
      return jsonError("beta_access_required", err.message, 403);
    const message = err instanceof Error ? err.message : "Create failed";
    if (message.startsWith("Unknown template")) {
      return jsonError("unknown_template", message, 404);
    }
    return jsonError("internal_error", message, 500);
  }
}
