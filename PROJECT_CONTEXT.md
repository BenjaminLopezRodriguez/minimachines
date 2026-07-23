# minimachines — Project Context

> Onboarding brief. Read this file alone and you can be productive. Trust the code over prose; where they disagreed, this doc reflects the code (2026-07-22).

## 1. Summary

**minimachines** is a marketing landing page + early-access email waitlist for a (not-yet-built) product: **dedicated cloud VMs for coding agents** (Claude, Codex, Grok, Cursor, Gemini). The pitch: move heavy agentic-dev compute off your laptop, one isolated VM per agent. This repo is *only* the landing page and waitlist capture — none of the actual VM product exists here. It's a stock **create-t3-app** scaffold (v7.40.0) with a single custom feature (`waitlist.join`) and a hand-built animated landing page. Production target is **Vercel + Neon Postgres**.

## 2. Stack + versions

- **Package manager:** pnpm 10.27.0 (`packageManager` pinned). Node type: ESM (`"type": "module"`).
- **Framework:** Next.js `^15.2.3` (App Router, `--turbo` dev), React `^19.0.0`.
- **Language:** TypeScript `^5.8.2` (strict).
- **API layer:** tRPC `^11.0.0` (`@trpc/server`, `/client`, `/react-query`) + superjson transformer.
- **Data fetching:** TanStack React Query `^5.69.0`.
- **ORM/DB:** Drizzle ORM `^0.41.0` on `postgres` `^3.4.4` (postgres-js driver); drizzle-kit `^0.30.5`. PostgreSQL.
- **Styling:** Tailwind CSS `^4.0.15` (v4, PostCSS plugin `@tailwindcss/postcss`), `tw-animate-css`, shadcn/ui (New York style — see `components.json`), `class-variance-authority`, `tailwind-merge`, `clsx`.
- **Forms/validation:** react-hook-form `^7.55.0` + `@hookform/resolvers` + Zod `^3.24.2`.
- **Animation:** framer-motion `^12.6.2`. Icons: lucide-react.
- **Env safety:** `@t3-oss/env-nextjs` `^0.12.0`.
- **Tooling:** ESLint 9 (flat config) + typescript-eslint + `eslint-plugin-drizzle`; Prettier + `prettier-plugin-tailwindcss`. Fonts: Geist / Geist Mono via `next/font/google`.

## 3. Architecture map (modules → responsibility)

Request flow: **Client Component form → `api.waitlist.join` (tRPC React Query hook) → POST `/api/trpc/[trpc]` → `fetchRequestHandler` → `waitlistRouter.join` → Drizzle insert → Postgres.** Everything renders as a Server Component except the form, the type-animation, and the VM preview.

```
src/
  app/
    layout.tsx            RootLayout: SEO metadata, Geist fonts, wraps children in TRPCReactProvider
    page.tsx              Home (server): SiteHeader → Hero → ProductSections → SiteFooter
    api/trpc/[trpc]/route.ts  tRPC HTTP handler (GET+POST) — the only API route
  server/
    api/
      root.ts             appRouter = { waitlist } (+ createCaller)
      trpc.ts             tRPC init, superjson, ZodError formatter, timingMiddleware (adds random 100–500ms delay in DEV only), publicProcedure
      routers/waitlist.ts join mutation: validate email → insert → map PG unique-violation (23505) to CONFLICT
    db/
      index.ts            Drizzle client; caches postgres conn on globalThis outside production
      schema.ts           `minimachines_waitlist` table (pgTableCreator prefix: minimachines_*)
      seed.ts             seed script (pnpm db:seed) — inserts sample waitlist rows
  trpc/
    react.tsx             TRPCReactProvider — client-side tRPC + React Query wiring
    server.ts             server-side tRPC caller / RSC helper
    query-client.ts       React Query client factory
  types/waitlist.ts       waitlistFormSchema (client Zod: required + email) + WaitlistFormValues
  hooks/use-waitlist-form.ts  RHF + useMutation; OPTIMISTIC: sets success on onMutate, rolls back on error
  components/
    landing/              hero, product-sections, vm-preview, site-header, site-footer, agent-logos
    waitlist/waitlist-form.tsx  the form (framer-motion success/error swap)
    ui/                   shadcn primitives: button, input, label, form + custom diffuse-type-text
  lib/utils.ts            cn() (clsx + tailwind-merge)
  styles/globals.css      Tailwind v4 + design tokens + custom mm-* animations
  env.js                  t3 env validation (imported by next.config.js at build)
```

