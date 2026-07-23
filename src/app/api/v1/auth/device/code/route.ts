import { jsonOk } from "~/server/api/v1/respond";
import { createDeviceCode } from "~/server/data/device-codes";

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  const created = await createDeviceCode();
  const verificationUri = `${origin}/dashboard/cli/approve`;
  const expiresIn = Math.max(
    0,
    Math.floor((new Date(created.expiresAt).getTime() - Date.now()) / 1000),
  );
  return jsonOk({
    device_code: created.deviceCode,
    user_code: created.userCode,
    verification_uri: verificationUri,
    verification_uri_complete: `${verificationUri}?user_code=${created.userCode}`,
    interval: created.interval,
    expires_in: expiresIn,
  });
}
