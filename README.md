# minimachines

Landing page and early access waitlist for minimachines, built on the T3 Stack.

## Stack

- [Next.js](https://nextjs.org) (App Router)
- [tRPC](https://trpc.io)
- [Drizzle ORM](https://orm.drizzle.team) + PostgreSQL
- [Tailwind CSS](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com)
- [React Hook Form](https://react-hook-form.com) + [Zod](https://zod.dev)
- [Framer Motion](https://www.framer.com/motion/)

## Getting started

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Start a local Postgres database (requires Docker or Podman):

   ```bash
   ./start-database.sh
   ```

3. Copy `.env.example` to `.env` and set `DATABASE_URL` if you're not using the default local database.

4. Push the schema to your local database:

   ```bash
   pnpm db:push
   ```

   Or generate and run versioned migrations instead:

   ```bash
   pnpm db:generate
   pnpm db:migrate
   ```

5. (Optional) Seed the database:

   ```bash
   pnpm db:seed
   ```

6. Run the dev server:

   ```bash
   pnpm dev
   ```

## Scripts

- `pnpm dev` — start the dev server
- `pnpm build` — production build
- `pnpm check` — lint + typecheck
- `pnpm lint` / `pnpm lint:fix` — ESLint
- `pnpm format:check` / `pnpm format:write` — Prettier
- `pnpm db:generate` — generate a Drizzle migration from `src/server/db/schema.ts`
- `pnpm db:migrate` — apply migrations
- `pnpm db:push` — push schema directly (useful for local dev)
- `pnpm db:studio` — open Drizzle Studio
- `pnpm db:seed` — seed the waitlist table

## Deployment (Vercel + Neon)

1. Push this repository to GitHub.
2. Import the repo into [Vercel](https://vercel.com/new).
3. Create a [Neon](https://neon.tech) Postgres database and connect it to the project (Vercel's Neon integration wires up the env vars automatically, or add `DATABASE_URL` manually in Project Settings → Environment Variables).
4. Run migrations against the production database:

   ```bash
   DATABASE_URL="<neon-connection-string>" pnpm db:migrate
   ```

5. Deploy. No further configuration is required.
