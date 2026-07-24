# Shareable Port Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task. Steps use `- [ ]`.
>
> **Discipline:** `/plan` `/ponytail` `/backend-check`.

**Goal:** One reusable **share layer** on minimachin.es that mints **branded, shareable links** to a web project's port — API or website — from either (a) a minimachines machine port or (b) any **local** project. Each share is **public or password-gated** (per-share choice) and revocable.

**Architecture:** The share layer is origin-agnostic: a `shares` row maps a `slug` → an `originUrl` + access policy. A **subdomain proxy** (`<slug>.minimachin.es`) resolves the slug and streams requests to the origin. Two origin providers feed it:
- **machine** — a minimachines sandbox port, tunneled by Modal; `originUrl` = that tunnel URL (derived server-side from `machineId`+`port`, never user-supplied).
- **local** — any localhost project; the `mm` CLI wraps an existing tunneler (`cloudflared`) to get a public origin URL, then registers it as a share.

Subdomain (not path) proxy so website assets with host-relative/absolute paths keep working with no rewriting. Gating uses **HTTP Basic auth** — browser-native prompt + `Authorization` header for API clients, no custom login page.

```
create:  mm share create --machine vm_x --port 3000 --web --gated
             → POST /api/v1/shares → slug + https://<slug>.minimachin.es
visit:   browser → <slug>.minimachin.es/... 
             → middleware maps host→slug → proxy route
             → gate check (public | Basic auth) → stream to originUrl → response
```

**Tech stack:** Next.js App Router (middleware + catch-all route proxy via `fetch` streaming), Drizzle (Postgres), `node:crypto` (slug + secret hash, same hash-only pattern as `apiKeys`/pager tokens), Vercel wildcard domain `*.minimachin.es`, `cloudflared` for local origins. Reuses `requireApiKey`, `jsonOk/jsonError`, the machine/tunnel plumbing.

## Global Constraints

