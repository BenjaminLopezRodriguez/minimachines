import { jsonError } from "~/server/api/v1/respond";

/** Bots data functions throw plain Errors; "not found" ones become 404, the rest 400. */
export function botError(err: unknown) {
  const message = err instanceof Error ? err.message : "Bots could not complete this request.";
  return /not found/i.test(message)
    ? jsonError("not_found", message, 404)
    : jsonError("bot_error", message, 400);
}
