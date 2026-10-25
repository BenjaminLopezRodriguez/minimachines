import { apiKeysRouter } from "~/server/api/routers/apiKeys";
import { machinesRouter } from "~/server/api/routers/machines";
import { orgsRouter } from "~/server/api/routers/orgs";
import { secretsRouter } from "~/server/api/routers/secrets";
import { gitRouter } from "~/server/api/routers/git";
import { botsRouter } from "~/server/api/routers/bots";
import { partnersRouter } from "~/server/api/routers/partners";
import { pushRouter } from "~/server/api/routers/push";
import { sharesRouter } from "~/server/api/routers/shares";
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
  git: gitRouter,
  bots: botsRouter,
  apiKeys: apiKeysRouter,
  orgs: orgsRouter,
  secrets: secretsRouter,
  partners: partnersRouter,
  shares: sharesRouter,
  push: pushRouter,
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
