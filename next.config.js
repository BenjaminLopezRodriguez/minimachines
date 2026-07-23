/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  // Keep AI template Dockerfiles + manifest available to serverless tracing.
  outputFileTracingIncludes: {
    "/dashboard": ["./templates/**/*"],
    "/api/trpc/[trpc]": ["./templates/**/*"],
  },
};

export default config;
