import { z } from "zod";

import { isApiAuth, requireApiKey } from "~/server/api/v1/auth";
import { jsonError, jsonOk } from "~/server/api/v1/respond";
import { createShare, listShares, type ShareRow } from "~/server/data/shares";

const DOMAIN = process.env.SHARE_BASE_DOMAIN ?? "minimachin.es";

function shape(row: ShareRow) {
  return {
    slug: row.slug,
    url: `https://${row.slug}.${DOMAIN}`,
    originKind: row.originKind,
    machineId: row.machineId,
    port: row.port,
    label: row.label,
    kind: row.kind,
    access: row.access,
    enabled: row.enabled,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  };
}

export async function GET(request: Request) {
  const auth = await requireApiKey(request);
  if (!isApiAuth(auth)) return auth;
  const rows = await listShares(auth.userId);
  return jsonOk({ shares: rows.map(shape) });
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
      originKind: z.enum(["machine", "local"]),
      machineId: z.string().optional(),
      port: z.number().int().min(1).max(65535).optional(),
      localUrl: z.string().url().optional(),
      kind: z.enum(["api", "website"]).default("website"),
      access: z.enum(["public", "gated"]).default("public"),
      secret: z.string().min(1).max(200).optional(),
      label: z.string().max(128).optional(),
    })
    .safeParse(body);
  if (!parsed.success) {
    return jsonError("validation_error", parsed.error.issues[0]?.message ?? "Invalid body", 400);
  }

  try {
    const row = await createShare({ ownerUserId: auth.userId, ...parsed.data });
    return jsonOk({ share: shape(row) }, 201);
  } catch (err) {
    return jsonError("share_error", err instanceof Error ? err.message : "Create failed", 400);
  }
}
