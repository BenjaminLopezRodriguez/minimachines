import { publicRequestLimit } from "~/server/lib/public-rate-limit";
import { NextResponse } from "next/server";

import { requireBetaAccess, BetaAccessError } from "~/server/data/beta";
import {
  enforceRateLimit,
  RequestLimitError,
} from "~/server/lib/distributed-rate-limit";
import { verifyApiKey } from "~/server/data/api-keys";

export type ApiAuth = { userId: string; keyId: string; agent: boolean };

export async function requireApiKey(
  request: Request,
): Promise<ApiAuth | NextResponse> {
  const limited = await publicRequestLimit(request, "api-auth", 300);
  if (limited) return limited;
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
  try {
    await requireBetaAccess(verified.userId);
    await enforceRateLimit(
      `api:${verified.userId}`,
      request.method === "GET" ? 240 : 90,
      60_000,
    );
  } catch (error) {
    if (error instanceof BetaAccessError)
      return NextResponse.json(
        { error: { code: "beta_access_required", message: error.message } },
        { status: 403 },
      );
    if (error instanceof RequestLimitError)
      return NextResponse.json(
        { error: { code: "rate_limit", message: error.message } },
        { status: 429, headers: { "Retry-After": String(error.retryAfter) } },
      );
    throw error;
  }
  return verified;
}

export function isApiAuth(value: ApiAuth | NextResponse): value is ApiAuth {
  return !(value instanceof NextResponse);
}
