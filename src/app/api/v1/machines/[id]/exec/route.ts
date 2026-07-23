import { z } from "zod";

import { isApiAuth, requireApiKey } from "~/server/api/v1/auth";
import { jsonError, jsonOk } from "~/server/api/v1/respond";
import { execMachine } from "~/server/data/session-store";

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
      cmd: z.string().min(1),
      cwd: z.string().optional(),
      env: z.record(z.string()).optional(),
    })
    .safeParse(body);
  if (!parsed.success) {
    return jsonError("validation_error", "cmd is required", 400);
  }

  try {
    const result = await execMachine(id, parsed.data, { ownerUserId: auth.userId });
    return jsonOk({ exec: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Exec failed";
    if (message.startsWith("Machine not found")) {
      return jsonError("machine_not_found", message, 404);
    }
    return jsonError("internal_error", message, 500);
  }
}
