/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  // Keep AI template Dockerfiles + the mm-pager tools available to serverless
  // tracing — the provisioner reads both from disk when building sandbox images.
  outputFileTracingIncludes: {
    "/dashboard": ["./templates/**/*", "./tools/**"],
    "/api/trpc/[trpc]": ["./templates/**/*", "./tools/**"],
    "/api/v1/machines": ["./templates/**/*", "./tools/**"],
  },
};

export default config;
