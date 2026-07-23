# Auth — WorkOS AuthKit (agent guide)

Auth is **WorkOS AuthKit** via `@workos-inc/authkit-nextjs`. Sessions live in an encrypted cookie. There is no local users table for login — WorkOS is the source of truth for accounts.

Agent/API access uses **dashboard API keys** (`mm_…`) with the `minimachine` npm package — see [packages/minimachine/README.md](packages/minimachine/README.md). Keys are created under **Dashboard → API keys**.

Docs: [AuthKit Next.js](https://github.com/workos/authkit-nextjs) · [Create user API](https://workos.com/docs/reference/user-management/user/create)

---

## Env (required)

Copy `.env.example` → `.env.local` and fill:

| Variable | Notes |
|---|---|
| `WORKOS_API_KEY` | `sk_test_…` / `sk_live_…` from WorkOS dashboard |
| `WORKOS_CLIENT_ID` | `client_…` |
| `WORKOS_COOKIE_PASSWORD` | ≥32 chars — `openssl rand -base64 32` |
| `NEXT_PUBLIC_WORKOS_REDIRECT_URI` | Must match a redirect URI in WorkOS (local: `http://localhost:3000/auth/callback`) |

Validated in `src/env.js`. Missing/invalid values fail the build unless `SKIP_ENV_VALIDATION=1`.

**Dashboard checklist (human or agent with WorkOS access):**

1. Enable AuthKit / User Management for the environment.
2. Add redirect URI = `NEXT_PUBLIC_WORKOS_REDIRECT_URI` (exact match, including `https` and no trailing slash unless you use one).
3. Set the app **sign-in endpoint** to `http://localhost:3000/sign-in` (prod: your domain + `/sign-in`).
4. Email + password (and/or social) auth methods enabled so signup works.

### Production (Vercel + custom domains)

Production uses the **`minimachines` WorkOS team → `Production` environment**:

| | |
|---|---|
| Team | `team_01K0BYVWBXJ90N2XCKGJ4BXD49` (`minimachines`) |
| Environment | `environment_01K0BYVWW70CWFXZQ320EA7E7F` (`Production`, non-sandbox) |
| Application | `app_01KKFCTVM7T9V0RT5FBHZ6EPWD` |
| Client ID | `client_01K0BYVX1E2BTBQGHPX8GFX4KN` |
| API key | named `vercel-production`, no expiry |
| AuthKit domain | `merry-cave-83.authkit.app` |

The WorkOS team contains **two projects** with confusingly similar names. The
one above is **`minimachines's Project`**. There is also a newer project just
called `minimachines` with its own Staging/Production — not used. Check the
project selector, not just the environment selector, before creating keys.

Production requires a payment method on the WorkOS team; without one the
Production environment is hidden from the dashboard entirely and has no API keys.

Local `.env.local` points at a **different** WorkOS team — don't copy its
`WORKOS_CLIENT_ID` into Vercel.

Configured on that application (already applied):

| Setting | Value |
|---|---|
| Redirect URI (default) | `https://www.minimachin.es/auth/callback` |
| Also allowed | `https://minimachin.es/auth/callback` |
| Also allowed | `https://www.minimachines.co/auth/callback` |
| Also allowed | `https://minimachines.co/auth/callback` |
| Sign-in endpoint (`initiateLoginUri`) | `https://www.minimachin.es/sign-in` |
| Sign-up URL (`signUpUrl`) | **empty — must stay empty** |
| Homepage | `https://www.minimachin.es` |
| Logout URIs | all four origins above |
| Auth methods | email + password, magic auth, sign-up allowed |

⚠️ **Do not set `signUpUrl` to `/sign-up`.** That field means "this app hosts
its *own* sign-up page, don't show the AuthKit one". Our `/sign-up` route only
calls `getSignUpUrl()` and redirects back to AuthKit, so setting it produces an
infinite loop (`authkit/sign-up → /sign-up → authorize → authkit/sign-up`) and
the browser fails with "too many redirects". Leave it empty so AuthKit serves
its hosted sign-up screen. `initiateLoginUri` → `/sign-in` is fine and correct —
that one is the *start* of login, not a replacement for the AuthKit screen.

Vercel Production must set:

```env
NEXT_PUBLIC_WORKOS_REDIRECT_URI=https://www.minimachin.es/auth/callback
WORKOS_CLIENT_ID=client_01K0BYVX1E2BTBQGHPX8GFX4KN
WORKOS_API_KEY=sk_live_…   # Production environment secret key
WORKOS_COOKIE_PASSWORD=…   # 32+ chars
```

Redeploy after changing env. Keep localhost in **Staging** for local `pnpm dev`.

`www.minimachin.es` is canonical. `NEXT_PUBLIC_WORKOS_REDIRECT_URI` is a single
build-time value pointing there, so a login flow **must not start on another
host**: `getSignInUrl()`/`getSignUpUrl()` set the PKCE verifier cookie on
whatever host served the request, and the callback on `minimachin.es` cannot
read a cookie set on `minimachines.co` → `missing_pkce_cookie` and a
*"Couldn't sign in"* error page.

Both `.co` hostnames are therefore **308 redirects to `www.minimachin.es`** in
Vercel → Project → Domains. Keep it that way, or the bug returns:

| Domain | Setting |
|---|---|
| `minimachines.co` | 308 → `www.minimachin.es` |
| `www.minimachines.co` | 308 → `www.minimachin.es` |
| `minimachin.es` | 308 → `www.minimachin.es` |
| `www.minimachin.es` | serves Production |

Vercel won't let you redirect a domain that another domain already redirects
*to* — repoint the apex first, then the `www` host.

All four callbacks stay registered in WorkOS, so making `.co` canonical later is
an env-var change plus flipping these redirects.

**Vercel env vars on this project are `Sensitive`** — `vercel env pull` prints
them as `""`. That is not an empty value; sensitive vars cannot be decrypted
after being written. Check them in the Vercel dashboard, not via `pull`.

Mismatch of any character vs the dashboard list → *"This is not a valid redirect URI"*. See [Redirect URIs](https://workos.com/docs/sso/redirect-uris).

---

## Routes in this repo

| Path | Role |
|---|---|
| `GET /sign-in` | `getSignInUrl()` → redirect to AuthKit (existing users) |
| `GET /sign-up` | `getSignUpUrl()` → redirect to AuthKit (create account) |
| `GET /auth/callback` | `handleAuth({ returnPathname: "/dashboard" })` |
| `/dashboard` | Gated in **middleware**, not the page. The page calls plain `await withAuth()` (read-only) — it does **not** pass `ensureSignedIn` |

Middleware: `src/middleware.ts` (`authkitMiddleware`) refreshes the session and
does the gating via `middlewareAuth: { enabled: true, unauthenticatedPaths: [...] }`.
Matcher covers `/`, `/dashboard`, `/dashboard/*`, `/sign-in`, `/sign-up`,
`/auth/*`, `/api/trpc/*`, `/api/v1/*`. Everything except `/dashboard*` is listed
as an unauthenticated path — `/api/v1` authenticates with `mm_…` keys instead of
the session cookie, so it must stay unauthenticated here.

**Never** call `getSignInUrl()` / `getSignUpUrl()` inside a Server Component render. Only in route handlers or server actions (they set PKCE cookies).

---

## How agents create accounts

### Option A — Hosted AuthKit (browser)

1. Ensure env + dashboard redirect/sign-in endpoint are set.
2. `pnpm dev`
3. Open **http://localhost:3000/sign-up** (or click **Sign up** in the header).
4. Complete AuthKit signup → callback → `/dashboard`.

For an already-created user: **http://localhost:3000/sign-in**.

⚠️ **Port 3000 only.** `NEXT_PUBLIC_WORKOS_REDIRECT_URI` is baked in at build
time, so if port 3000 is busy Next starts on 3001 but still sends
`redirect_uri=http://localhost:3000/auth/callback` — the browser lands back on
the wrong port and the callback fails. Free port 3000 first
(`lsof -ti:3000 | xargs kill`) rather than accepting the fallback port.

Note: `.env.local` points at a WorkOS team that is **not** the `minimachines`
team in this doc, so local sign-in resolves to `jubilant-revelation-77-sandbox
.authkit.app`, not `merry-cave-83`. Local and production are separate account
pools; a user created in one cannot sign in to the other.

### Option B — API script (no browser)

Creates a WorkOS user with email + password via User Management API. Use for test/dev accounts.

```bash
# From repo root, with .env.local loaded
pnpm auth:create-user -- --email agent@example.com --password 'ChangeMe_now_1!' --first Agent --last Test
```

Optional flags:

- `--verified` — set `emailVerified: true` (skip verification email in test)
- `--json` — print raw user JSON

Implementation: `scripts/create-workos-user.ts` using `@workos-inc/node` `userManagement.createUser`.

After API create, sign in through **http://localhost:3000/sign-in** with that email/password (AuthKit still issues the session cookie).

### Option C — curl (same API)

```bash
source <(grep -E '^WORKOS_API_KEY=' .env.local | sed 's/^/export /')

curl -sS -X POST "https://api.workos.com/user_management/users" \
  -H "Authorization: Bearer $WORKOS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "agent@example.com",
    "password": "ChangeMe_now_1!",
    "first_name": "Agent",
    "last_name": "Test",
    "email_verified": true
  }'
```

---

## App code patterns

```ts
// Gate a page / layout
import { withAuth } from "@workos-inc/authkit-nextjs";
const { user } = await withAuth({ ensureSignedIn: true });

// Sign out (server action)
import { signOut } from "@workos-inc/authkit-nextjs";
await signOut({ returnTo: "/" });
```

Provider: `AuthKitProvider` wraps the app in `src/app/layout.tsx`.

---

## Agent do / don't

**Do**

- Prefer `/sign-up` for interactive account creation.
- Prefer `pnpm auth:create-user` for scripted/test users.
- Keep secrets in `.env.local` only — never commit them.
- After creating a user via API, use `/sign-in` to get a browser session.

**Don't**

- Invent WorkOS dashboard click-paths; use [WorkOS docs](https://workos.com/docs) / dashboard search.
- Call `getSignInUrl` / `getSignUpUrl` from RSC render.
- Assume a local DB row = a login account (waitlist `email` ≠ WorkOS user).

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Redirect URI mismatch | Add exact `NEXT_PUBLIC_WORKOS_REDIRECT_URI` in WorkOS |
| `cookies()` / PKCE error | Move auth URL helpers into a route handler |
| Create user 401 | Check `WORKOS_API_KEY` for the same environment as `CLIENT_ID` |
| Signup disabled | Enable AuthKit email/password (or social) in WorkOS |
| Dashboard loops to sign-in | Cookie password too short / wrong env; regenerate ≥32 chars |
