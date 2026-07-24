# Agent Pager — companion app Implementation Plan (v1, email-first)

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Discipline:** `/plan` `/ponytail` `/backend-check`. Spec: [`docs/superpowers/specs/2026-07-23-agent-pager-companion-app.md`](../specs/2026-07-23-agent-pager-companion-app.md).

**Goal:** Ship Agent Pager v1: an auto-installed in-sandbox `mm-pager` utility that pages the machine's owner **by email** when the agent has a **question**, **finishes** an awaited task, or **succeeds**, with a signed reply link that lands the reply in a **mailbox the agent polls**. It is the proven local `baton` loop (`~/.claude/skills/baton/`) with its transport swapped from local files to the `/api/v1` surface. The pager stays inert until the owner adds a contact.

**Architecture:**
- **In-sandbox utility `mm-pager`** (self-contained `python3`, stdlib only) baked into every machine via the provisioner's platform layer. Verbs mirror `baton`:
  - `mm-pager notify <question|finished|succeeded> [text]` → `POST /api/v1/machines/:id/notify` (emit the page).
  - `mm-pager wait [--timeout N]` → poll `GET /api/v1/machines/:id/mailbox`, block until a reply row appears, print it to stdout (exit 0 got reply / 2 timeout), mirroring `baton done`.
  - `mm-pager hook` → optional Claude Code Stop-hook (inert unless armed); explicit `notify` is the primary path to avoid status spam.
- **Enabling change:** the sandbox has no credentials today. The provisioner mints a **per-machine scoped `mm_` key** and injects `MINIMACHINE_API_KEY`, `MM_MACHINE_ID`, `MM_BASE_URL` as sandbox env, so `mm-pager` authenticates as the machine's owner. Key is revoked on terminate.
- **Install point:** append the `mm-pager` install to `PLATFORM_COMMANDS` in `src/server/data/modal-driver.ts` (base-agnostic layer appended to every template → zero per-Dockerfile edits, no drift).
- **Backend (Next.js App Router, owner-scoped via existing `requireApiKey`):**
  - `notify` creates a signed, single-use, expiring reply token (hash-only at rest, same pattern as `apiKeys`) and sends the email via **Resend**.
  - Public reply page `/m/[token]` (text box in v1) posts back to `POST /m/[token]`, which verifies the token and inserts a `mailbox` row.
  - `GET /api/v1/machines/:id/mailbox` returns undelivered rows and marks them delivered — what `mm-pager wait` polls.
- **Channel:** Resend email only. SMS (Twilio) + opt-in/STOP compliance, voice (Web Speech API), photo (`<input capture>` → Vercel Blob), and the intelligence dial are **v1.1** (deferred below).

**Tech stack:** Next.js 15 App Router, Zod, Drizzle (Postgres), `node:crypto` (sha256 token hash, HMAC-free random token like `mm_` keys), `resend` SDK, `python3` stdlib for `mm-pager`. Reuses `requireApiKey`, `jsonOk/jsonError`, the `apiKeys` crypto pattern, and the `baton` loop logic.

## Global Constraints

