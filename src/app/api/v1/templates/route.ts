import { z } from "zod";

import { isApiAuth, requireApiKey } from "~/server/api/v1/auth";
import { jsonError, jsonOk } from "~/server/api/v1/respond";
import { loadTemplates, searchTemplates } from "~/server/data/templates";

export async function GET(request: Request) {
  const auth = await requireApiKey(request);
  if (!isApiAuth(auth)) return auth;

  const url = new URL(request.url);
  const parsed = z
    .object({ q: z.string().optional() })
    .safeParse({ q: url.searchParams.get("q") ?? undefined });
  if (!parsed.success) {
    return jsonError("validation_error", "Invalid query", 400);
  }

  const q = parsed.data.q?.trim();
  const templates = q ? searchTemplates(q) : loadTemplates();
  return jsonOk({ templates });
}
