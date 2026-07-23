# `minimachine` npm package — Design

**Date:** 2026-07-23  
**Status:** Approved for planning  
**Repo:** minimachines

## Goal

Publish an npm package named `minimachine` so coding agents (and apps) can use https://minimachin.es to:

1. Spin up template-based machine sessions for prompts, builds, and project work.
2. Proactively create sessions for heavy workloads (e.g. image editing / render offload).

v1 ships a **stable public API contract** with **mocked runners**. Real Docker/K8s provisioning and interactive display streaming are follow-ups.

## Non-goals (v1)

- Real container/VM provisioning or image builds
- WebRTC/VNC remote desktop streaming
- Billing meters on exec/jobs
- Non-TypeScript SDKs
- Embedding-based template recommendation beyond existing keyword scoring

## Decisions locked

| Topic | Choice |
|-------|--------|
| Package shape | Single publishable package: TypeScript SDK + MCP bin (+ thin CLI) |
| Connection model | Hybrid: headless session (`exec`, files) + job offload API; display stream deferred |
| Provisioning | Mocked runners now; real provisioner as immediate follow-up (same API shapes) |
| Auth | Dashboard API keys (`mm_…`), `Authorization: Bearer` |
| Transport | REST `/api/v1` for agents; tRPC remains dashboard/browser-only |

## Architecture

```
packages/minimachine/              # published name: "minimachine"
  src/client.ts                    # Minimachine SDK
  src/mcp.ts                       # stdio MCP → SDK
  src/cli.ts                       # optional thin CLI
  package.json                     # bins: minimachine-mcp, minimachine

App (minimachin.es):
  src/app/api/v1/**                # REST handlers, API-key auth
  src/server/data/api-keys.ts      # create/verify/revoke (hash only)
  src/server/data/machine-store.ts # fleet + stub exec/files/jobs
  dashboard settings UI            # create/list/revoke keys
```

**Data flow**

- Agent/SDK/MCP → `MINIMACHINE_API_KEY` → `https://minimachin.es/api/v1/...` → auth helper → store helpers shared with dashboard where possible.
- Templates continue to come from `templates/manifest.json` via existing `templates.ts` helpers.
- Repo-local `@minimachines/mcp` (local mock, no network) is either deprecated or reduced to a thin wrapper that points agents at the published `minimachine` package for remote use. Local-only MCP may remain for offline/dev against `.data/machines.json`.

## Auth model

### API keys

- Created by a signed-in WorkOS user in the dashboard.
- Raw secret shown **once** at creation: prefix `mm_` + high-entropy random.
- Persist only: `id`, `userId` (WorkOS user id), `keyHash`, `keyPrefix` (e.g. first 8 chars after `mm_` for UI), `label`, `createdAt`, `lastUsedAt`, `revokedAt`.
- Verify: parse Bearer token → hash → lookup active key → attach `userId` to request context → update `lastUsedAt`.
- Revoke: set `revokedAt`; subsequent requests `401`.

### Env (client)

| Variable | Required | Default |
|----------|----------|---------|
| `MINIMACHINE_API_KEY` | yes (for remote calls) | — |
| `MINIMACHINE_BASE_URL` | no | `https://minimachin.es` |

### Schema (Drizzle)

Table `minimachines_api_keys` (via existing `createTable` prefix helper):

- `id` uuid PK  
- `userId` varchar not null (WorkOS user id)  
- `keyHash` varchar not null unique  
- `keyPrefix` varchar not null  
- `label` varchar  
- `createdAt`, `lastUsedAt`, `revokedAt` timestamps  

## REST API (`/api/v1`)

All routes require a valid API key unless noted. JSON request/response. Errors:

```json
{ "error": { "code": "unauthorized", "message": "Invalid API key" } }
```

