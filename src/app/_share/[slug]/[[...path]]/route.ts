import { NextResponse } from "next/server";

import { checkGate, getShareBySlug, touchShare } from "~/server/data/shares";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string; path?: string[] }> };

// Hop-by-hop headers must not be forwarded (RFC 7230 §6.1).
const HOP = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

async function handle(req: Request, ctx: Ctx) {
  const { slug, path } = await ctx.params;
  const share = await getShareBySlug(slug);
  if (!share) return new NextResponse("Not found", { status: 404 });

  if (!checkGate(share, req.headers.get("authorization"))) {
    return new NextResponse("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="minimachines share"' },
    });
  }

  const url = new URL(req.url);
  const suffix = path?.length ? "/" + path.join("/") : "/";
  const target = share.originUrl.replace(/\/$/, "") + suffix + url.search;

  const headers = new Headers(req.headers);
  headers.delete("host");
  // Gated creds are ours, not the origin's — don't leak them upstream.
  if (share.access === "gated") headers.delete("authorization");
  for (const h of HOP) headers.delete(h);

  let res: Response;
  try {
    res = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
      redirect: "manual",
      // Streaming a request body requires half-duplex; not yet in the DOM types.
      duplex: "half",
    } as RequestInit);
  } catch {
    return new NextResponse("Bad gateway", { status: 502 });
  }

  if (!path?.length) void touchShare(slug); // only the root hit, to bound writes

  const out = new Headers(res.headers);
  for (const h of HOP) out.delete(h);
  return new NextResponse(res.body, { status: res.status, headers: out });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