**Notable custom component:** `ui/diffuse-type-text.tsx` — a scramble/settle text-reveal animation (respects `prefers-reduced-motion`, IntersectionObserver-triggered or `startOnMount`). Its `wave` prop is **dead** (documented "Unused — kept so existing call sites keep working") yet every call site passes it. Harmless, but it's the one bit of intentional dead API.

## 4. Data model + integrations

**Single table** `minimachines_waitlist` (prefix from `pgTableCreator`, so one DB can host multiple projects):

| column    | type                       | notes                              |
|-----------|----------------------------|------------------------------------|
| id        | uuid PK                    | `defaultRandom()` / `gen_random_uuid()` |
| email     | varchar(320) NOT NULL      | **unique index** `waitlist_email_idx` |
| createdAt | timestamptz NOT NULL       | `$defaultFn(() => new Date())`     |

- Dedup: server lowercases + trims email before insert; unique index enforces one row per (lowercased) email. Duplicate → tRPC `CONFLICT` "This email is already on the waitlist."
- **Migrations:** `drizzle/migrations/0000_next_boomer.sql`, journal has exactly one entry. **Schema and migration are in sync — no pending drift.**
- **External integrations:** none wired in code beyond Postgres. No auth provider, no email/SMS sender, no analytics, no payment, no queue. (The success copy promises "we'll email you" but **no email is actually sent** — nothing writes to an ESP.)
- **Deploy:** Vercel (`vercel.json`: framework nextjs, pnpm build/install) + Neon Postgres (README deploy steps).

## 5. Auth / config

- **Auth: WorkOS AuthKit** (`@workos-inc/authkit-nextjs`), wired as infra: `src/middleware.ts` (`authkitMiddleware()`, session available on `/`, **enforced nowhere**), `src/app/auth/callback/route.ts` (`handleAuth()`), `AuthKitProvider` in root layout, header shows Sign in / Sign out via server-side `withAuth()`. No route is gated yet and there is **no `protectedProcedure`** — add both when the first gated surface exists. AuthKit **requires the `WORKOS_*` env vars set**, or dev/build/deploy fails.
- **Env vars** (validated in `src/env.js`, fail-fast at build):
  - `DATABASE_URL` (required, URL) — Postgres connection string.
  - `NODE_ENV` — enum, defaults `development`.
  - `WORKOS_API_KEY` (`sk_…`), `WORKOS_CLIENT_ID` (`client_…`), `WORKOS_COOKIE_PASSWORD` (≥32 chars) — WorkOS dashboard.
  - `NEXT_PUBLIC_WORKOS_REDIRECT_URI` (URL, e.g. `http://localhost:3000/auth/callback`) — must match a redirect URI configured in the WorkOS dashboard.
  - Escape hatch: `SKIP_ENV_VALIDATION=1` bypasses validation (for Docker/CI/lint without secrets).
- `.env.example` ships a local default: `postgresql://postgres:password@localhost:5432/minimachines`.

## 6. How to run / test / build locally

```bash
pnpm install
./start-database.sh          # local Postgres via Docker/Podman
cp .env.example .env         # then set DATABASE_URL if not using the default
pnpm db:push                 # or: pnpm db:generate && pnpm db:migrate
pnpm db:seed                 # optional sample data
pnpm dev                     # Next dev (turbo) on :3000
```

Other scripts: `pnpm build` / `pnpm start` / `pnpm preview` · `pnpm check` (= `next lint && tsc --noEmit`) · `pnpm typecheck` · `pnpm lint[:fix]` · `pnpm format:check|write` · `pnpm db:studio`.

