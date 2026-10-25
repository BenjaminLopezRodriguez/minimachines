import { NextResponse } from "next/server";
import {
  enforceRateLimit,
  requestIp,
  RequestLimitError,
} from "./distributed-rate-limit";
export async function publicRequestLimit(
  request: Request,
  scope: string,
  limit: number,
) {
  try {
    await enforceRateLimit(
      `${scope}:${requestIp(request.headers)}`,
      limit,
      60_000,
    );
    return null;
  } catch (error) {
    if (error instanceof RequestLimitError)
      return NextResponse.json(
        { error: { code: "rate_limit", message: error.message } },
        { status: 429, headers: { "Retry-After": String(error.retryAfter) } },
      );
    throw error;
  }
}
