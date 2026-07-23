import { z } from "zod";

import { isApiAuth, requireApiKey } from "~/server/api/v1/auth";
import { jsonError, jsonOk } from "~/server/api/v1/respond";
import { createJob } from "~/server/data/session-store";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireApiKey(request);
  if (!isApiAuth(auth)) return auth;
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("validation_error", "Invalid JSON body", 400);
  }

  const parsed = z
    .object({
      type: z.string().min(1),
      input: z.unknown().optional(),
      assets: z.unknown().optional(),
    })
    .safeParse(body);
  if (!parsed.success) {
    return jsonError("validation_error", "type is required", 400);
  }

  try {
    const job = await createJob(id, parsed.data, { ownerUserId: auth.userId });
    return jsonOk({ job }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Job create failed";
    if (message.startsWith("Machine not found")) {
      return jsonError("machine_not_found", message, 404);
    }
    return jsonError("internal_error", message, 500);
  }
}
