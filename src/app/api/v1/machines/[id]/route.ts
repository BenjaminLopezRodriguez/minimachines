import { isApiAuth, requireApiKey } from "~/server/api/v1/auth";
import { jsonError, jsonOk } from "~/server/api/v1/respond";
import { getMachine } from "~/server/data/machine-store";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireApiKey(request);
  if (!isApiAuth(auth)) return auth;
  const { id } = await ctx.params;
  const machine = await getMachine(id, { ownerUserId: auth.userId });
  if (!machine) return jsonError("machine_not_found", "Machine not found", 404);
  return jsonOk({ machine });
}
