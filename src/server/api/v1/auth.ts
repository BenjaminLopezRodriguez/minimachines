import { NextResponse } from "next/server";

import { verifyApiKey } from "~/server/data/api-keys";

export type ApiAuth = { userId: string; keyId: string };

export async function requireApiKey(
  request: Request,
): Promise<ApiAuth | NextResponse> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const secret = match?.[1]?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Missing API key" } },
      { status: 401 },
    );
  }
  const verified = await verifyApiKey(secret);
  if (!verified) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Invalid API key" } },
      { status: 401 },
    );
  }
  return verified;
}

export function isApiAuth(value: ApiAuth | NextResponse): value is ApiAuth {
  return !(value instanceof NextResponse);
}
