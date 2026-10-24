import { gitRequestSchema } from "~/lib/git";
import { isApiAuth, requireApiKey } from "~/server/api/v1/auth";
import { jsonError, jsonOk } from "~/server/api/v1/respond";
import { machineGit } from "~/server/data/git";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiKey(request);
  if (!isApiAuth(auth)) return auth;
  let body: unknown;
  try { body = await request.json(); } catch { return jsonError("validation_error", "Invalid JSON body", 400); }
  const input = gitRequestSchema.safeParse(body);
  if (!input.success) return jsonError("validation_error", input.error.message, 400);
  try { return jsonOk({ result: await machineGit((await ctx.params).id, auth.userId, input.data) }); }
  catch (error) {
    const message = error instanceof Error ? error.message : "Git operation failed.";
    return jsonError("git_error", message, message === "Machine not found" ? 404 : 400);
  }
}