- Every create/list/revoke is owner-scoped via `requireApiKey`.
- **SSRF is the top risk.** `originUrl` for a **machine** share is computed server-side from `machineId`+`port` (owner-checked) — never taken from the client. For a **local** share the client supplies the tunnel URL, so it MUST be validated: https only, public hostname, reject private/loopback/link-local IP ranges, and ideally restricted to known tunneler domains (`*.trycloudflare.com` / a verified custom tunnel). Do not proxy to arbitrary hosts.
- The proxy only forwards for an existing, `enabled` slug — no open proxy.
- Gated secret stored **hash-only**; revoke = `enabled=false` (link 404s immediately).
- Modal `encryptedPorts` is a create-time param → the set of shareable machine ports is fixed at provision (see Task 4).
- New env: none required beyond wildcard domain config; optional `SHARE_BASE_DOMAIN` (default `minimachin.es`).
- Do not commit unless the user asks. Prefer `tsx --test`.

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/server/db/schema.ts` | `shares` table |
| `src/server/data/shares.ts` | create/list/getBySlug/revoke/touch + slug gen + SSRF-safe origin resolution |
| `src/server/data/shares.test.ts` | slug uniqueness, gate hash, revoke, private-IP rejection |
| `src/server/data/modal-driver.ts` | expose a machine port range; return per-port tunnel URLs |
| `src/server/data/machine-store.ts` | persist port→tunnelUrl map on the machine |
| `src/middleware.ts` | detect `<slug>.minimachin.es` host → rewrite to `/_share/[slug]` |
| `src/app/_share/[slug]/[[...path]]/route.ts` | the reverse proxy (all methods) + gate enforcement |
| `src/app/api/v1/shares/route.ts` | `POST` create, `GET` list |
| `src/app/api/v1/shares/[slug]/route.ts` | `DELETE` revoke |
| `packages/cli/src/cli.ts` | `mm share create|ls|rm`, `mm share --local` (cloudflared) |
| `src/app/dashboard/**` | shares panel: create from a machine port, copy link, revoke |
| `next.config.js` | wildcard host handling if needed |

---

### Task 0 — Wildcard domain (enabling, partly ops)

- Add `*.minimachin.es` to the Vercel project; add a wildcard DNS record (`*` CNAME → Vercel) at the domain's DNS provider; confirm Vercel issues the wildcard TLS cert.
- **Verify** a throwaway subdomain resolves + serves before building the proxy. Without this, no branded links.

### Task 1 — `shares` schema

`shares`: `slug` (pk/unique, short base32), `ownerUserId`, `originKind` (`machine`|`local`), `originUrl`, `machineId?`, `port?`, `label` (free text), `kind` (`api`|`website`), `access` (`public`|`gated`), `secretHash?`, `enabled` (default true), `createdAt`, `lastUsedAt?`. Index `(ownerUserId)`.

### Task 2 — Share store

- `createShare({ ownerUserId, originKind, machineId?, port?, localUrl?, kind, access, secret? })`:
  - machine → resolve `originUrl` from the machine's stored port→tunnel map (owner-checked); reject if that port isn't exposed.
  - local → validate `localUrl` (Task-level SSRF checks) → `originUrl`.
  - unique slug; hash `secret` if gated.
- `getShareBySlug(slug)` (proxy path — no auth, returns enabled row only), `listShares(ownerUserId)`, `revokeShare({ ownerUserId, slug })`, `touchShare(slug)`.
- **Test:** slug collision retry; private-IP `localUrl` rejected; gated secret hash-only.

### Task 3 — Subdomain proxy

- `middleware.ts`: if `host` is `<slug>.minimachin.es` (not `www`/apex), rewrite to `/_share/<slug>` preserving path/query. Keep `/api/v1` and existing matcher behavior intact.
- `_share/[slug]/[[...path]]/route.ts` — export all methods (`GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS`):
  1. `getShareBySlug` → 404 if missing/disabled.
  2. gate: `access==="gated"` → require Basic auth matching `secretHash`, else `401` + `WWW-Authenticate: Basic`.
  3. build origin request: `originUrl` + path + query, forward method/body/safe headers (strip `host`, hop-by-hop), `redirect: "manual"`, stream response body back. `touchShare` (throttled).
- **Ponytail:** WebSocket upgrade proxying is out of v1 — note it; HTTP/SSE only.
- **Test:** public passes through; gated 401 without creds, 200 with; disabled → 404.

### Task 4 — Machine port exposure

- Provision exposes a small fixed range (e.g. `3000–3009`) via `encryptedPorts`; after create, capture `tunnels[port].url` for each and persist a `port→url` map on the machine (new column `ports jsonb`, or a `machinePorts` table).
- Share creation for a machine looks up this map. Document the fixed-range ceiling; dynamic per-port tunnels are a later upgrade if Modal supports post-create ports.
- **Test:** created machine records tunnel URLs for the range.

### Task 5 — CLI

- `mm share create --machine <id> --port <n> [--api|--web] [--public|--gated]` → prints `https://<slug>.minimachin.es`.
- `mm share --local <port> [--api|--web] [--public|--gated]` → starts `cloudflared tunnel --url http://localhost:<port>`, reads its public URL, registers a `local` share pointing at it, prints the branded link; holds until Ctrl-C (keeps the tunnel up).
- `mm share ls` / `mm share rm <slug>`.
- **Ponytail:** wrap `cloudflared` — do not build a tunnel relay. Require it on PATH; clear error if missing.

### Task 6 — Dashboard

- A "Share" control on a running machine's port(s): pick api/website, public/gated, create → copy branded link, list active shares, revoke. Reuse the existing machine drawer.

### Task 7 — backend-check

- [ ] create/list/revoke owner-scoped; wrong owner can't revoke another's slug.
- [ ] machine `originUrl` derived server-side (never client-supplied); local `originUrl` passes SSRF checks (no private/loopback/link-local; https public host).
- [ ] gated proxy rejects without Basic creds; secret hash-only; revoked slug 404s at once.
- [ ] proxy forwards only for enabled slugs (not an open proxy); hop-by-hop headers stripped.

---

## Deferred to v1.1+

- WebSocket / raw-TCP proxying (v1 is HTTP/SSE).
- Custom vanity slugs + `<slug>` collisions UX; per-share analytics (request counts).
- Native minimachines tunnel client for `local` (replace the `cloudflared` dependency) if we want to own the path.
- Path-based `/p/<slug>` mode for API-only shares (skips the wildcard-DNS dependency) — cheaper but breaks website assets, so subdomain is primary.
- Expiring / one-time share links; team-shared (org-scoped) links.

## Open questions carried to build

- **Wildcard DNS/TLS** (Task 0): confirm the plan tier supports `*.minimachin.es` wildcard cert on Vercel, and where DNS is managed.
- **Modal ports:** does the installed SDK allow exposing a port *after* create, or must the range be declared at `sandboxes.create`? Determines Task 4's fixed-range vs on-demand.
- **cloudflared availability:** bundle guidance vs require-on-PATH for `mm share --local`.
- **SSRF policy for local origins:** allow any validated public https host, or restrict to `*.trycloudflare.com` + verified custom tunnels only (stricter, safer).
