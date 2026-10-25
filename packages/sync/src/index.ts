/**
 * minimachines sync: one Durable Object (`ProjectRoom`) per project holds the
 * project's Yjs document — every file as a Y.Text under the "files" map. All
 * clients (browser editor, `mm sync` on laptops and machines) edit it
 * optimistically; Yjs merges. The Worker admits only holders of a room token
 * signed by the app, and viewers are read-only.
 */
import { routePartykitRequest, type Connection, type ConnectionContext } from "partyserver";
import { YServer } from "y-partyserver";
import * as Y from "yjs";

type Env = { Main: DurableObjectNamespace<ProjectRoom>; SYNC_SECRET: string };
type Role = "owner" | "member" | "viewer";
type Claims = { p: string; s: string; r: Role; e: number };

const ROLE_HEADER = "x-mm-role";
const CHUNK = 1_000_000; // bytes per SQLite row; DO rows cap at 2 MB

const b64url = {
  decode: (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
};

/** `<payload>.<sig>`, both base64url; sig = HMAC-SHA256(payload, SYNC_SECRET). */
async function verify(token: string, secret: string): Promise<Claims | null> {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  let ok = false;
  try {
    ok = await crypto.subtle.verify("HMAC", key, b64url.decode(sig), new TextEncoder().encode(payload));
  } catch {
    return null;
  }
  if (!ok) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(b64url.decode(payload))) as Claims;
    return claims.e * 1000 > Date.now() ? claims : null;
  } catch {
    return null;
  }
}

export class ProjectRoom extends YServer<Env> {
  static callbackOptions = { debounceWait: 1000, debounceMaxWait: 5000, timeout: 5000 };

  async onLoad() {
    this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS snapshot (seq INTEGER PRIMARY KEY, data BLOB NOT NULL)");
    const rows = this.ctx.storage.sql.exec<{ data: ArrayBuffer }>("SELECT data FROM snapshot ORDER BY seq").toArray();
    if (!rows.length) return;
    const parts = rows.map((r) => new Uint8Array(r.data));
    const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) all.set(p, (at += p.length) - p.length);
    Y.applyUpdate(this.document, all);
  }

  async onSave() {
    const update = Y.encodeStateAsUpdate(this.document);
    // One synchronous transaction: a crash never leaves half a snapshot.
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec("DELETE FROM snapshot");
      for (let i = 0, seq = 0; i < update.length; i += CHUNK, seq++) {
        this.ctx.storage.sql.exec("INSERT INTO snapshot (seq, data) VALUES (?, ?)", seq, update.slice(i, i + CHUNK));
      }
    });
  }

  onConnect(conn: Connection, ctx: ConnectionContext) {
    // The role header is set by the Worker from a verified token, never by the client.
    conn.setState({ readOnly: ctx.request.headers.get(ROLE_HEADER) !== "owner" && ctx.request.headers.get(ROLE_HEADER) !== "member" });
    return super.onConnect(conn, ctx);
  }

  isReadOnly(conn: Connection) {
    return (conn.state as { readOnly?: boolean } | null)?.readOnly ?? true;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname === "/health") return new Response("ok");
    const routed = await routePartykitRequest(request, env, {
      onBeforeConnect: async (req) => {
        const url = new URL(req.url);
        const room = url.pathname.split("/").filter(Boolean)[2];
        const claims = await verify(url.searchParams.get("token") ?? "", env.SYNC_SECRET);
        if (!claims || claims.p !== room) return new Response("Unauthorized", { status: 401 });
        const headers = new Headers(req.headers);
        headers.set(ROLE_HEADER, claims.r);
        return new Request(req, { headers });
      },
      // Plain HTTP to a room (not a WebSocket) is never needed; refuse it.
      onBeforeRequest: () => new Response("Not found", { status: 404 }),
    });
    return routed ?? new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
