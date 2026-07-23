import { z } from "zod";

import { isApiAuth, requireApiKey } from "~/server/api/v1/auth";
import { jsonError, jsonOk } from "~/server/api/v1/respond";
import { createMachine, listMachines } from "~/server/data/machine-store";

export async function GET(request: Request) {
  const auth = await requireApiKey(request);
  if (!isApiAuth(auth)) return auth;
  return jsonOk({
    machines: await listMachines({ ownerUserId: auth.userId }),
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
    })
    .safeParse(body);
  if (!parsed.success) {
    return jsonError("validation_error", "Invalid create payload", 400);
  }

  try {
    const machine = await createMachine({
      ...parsed.data,
      ownerUserId: auth.userId,
    });
    return jsonOk({ machine }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed";
    if (message.startsWith("Unknown template")) {
      return jsonError("unknown_template", message, 404);
    }
    return jsonError("internal_error", message, 500);
  }
}
