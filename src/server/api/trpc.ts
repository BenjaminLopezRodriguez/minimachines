/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1).
 * 2. You want to add middleware / procedures (see Part 3).
 *
 * TL;DR - This is where the tRPC server stuff is created and plugged in. The pieces you will
 * need to use are documented accordingly near the end.
 */
import { withAuth } from "@workos-inc/authkit-nextjs";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";

import { db } from "~/server/db";
import { requireBetaAccess, BetaAccessError } from "~/server/data/beta";
import {
  enforceRateLimit,
  RequestLimitError,
} from "~/server/lib/distributed-rate-limit";

/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API.
 *
 * This helper generates the "internals" for a tRPC context. The API handler and RSC clients each
 * wrap this and provides the required context.
 *
 * @see https://trpc.io/docs/server/context
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
  const { user } = await withAuth();
  return {
    db,
    user,
    userId: user?.id ?? null,
    ...opts,
  };
};

/**
 * 2. INITIALIZATION
 *
 * This is where the tRPC API is initialized, connecting the context and transformer. We also parse
 * ZodErrors so that you get typesafety on the frontend if there is a validation error.
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/**
 * Create a server-side caller.
 *
 * @see https://trpc.io/docs/server/server-side-calls
 */
export const createCallerFactory = t.createCallerFactory;

/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build new routers and sub-routers in the
 * "/src/server/api/routers" directory.
 */

/**
 * This is how you create new routers and nested routers in your tRPC API
 */
export const createTRPCRouter = t.router;

/**
 * Middleware for timing procedure execution and adding an artificial delay in development.
 */
const timingMiddleware = t.middleware(async ({ next, path }) => {
  const start = Date.now();

  if (t._config.isDev) {
    // artificial delay in dev
    const waitMs = Math.floor(Math.random() * 400) + 100;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  const result = await next();
  if (!result.ok && result.error.cause instanceof RequestLimitError)
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: result.error.cause.message,
      cause: result.error.cause,
    });
  if (!result.ok && result.error.cause instanceof BetaAccessError)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: result.error.cause.message,
      cause: result.error.cause,
    });

  const end = Date.now();
  console.log(`[TRPC] ${path} took ${end - start}ms to execute`);

  return result;
});

/**
 * Public (unauthenticated) procedure
 */
export const publicProcedure = t.procedure.use(timingMiddleware);

const enforceUser = t.middleware(async ({ ctx, next, type }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  if (!ctx.user?.emailVerified)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Verify your email through sign-in to continue.",
    });
  if (type === "mutation") {
    try {
      await enforceRateLimit(`mutation:${ctx.userId}`, 60, 60_000);
    } catch (error) {
      if (error instanceof RequestLimitError)
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: error.message,
        });
      throw error;
    }
  }
  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
    },
  });
});

/** Requires a signed-in WorkOS user. */
export const authenticatedProcedure = t.procedure
  .use(timingMiddleware)
  .use(enforceUser);
export const protectedProcedure = authenticatedProcedure.use(
  async ({ ctx, next }) => {
    try {
      await requireBetaAccess(ctx.userId);
    } catch (error) {
      if (error instanceof BetaAccessError)
        throw new TRPCError({ code: "FORBIDDEN", message: error.message });
      throw error;
    }
    return next();
  },
);