HTTP mapping: `400` validation, `401` auth, `403` forbidden, `404` not found, `409` conflict, `500` internal.

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/templates?q=` | List/search catalog |
| GET | `/api/v1/templates/recommend?task=` | Ranked keyword recommendations |
| POST | `/api/v1/machines` | Create `{ templateId, name?, task? }` |
| GET | `/api/v1/machines` | List caller’s fleet |
| GET | `/api/v1/machines/:id` | Get one (must own) |
| POST | `/api/v1/machines/:id/stop` | Stop / teardown |
| POST | `/api/v1/machines/:id/exec` | `{ cmd, cwd?, env? }` → stubbed result |
| PUT | `/api/v1/machines/:id/files/*path` | Upload body (stub: store metadata + bytes in mock FS) |
| GET | `/api/v1/machines/:id/files/*path` | Download (stub) |
| POST | `/api/v1/machines/:id/jobs` | `{ type, input, assets? }` create offload job |
| GET | `/api/v1/jobs/:id` | Job status + artifact refs |

### Stub behavior (v1 runners)

- **create machine:** same as current mock store; record `ownerUserId` from API key; status `running`.
- **exec:** append an exec record; return `{ exitCode: 0, stdout, stderr, durationMs }` with deterministic placeholder stdout including the command.
- **files:** in-memory/disk mock tree under machine id; PUT stores, GET returns or `404`.
- **jobs:** create with `status: "queued"` → immediately (or after tiny delay in tests) `succeeded` with placeholder `artifacts[]`. Job `type` is a free string in v1 (e.g. `render`, `export`); no type registry required yet.

Fleet listing for API keys is **scoped to the key’s `userId`**. In the same effort, dashboard browser create/list must use the signed-in WorkOS `userId` so UI and API share one per-user fleet (no shared global mock for authenticated users).

## SDK (`minimachine`)

```ts
import { Minimachine } from "minimachine";

const mm = new Minimachine({
  apiKey: process.env.MINIMACHINE_API_KEY!,
  // baseUrl optional
});

const templates = await mm.templates.list({ query: "python" });
const recs = await mm.templates.recommend("fine-tune a small model");

const machine = await mm.machines.create({
  templateId: "node-ts",
  task: "pnpm build",
});

await mm.machines.exec(machine.id, { cmd: "pnpm build" });
await mm.machines.putFile(machine.id, "src/app.ts", source);
const job = await mm.jobs.create(machine.id, {
  type: "render",
  input: { width: 1920, height: 1080 },
});
const done = await mm.jobs.wait(job.id);
await mm.machines.stop(machine.id);
```

- Throws typed `MinimachineError` with `status`, `code`, `message`.
- `jobs.wait` polls `GET /jobs/:id` until terminal status or timeout.

## MCP

Stdio server bin `minimachine-mcp` tools (all via SDK):

| Tool | Maps to |
|------|---------|
| `list_templates` | `templates.list` |
| `recommend_template` | `templates.recommend` |
| `create_machine` | `machines.create` |
| `list_machines` | `machines.list` |
| `get_machine` | `machines.get` |
| `stop_machine` | `machines.stop` |
| `exec` | `machines.exec` |
| `put_file` / `get_file` | file helpers |
| `create_job` / `get_job` | jobs |

Config example:

```json
{
  "mcpServers": {
    "minimachine": {
      "command": "npx",
      "args": ["-y", "minimachine", "mcp"],
      "env": {
        "MINIMACHINE_API_KEY": "mm_..."
      }
    }
  }
}
```

Exact bin invocation (`minimachine mcp` vs `minimachine-mcp`) is an implementation detail; both may be provided for convenience.

## Dashboard

- Settings (or API keys) section for signed-in users: create (label), list (prefix, created, last used), revoke.
- Copyable secret modal shown once after create.
- Document usage in README / AUTH or a short `packages/minimachine/README.md`.

## Error handling

- Unknown template → `404` `unknown_template`
- Machine not found / not owned → `404` `machine_not_found`
- Job not found / not owned → `404` `job_not_found`
- Invalid body → `400` `validation_error`
- Missing/invalid key → `401` `unauthorized`
- Revoked key → `401` `unauthorized`
- MCP: `isError: true` with message string; no stack traces in tool payloads

## Testing

- Unit: key generate/hash/verify; revoked key rejected
- Unit: v1 route auth + create machine ownership
- Unit: exec/files/jobs stub state transitions
- Unit: SDK request URLs/headers against mocked `fetch`
- Manual: dashboard create key → local `pnpm` SDK script against `http://localhost:3000` → MCP inspector

## Out of scope follow-ups

1. Real provisioner reading template Dockerfiles
2. Interactive display stream for remote GUI
3. Job type registry + GPU resource classes
4. Usage metering / Stripe tie-in for exec minutes and job runs
5. Publish automation (npm trusted publisher / CI)

## Success criteria

- `npm install minimachine` (from workspace/pack for now) can create a machine against the app with an API key.
- MCP tools exercise the same remote API.
- Contract for `exec`, files, and `jobs` is documented and stub-complete so a real runner can replace mocks without breaking the SDK.
