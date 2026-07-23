import { authkitMiddleware } from "@workos-inc/authkit-nextjs";

/**
 * Session refresh happens here (Edge) so Server Components can call
 * `withAuth()` without trying to set cookies (which throws in RSC).
 * Dashboard is gated via middlewareAuth.
 * `/api/v1` uses API keys — skip cookie auth there.
 */
export default authkitMiddleware({
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: [
      "/",
      "/sign-in",
      "/sign-up",
      "/auth/:path*",
      "/api/trpc/:path*",
      "/api/v1/:path*",
    ],
  },
});

export const config = {
  matcher: [
    "/",
    "/dashboard",
    "/dashboard/:path*",
    "/sign-in",
    "/sign-up",
    "/auth/:path*",
    "/api/trpc/:path*",
    "/api/v1/:path*",
  ],
};
