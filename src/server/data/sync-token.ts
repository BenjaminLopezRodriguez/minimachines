import { createHmac } from "node:crypto";

import { env } from "~/env";

import type { Role } from "./projects";

const TTL_S = 60 * 60; // a room token is good for an hour; clients fetch a fresh one to reconnect

export function syncEnabled(): boolean {
  return Boolean(env.SYNC_URL && env.SYNC_SECRET);
}

/**
 * A room token for the sync Worker: `<payload>.<sig>`, base64url, where sig is
 * HMAC-SHA256 over the payload with SYNC_SECRET. The Worker checks it and that
 * its project matches the room before letting the socket in.
 */
export function roomToken(projectId: string, principal: string, role: Role): string {
  if (!env.SYNC_SECRET) throw new Error("SYNC_SECRET is not set");
  const payload = Buffer.from(
    JSON.stringify({ p: projectId, s: principal, r: role, e: Math.floor(Date.now() / 1000) + TTL_S }),
  ).toString("base64url");
  const sig = createHmac("sha256", env.SYNC_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

/** What a client needs to join a project's room. */
export function roomAccess(projectId: string, principal: string, role: Role) {
  const url = new URL(env.SYNC_URL!);
  return {
    host: url.host,
    secure: url.protocol === "https:",
    room: projectId,
    token: roomToken(projectId, principal, role),
    role,
  };
}
