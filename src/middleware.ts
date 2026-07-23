import { authkitMiddleware } from "@workos-inc/authkit-nextjs";

/**
 * Session refresh happens here (Edge) so Server Components can call
 * `withAuth()` without trying to set cookies (which throws in RSC).
 * Dashboard is gated via middlewareAuth.
 *
 * Do NOT put `/api/v1` in the matcher — AuthKit can strip the
 * `Authorization` header that API keys use.
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
  ],
};
