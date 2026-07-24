import { z } from "zod";

import { isApiAuth, requireApiKey } from "~/server/api/v1/auth";
import { jsonError, jsonOk } from "~/server/api/v1/respond";
import { getContact, setContact } from "~/server/data/pager";

export async function GET(request: Request) {
  const auth = await requireApiKey(request);
  if (!isApiAuth(auth)) return auth;
  return jsonOk({ contact: await getContact(auth.userId) });
}

export async function PUT(request: Request) {
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
      email: z.string().email().optional(),
      phone: z.string().min(3).max(32).optional(),
    })
    .refine((v) => Boolean(v.email ?? v.phone), {
      message: "email or phone is required",
    })
    .safeParse(body);
  if (!parsed.success) {
    return jsonError(
      "validation_error",
      parsed.error.issues[0]?.message ?? "email or phone is required",
      400,
    );
  }

  return jsonOk({
    contact: await setContact({ ownerUserId: auth.userId, ...parsed.data }),
  });
}