**Verification status:** `node_modules` and `.env` are **not present** in this checkout, so `pnpm check` could not be run during onboarding. The last commit (`1f34daf "Fix lint and exclude env files"`) implies lint was green at commit time; code reads clean and strict. **Run `pnpm install && pnpm check` to confirm before building on it.**

## 7. Current state + known gaps

- **What works (as code):** full landing page, waitlist capture end-to-end (validation, insert, dedup, optimistic UI + success/error animation, a11y `role=status`/`aria-live`, `sr-only` label).
- **Almost no tests** — one `node:test` self-check (`src/server/lib/rate-limit.test.ts`, run with `pnpm exec tsx --test <file>`); no runner config, no CI. Quality gates are lint + typecheck.
- **Waitlist promises email, sends none** — no ESP/notification integration. Signups sit in Postgres; someone must query them manually.
- **All landing content is placeholder marketing** — metrics ("1.2s spin-up"), testimonials (Priya/Northline, Marcus/Harborkit, Elena/Silt), terminal snippets, and the `mm` CLI shown are fictional. No real product backs them.
- **Dead `wave` prop** on `DiffuseTypeText` (see §3) — cosmetic only.
- **Timing middleware** injects 100–500ms artificial latency in dev (intentional, dev-only — don't mistake it for a perf bug).
- No `robots.txt` / `sitemap.xml`, no OG image asset referenced by `twitter: summary_large_image`, no favicon confirmed beyond `public/`.
- **Risk areas:** thin surface, low risk. The public `join` mutation is guarded by a honeypot field + an **in-memory** IP rate limit (5 / 10 min in `src/server/lib/rate-limit.ts`). Ceiling: the Map is per-instance — under multi-instance load a determined attacker can still get through. Upgrade path when abuse is real: Upstash Redis (`@upstash/ratelimit`) or a Vercel Firewall rule, same call site.

## 8. Roadmap & intent (owner-stated, 2026-07-22)

This repo **stays a waitlist landing page for now.** The broader product vision:

- **Positioning:** "Run your agents in the cloud, save your laptop." Dedicated cloud VMs on a shared cluster, one per agent.
- **Auth:** **WorkOS (AuthKit)** is the chosen provider — replaces the "auth later" placeholder. The current schema/`publicProcedure`-only setup is deliberately structured so this drops in without a refactor.
- **The actual product (separate, larger effort — not built here yet):**
  - An **npm package** + a **skill/MCP** installable onto any coding agent, letting the agent spin up and build the user's project on a VM in a shared cluster.
  - Cluster orchestration via **Docker + Kubernetes**, **SSH between deployment clusters**, following network-access best practices (isolation, least-privilege).
  - Goal is to make the landing page's promises (the `mm` CLI, VM marketplace, cloud deploy/debug, collaborative cloud) real.
- **Likely near-term work *inside this repo*:** wire WorkOS AuthKit, add spam protection to the public `join` mutation, decide on signup-confirmation email, and swap placeholder marketing copy for real content when the product exists.

## 9. Open questions (still unresolved)

1. **Marketing copy is fictional** — metrics (1.2s spin-up), testimonials (Priya/Northline, Marcus/Harborkit, Elena/Silt), the `mm` CLI output. Ship as-is as aspirational, or mark/replace before public launch? Fake attributed testimonials carry real credibility/legal risk — worth a deliberate call.
2. **Signup email:** send a confirmation via WorkOS/an ESP (Resend, Loops), or manual DB export until launch?
3. ~~Spam protection on `join`~~ — done (honeypot + in-memory IP rate limit). Revisit only if abuse crosses instances (→ Upstash/Firewall).
4. **Neon connection:** pooled vs direct URL for the Vercel serverless runtime (postgres-js)? Any `sslmode` / connection-limit tuning needed?
5. **Analytics/consent:** Vercel Analytics or similar planned? If so, cookie-consent implications.
6. **Where does the product live** — same repo (monorepo: `apps/web` + `packages/cli` + `packages/mcp` + infra), or separate repos? Affects how this landing page is structured going forward.
```
