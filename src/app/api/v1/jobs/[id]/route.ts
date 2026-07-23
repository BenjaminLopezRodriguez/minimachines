import { isApiAuth, requireApiKey } from "~/server/api/v1/auth";
import { jsonError, jsonOk } from "~/server/api/v1/respond";
import { getJob } from "~/server/data/session-store";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireApiKey(request);
  if (!isApiAuth(auth)) return auth;
  const { id } = await ctx.params;
  const job = await getJob(id, { ownerUserId: auth.userId });
  if (!job) return jsonError("job_not_found", "Job not found", 404);
  return jsonOk({ job });
}
