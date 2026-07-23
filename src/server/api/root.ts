import { apiKeysRouter } from "~/server/api/routers/apiKeys";
import { machinesRouter } from "~/server/api/routers/machines";
import { waitlistRouter } from "~/server/api/routers/waitlist";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  waitlist: waitlistRouter,
  machines: machinesRouter,
  apiKeys: apiKeysRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.waitlist.join({ email: "a@b.com" });
 */
export const createCaller = createCallerFactory(appRouter);