- Reuse `mm_` Bearer auth + `requireApiKey` → `{ userId }`; every endpoint is owner-scoped and verifies the machine belongs to the caller.
- Reply token: random secret, **only sha256 stored** (`pagerEvents.tokenHash`); **single-use** (`consumedAt`) and **expiring** (`expiresAt`) — cannot be replayed.
- Only three event kinds. No status spam: the agent calls `notify` explicitly; the Stop-hook auto-page is opt-in.
- Pager inert until the owner has a verified contact (the `baton` armed-flag analogue).
- Send failures must not lose the event (log + surface; retry is v1.1).
- New env: `RESEND_API_KEY`, `PAGER_FROM_EMAIL`, `APP_BASE_URL` (reply links), `PAGER_TOKEN_SECRET` (reserved for HMAC upgrade). Add to `.env.example`.
- Do not commit unless the user asks (repo rule). Prefer `tsx --test`.

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/server/db/schema.ts` | Add `pagerContacts`, `pagerEvents`, `mailbox` tables |
| `src/server/data/pager.ts` | Contacts CRUD, event+token create, mailbox insert/poll/consume |
| `src/server/data/pager.test.ts` | Token single-use/expiry, owner scoping, mailbox consume |
| `src/server/data/notify-email.ts` | Resend send (summary + reply link); failure logs, never throws to caller path |
| `src/server/data/modal-driver.ts` | Inject env + per-machine key; add `mm-pager` install to `PLATFORM_COMMANDS` |
| `src/server/data/machine-store.ts` | Mint per-machine key on create, revoke on terminate |
| `src/app/api/v1/machines/[id]/notify/route.ts` | `POST` emit page (Bearer, owner-scoped) |
| `src/app/api/v1/machines/[id]/mailbox/route.ts` | `GET` poll+consume replies (Bearer, owner-scoped) |
| `src/app/m/[token]/page.tsx` | Mobile reply surface (text box v1) |
| `src/app/m/[token]/route.ts` (or action) | `POST` reply intake → verify token → mailbox row |
| `src/app/dashboard/settings/**` | "Pager contact" email field (reuse settings page) |
| `packages/cli/src/cli.ts` | `mm pager set --email …` / `mm pager status` |
| `tools/mm-pager` | The in-sandbox `python3` utility (source of truth, curl'd at image build) |
| `docs/agent-pager-skill.md` or sandbox skill | Ported `baton` skill: when to `notify` vs `wait` |
| `.env.example` | Resend + reply-link + token env |

---

### Task 0 — Enabling: sandbox credentials (do first)

**Files:** `modal-driver.ts`, `machine-store.ts`
- `provisionMachine` mints a per-machine `mm_` key (existing `createApiKey({ userId, label: 'machine:<id>' })`) and passes it to the sandbox as env alongside `MM_MACHINE_ID` and `MM_BASE_URL`.
- **Verify:** confirm the installed `modal` SDK exposes per-sandbox `env`/`secrets` on `sandboxes.create`; if only `Secret` objects are supported, wrap the three vars in an ephemeral Modal Secret.
- Revoke the machine key in `terminateMachine`.
- **Test:** unit — created machine has a key row labelled `machine:<id>`; terminate revokes it.

### Task 1 — Schema

**Files:** `schema.ts` (+ `pnpm db:generate`)
- `pagerContacts`: `ownerUserId` (unique), `email`, `phone?`, `emailVerifiedAt?`, `phoneVerifiedAt?`, `channels` (`email`|`sms`|`both`, default `email`), `createdAt`.
- `pagerEvents`: `id`, `machineId`, `ownerUserId`, `kind`, `text`, `tokenHash` (unique), `expiresAt`, `consumedAt?`, `createdAt`.
- `mailbox`: `id`, `machineId`, `ownerUserId`, `eventId`, `body`, `model?`, `imageUrl?` (v1.1), `deliveredAt?`, `createdAt`. Index `(machineId, deliveredAt)`.

### Task 2 — Contacts + CLI

**Files:** `pager.ts`, `packages/cli/src/cli.ts`, dashboard settings
- `setContact({ ownerUserId, email })`, `getContact(ownerUserId)`. v1: email set = verified (owner already authed); phone verify is v1.1.
- CLI: `mm pager set --email you@x.com` → tRPC/REST upsert; `mm pager status` → shows contact + whether pager is armed.
- Dashboard: a single email field on settings (reuse the API-keys panel page).
- **Test:** upsert idempotent; `getContact` returns null before set.

### Task 3 — `notify` endpoint + email

**Files:** `notify/route.ts`, `pager.ts`, `notify-email.ts`
- `POST /api/v1/machines/:id/notify { kind, text }`: `requireApiKey` → owner; assert machine owned by caller; require a contact (else `409 no_contact`).
- Create `pagerEvents` row + random token (store sha256), `expiresAt = now + 30m`.
- Send email via Resend: subject `[minimachines] <kind>`, body one-line `text` + link `${APP_BASE_URL}/m/<token>`. On send failure: log loudly, keep the event, return `502 notify_send_failed` (event not lost).
- **Test:** wrong-owner key → 404/403; no contact → 409; token stored hash-only.

### Task 4 — Reply page + intake

**Files:** `src/app/m/[token]/page.tsx`, `m/[token]/route.ts`
- `GET /m/:token`: look up event by token hash; if missing/consumed/expired → friendly "link expired" page. Else minimal mobile page: one-line event summary + a text box + Send. (Voice/photo/dial slots stubbed, hidden in v1.)
- `POST /m/:token { body, model? }`: verify token (unconsumed, unexpired) → insert `mailbox` row → mark event `consumedAt` (single-use) → show "sent, you can close this."
- **Test:** replay after consume → rejected; expired token → rejected.

### Task 5 — mailbox poll

**Files:** `mailbox/route.ts`, `pager.ts`
- `GET /api/v1/machines/:id/mailbox`: `requireApiKey` → owner; return undelivered rows for the machine, mark `deliveredAt`. This is what `mm-pager wait` consumes.
- **Test:** poll returns a row once, then empty (consume-once).

### Task 6 — `mm-pager` utility + install

**Files:** `tools/mm-pager`, `modal-driver.ts`
- Port `~/.claude/skills/baton/baton`: replace the local queue with HTTP.
  - `notify`: `POST …/notify` using env key/id; print delivery status.
  - `wait`: poll `GET …/mailbox` every ~2s; on a row, print `body` to stdout (exit 0); `--timeout` → exit 2. Bell + `MM_MACHINE_ID` banner on stderr like `baton`.
  - `hook`: Stop-hook; inert unless a local arm file exists (`mm-pager on`); armed → `notify finished` + `wait` → `{"decision":"block","reason":<reply>}`.
  - `selftest`: round-trip against a mock base URL / arg-parse smoke.
- Install: add to `PLATFORM_COMMANDS` — `RUN curl -fsSL <raw mm-pager URL> -o /usr/local/bin/mm-pager && chmod 755 /usr/local/bin/mm-pager` (python3 already installed by the platform/base). Pin the URL to a tag/commit.
- **Test:** `mm-pager selftest` in CI; manual: provision a machine, `notify`, reply on phone, `wait` returns it.

### Task 7 — Pager skill (agent behavior)

**Files:** sandbox skill / `docs/agent-pager-skill.md`
- Port the `baton` skill rule: **question →** `mm-pager notify question "<q>" && mm-pager wait`; **awaited task done →** `mm-pager notify finished`; **goal reached →** `mm-pager notify succeeded`. Never page for routine status. Ships into the sandbox so Claude Code inside picks it up.

### Task 8 — backend-check pass (from spec)

- [ ] `notify` auths by Bearer, scoped to the machine's owner.
- [ ] Reply token signed/hashed + single-use + expiring; replay rejected.
- [ ] Email send failure doesn't lose the event (log + non-2xx).
- [ ] Reply reaches the agent end-to-end (`wait` actually returns it), not just stored.

---

## Deferred to v1.1+

- **SMS (Twilio):** phone storage, opt-in verification, STOP/HELP compliance, `channels` routing.
- **Voice:** Web Speech API in the reply page (zero backend).
- **Photo:** `<input type="file" accept="image/*" capture="environment">` → Vercel Blob (private) → `mailbox.imageUrl` → agent fetches.
- **Intelligence dial:** `mailbox.model` → agent picks up model/effort tier for its next step.
- **Retry/queue** on notify send failure; multi-agent fan-out (one machine per contact in v1).

## Open questions carried to build

- **Modal env injection** (Task 0): exact SDK surface for per-sandbox env vs `Secret` — verify before wiring.
- **Kind detection for the Stop-hook:** v1 leaves it explicit (agent calls `notify`); auto-`finished` on stop is opt-in via `mm-pager on` to prevent spam.
- **Contact granularity:** per-owner in v1 (`pagerContacts.ownerUserId` unique). Per-machine override is a later column, not a v1 concern.
