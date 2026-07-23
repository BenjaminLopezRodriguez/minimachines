import { jsonError, jsonOk } from "~/server/api/v1/respond";
import { redeemDeviceToken } from "~/server/data/device-codes";

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid_request", "Missing device_code", 400);
  }

  const deviceCode = (body as { device_code?: unknown })?.device_code;
  if (typeof deviceCode !== "string" || !deviceCode) {
    return jsonError("invalid_request", "Missing device_code", 400);
  }

  const result = await redeemDeviceToken(deviceCode);
  switch (result.status) {
    case "authorization_pending":
      return jsonError(
        "authorization_pending",
        "The authorization request is still pending",
        400,
      );
    case "access_denied":
      return jsonError("access_denied", "The authorization request was denied", 400);
    case "expired_token":
      return jsonError("expired_token", "The device code has expired", 400);
    case "already_used":
      return jsonError("already_used", "The device code was already used", 400);
    case "success":
      return jsonOk({
        api_key: result.apiKey,
        key_id: result.keyId,
        api_key_prefix: result.keyPrefix,
        base_url: `${origin}`,
      });
  }
}
