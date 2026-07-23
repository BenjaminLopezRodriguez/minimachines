import { isApiAuth, requireApiKey } from "~/server/api/v1/auth";
import { jsonError, jsonOk } from "~/server/api/v1/respond";
import { getMachineFile, putMachineFile } from "~/server/data/session-store";

type Ctx = { params: Promise<{ id: string; path: string[] }> };

export async function PUT(request: Request, ctx: Ctx) {
  const auth = await requireApiKey(request);
  if (!isApiAuth(auth)) return auth;
  const { id, path: parts } = await ctx.params;
  const filePath = parts.join("/");
  if (!filePath) {
    return jsonError("validation_error", "path is required", 400);
  }

  const buf = new Uint8Array(await request.arrayBuffer());
  try {
    const result = await putMachineFile(id, filePath, buf, {
      ownerUserId: auth.userId,
    });
    return jsonOk({ file: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    if (message.startsWith("Machine not found")) {
      return jsonError("machine_not_found", message, 404);
    }
    return jsonError("internal_error", message, 500);
  }
}

export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireApiKey(request);
  if (!isApiAuth(auth)) return auth;
  const { id, path: parts } = await ctx.params;
  const filePath = parts.join("/");
  if (!filePath) {
    return jsonError("validation_error", "path is required", 400);
  }

  try {
    const bytes = await getMachineFile(id, filePath, { ownerUserId: auth.userId });
    if (!bytes) {
      return jsonError("file_not_found", "File not found", 404);
    }
    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: { "content-type": "application/octet-stream" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Download failed";
    if (message.startsWith("Machine not found")) {
      return jsonError("machine_not_found", message, 404);
    }
    return jsonError("internal_error", message, 500);
  }
}
