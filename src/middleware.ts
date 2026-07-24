import { authkitMiddleware } from "@workos-inc/authkit-nextjs";
import {
  NextResponse,
  type NextFetchEvent,
  type NextRequest,
} from "next/server";

/**
 * Two jobs:
 * 1. Share subdomains (`<slug>.minimachin.es`) → rewrite to the proxy route,
 *    bypassing auth entirely (a share link must open with no login).
 * 2. Everything else → the existing AuthKit session/gate, but ONLY for the
 *    paths it owned before. `/api/v1` still never touches AuthKit (it would
 *    strip the `Authorization` header API keys use).
 */
const authkit = authkitMiddleware({
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: [
      "/",
      "/sign-in",
      "/sign-up",
      "/auth/:path*",
      "/api/trpc/:path*",
    ],
  },
});

const AUTH_PATHS =
  /^\/$|^\/(dashboard|pager|sign-in|sign-up|auth|api\/trpc)(?:\/|$)/;

function shareSlug(host: string): string | null {
  const h = (host.split(":")[0] ?? "").toLowerCase();
  const suffix = "." + (process.env.SHARE_BASE_DOMAIN ?? "minimachin.es");
  if (!h.endsWith(suffix)) return null;
  const sub = h.slice(0, -suffix.length);
  if (!sub || sub === "www" || sub.includes(".")) return null;
  return sub;
}

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  const slug = shareSlug(req.headers.get("host") ?? "");
  if (slug) {
    const url = req.nextUrl.clone();
    url.pathname = `/_share/${slug}${url.pathname === "/" ? "" : url.pathname}`;
    return NextResponse.rewrite(url);
  }
  if (AUTH_PATHS.test(req.nextUrl.pathname)) return authkit(req, event);
  return NextResponse.next();
}

export const config = {
  // Broad so share subdomains are seen on every path; static assets excluded.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
