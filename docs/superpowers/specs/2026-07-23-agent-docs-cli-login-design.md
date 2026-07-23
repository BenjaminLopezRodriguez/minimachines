# Agent docs, skill store, and CLI device login — Design

**Date:** 2026-07-23  
**Status:** Approved for planning  
**Repo:** minimachines

## Goal

Make it easy for humans and coding agents to use minimachines end-to-end:

1. Dashboard **Docs** page (sidebar) with install + usage guidance.
2. A downloadable **agent skill** plus **MCP** config so agents can operate the platform.
3. CLI **`login` / `logout`** via a **device-code** flow that mints a real API key on the user’s account (fleet and keys update in the dashboard when the agent acts).

## Non-goals

- Replacing WorkOS browser sessions with API keys for the dashboard UI.
- Full OAuth client-credentials for third-party SaaS (device flow is enough for CLI/agents).
- Publishing a marketplace of third-party skills (v1 is a first-party minimachine skill only).
- Changing Modal provisioning behavior.

## Decisions locked

| Topic | Choice |
|-------|--------|
| CLI auth | Device-code primary; browser open + paste-key fallbacks |
| Docs location | Signed-in `/dashboard/docs` with sidebar **Docs** |
| Agent artifacts | Skill (`SKILL.md`) **and** MCP config snippet |
| Account reflection | Minted keys are normal `mm_` keys owned by WorkOS user; machines already scoped by `ownerUserId` |

## Architecture

```
packages/cli
  login / logout / run / whoami
  ~/.config/minimachines/credentials.json

src/app/dashboard/docs/page.tsx     # Install · Login · Skill · MCP
src/app/dashboard/cli/approve/      # Approve device code (signed-in)
public/skills/minimachine/SKILL.md  # Served for download
src/app/api/v1/auth/device/*        # code + token poll
src/server/data/device-codes.ts     # persistence
```

**Data flow (login)**

1. CLI → `POST /api/v1/auth/device/code` → `{ device_code, user_code, verification_uri, interval, expires_in }`
2. CLI opens `verification_uri?user_code=…` (or prints it).
3. Signed-in user approves on `/dashboard/cli/approve`.
4. Server creates API key (`label: CLI · …`), binds to device code.
5. CLI polls `POST /api/v1/auth/device/token` → receives secret once → writes credentials file.
6. Subsequent CLI/API calls use that key → dashboard fleet/keys show the same user’s activity.

## Device codes

### Schema (Postgres / Drizzle)

`minimachines_device_codes`:

| Column | Notes |
|--------|-------|
| `id` | uuid |
| `userCode` | short human code (e.g. `ABCD-1234`), unique while active |
| `deviceCodeHash` | hash of opaque device code (never store raw) |
| `expiresAt` | ~10 minutes from create |
| `approvedUserId` | WorkOS user id when approved |
| `mintedKeyId` | api_keys.id when key created |
| `consumedAt` | set when token endpoint returns the secret |
| `createdAt` | |

### Endpoints

| Method | Path | Auth | Behavior |
|--------|------|------|----------|
| POST | `/api/v1/auth/device/code` | none | Create codes |
| POST | `/api/v1/auth/device/token` | none | Body `{ device_code }`; pending / success / errors |
| POST | `/api/v1/auth/logout` | Bearer API key | Revoke current key |
| GET | `/dashboard/cli/approve` | session | Show code + Approve |
| POST | `/dashboard/cli/approve` | session | Approve → mint key |

**Token poll statuses (JSON):**

- `authorization_pending`
- `slow_down` (optional)
- `expired_token`
- `access_denied`
- `success` + `{ api_key, key_id, api_key_prefix, base_url }` (secret once)

**Approve page:** if not signed in, redirect to sign-in with return URL. On approve, create key via existing `createApiKey` helper with label like `CLI · <userCode>`.

Middleware: keep `/api/v1` **out** of AuthKit matcher (Authorization header must not be stripped). Approve route stays under `/dashboard` (cookie auth).

## CLI

Commands:

| Command | Behavior |
|---------|----------|
| `login` | Device flow; `--no-open` skips browser; `--paste` prompts for existing key |
| `logout` | `POST /auth/logout` if possible + delete credentials file |
| `whoami` | Show key prefix / base URL / logged-in state (no secret) |
| `run <id>` | Existing behavior; prefer credentials file, else `MINIMACHINE_API_KEY` |

**Credentials path:** `~/.config/minimachines/credentials.json`  
Shape: `{ apiKey, keyId, keyPrefix, baseUrl, createdAt }`

**Env override:** `MINIMACHINE_API_KEY` / `MINIMACHINE_BASE_URL` still override file when set.

Default base URL: `https://www.minimachin.es` (apex drops Authorization).

Publish bump `@minimachines/cli` after login lands (version patch).

## Docs page

Route: `/dashboard/docs`  
Sidebar: **Docs** with book icon, above or below API keys.

Content blocks (one purpose each):

1. **Install** — `pnpm dlx @minimachines/cli@latest` / `npm i -g @minimachines/cli`
2. **Login** — `minimachines login` + link to approve flow explanation
3. **Use** — create machine (dashboard or API) + `minimachines run <id>` + exec/files note
4. **Skill** — download / copy `SKILL.md`; short “what the agent will do”
5. **MCP** — copy JSON for Cursor/Claude pointing at published MCP or `minimachine-mcp`

Static skill file: `public/skills/minimachine/SKILL.md` (and optionally mirrored under `skills/minimachine/` in repo for agents cloning the repo).

## Agent skill contents (v1)

SKILL.md should instruct the agent to:

1. Prefer `minimachines login` (device flow) over asking the user to paste secrets in chat.
2. Use `www.minimachin.es` as base URL.
3. Create/list machines via API or dashboard; `run` opens console; use `exec` / files for non-interactive work.
4. Never print full API keys; use `whoami` / key prefix.
5. On finish, suggest `minimachines logout` if the session was temporary.

MCP snippet documents tools already exposed by the minimachine MCP package / remote API tools as available.

## Account reflection

- Keys minted by device login appear in **API keys** list (prefix, label, created, revoke).
- Machines created with that key already set `ownerUserId` → visible on fleet.
- Exec/files already scoped to owner → no extra sync job required in v1.
- Optional later: activity feed; **out of scope**.

## Error handling

- Expired/unknown user_code on approve → clear error, offer “start login again”.
- Poll after consume → `already_used` / 400.
- Logout with missing/invalid key → still delete local creds; remote revoke best-effort.
- Docs copy must stress **www** base URL.

## Testing

- Unit: device code create/approve/consume state machine; expired rejected.
- Unit: CLI credentials read/write precedence (env > file).
- Manual: `login` → approve in browser → key in Settings → `run` / create machine → `logout` revokes key.
- Manual: Docs page links + skill download + MCP copy.

## Out of scope follow-ups

- Public unauthenticated marketing `/docs`
- Multi-skill marketplace
- Refresh tokens / key rotation automation
- Apex domain Authorization fix (prefer www; optional redirect later)

## Success criteria

- Signed-in user opens **Docs**, follows install + login, agent/CLI obtains a key without pasting into chat.
- Key appears under API keys; agent-created machines appear on the fleet.
- `logout` removes local creds and revokes the key.
- Skill + MCP snippets are copy/downloadable from Docs.
