import { authkitMiddleware } from "@workos-inc/authkit-nextjs";

// Session kept fresh on matched routes. `withAuth({ ensureSignedIn })` on
// /machines does the gate — no middlewareAuth blanket required yet.
export default authkitMiddleware();

export const config = {
  matcher: ["/", "/dashboard", "/dashboard/:path*", "/machines", "/sign-in", "/auth/:path*"],
};
