import { z } from "zod";

import { isApiAuth, requireApiKey } from "~/server/api/v1/auth";
import { jsonError, jsonOk } from "~/server/api/v1/respond";
import { recommendTemplates } from "~/server/data/templates";

export async function GET(request: Request) {
  const auth = await requireApiKey(request);
  if (!isApiAuth(auth)) return auth;

  const url = new URL(request.url);
  const parsed = z
    .object({ task: z.string().min(1) })
    .safeParse({ task: url.searchParams.get("task") ?? "" });
  if (!parsed.success) {
    return jsonError("validation_error", "task is required", 400);
  }

  const recommendations = recommendTemplates(parsed.data.task).map((r) => ({
    ...r.template,
    score: r.score,
    reason: r.reason,
  }));
  return jsonOk({ recommendations });
}
