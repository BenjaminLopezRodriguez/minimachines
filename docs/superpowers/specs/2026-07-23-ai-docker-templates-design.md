# AI-optimized Docker templates — Design

**Date:** 2026-07-23  
**Status:** Approved for planning  
**Repo:** minimachines

## Goal

Ship a searchable catalog of Docker templates tuned for coding-agent workloads, with LLM-readable descriptions so:

1. Humans pick a template via a Command palette after **New machine**.
2. Agents pick (and create) via MCP using the same catalog metadata.

Provisioning stays **mocked** in v1 — Dockerfiles and create APIs are real enough to wire later to Docker/Kubernetes.

## Non-goals (v1)

- Real cluster provisioning, image builds, or registry push
- Embedding-based recommendation
- Prominent template marketplace UI / gallery cards
- Baking API secrets or licensed agent binaries that cannot be installed cleanly at runtime

## Architecture

```
templates/
  manifest.json                 # single source of truth
  <template-id>/Dockerfile
packages/mcp/                   # stdio MCP server
src/server/data/templates.ts    # typed loader + search helpers
src/server/data/machines.ts     # fleet + mocked create (shared store)
src/components/dashboard/
  new-machine-command.tsx       # shadcn Command dialog
```

**Data flow**

- Catalog: `manifest.json` → `templates.ts` → Command UI + MCP tools.
- Create: Command or `create_machine` → mock store → dashboard fleet reads same store.
- Dockerfile path is recorded on created machines for a future provisioner.

Introduce a minimal pnpm workspace with `packages/mcp` so the MCP package reads the same `templates/manifest.json` (path relative to repo root) without duplicating the catalog.

## Manifest schema

`templates/manifest.json` shape: `{ "templates": [ ... ] }` where each entry is:

| Field | Type | Purpose |
|-------|------|---------|
| `id` | string | Stable slug (`node-ts`, `claude-devbox`) |
| `name` | string | Short human label |
| `group` | `"stacks" \| "agents" \| "general"` | Command palette section |
| `summary` | string | 1–2 sentences for Command results |
| `when_to_use` | string | Longer “use this when…” prose for agents |
| `when_not_to_use` | string | Optional; reduce wrong picks |
| `tags` | string[] | Search keywords |
| `stacks` | string[] | Runtime families (`node`, `python`, …) |
| `agents` | string[] | Tuned-for (`claude`, `codex`, `any`, …) |
| `resources` | `{ cpu: number, memoryGb: number }` | Suggested size |
| `dockerfile` | string | Path relative to `templates/` |
| `status` | `"ready" \| "preview"` | Availability flag |

**Search (UI + MCP):** case-insensitive match over `name`, `summary`, `tags`, `stacks`, `agents`, `when_to_use`.

**Recommend (MCP v1):** keyword overlap score against task text; return ranked list with short reasons drawn from `when_to_use`. No embeddings.

## Initial template set

Combine stack, general, and agent-branded images (searchable, not gallery-first):

| id | Group | Intent |
|----|-------|--------|
| `node-ts` | Stacks | Node 22 + TypeScript/pnpm toolchain |
| `python` | Stacks | Python 3.12 + uv/pip, pytest |
| `fullstack-web` | Stacks | Node + common web CLIs (Next-friendly) |
| `data-ml` | Stacks | Python + notebook/ML basics |
| `agent-shell` | General | Minimal shell + git/curl for any agent |
| `claude-devbox` | Agent boxes | Tuned for Claude Code / Anthropic agent loops |
| `codex-devbox` | Agent boxes | Tuned for Codex-style workflows |
| `cursor-workspace` | Agent boxes | Tuned for Cursor remote/agent use |
| `grok-bench` | Agent boxes | Tuned for Grok / xAI-oriented loops |
| `gemini-devbox` | Agent boxes | Tuned for Gemini CLI / Google agent use |

## Dockerfile conventions

- Base: Debian/Ubuntu slim or official language images.
- Preinstall: `git`, `curl`, `ca-certificates`, language toolchain for that template.
- Non-root user `agent`, workspace `/workspace`.
- Agent-branded images: install or stub common CLIs/config **only when license-friendly**; document runtime install steps in comments / `when_to_use` when binaries cannot ship in-image.
- No secrets in layers. Prefer build args only for public versions.
- Keep images lean enough for fast local `docker build` smoke tests.

## MCP server (`packages/mcp`)

Stdio MCP server agents add to Claude/Cursor/etc.

| Tool | Input | Behavior |
|------|-------|----------|
| `list_templates` | optional `query` | Filtered catalog rows (id, name, summary, tags, stacks, agents, resources, status) |
| `recommend_template` | required `task` | Ranked matches + short reasons |
| `create_machine` | required `templateId`; optional `name`, `task` | Mock create; return machine record |
| `list_machines` | — | Current mocked fleet |

**Errors:** unknown `templateId` → clear error. `preview` templates allowed; response includes `status: "preview"`.

**Create (v1):** persist to `.data/machines.json` (gitignored), seeded from the current placeholder fleet on first read. Record `templateId` + `dockerfile` on the machine. New machines are created with `status: "running"` immediately (UI and MCP stay consistent).

## Dashboard UI

- Existing **New machine** links target `/dashboard#new` (sidebar + mobile drawer).
- Client component listens for hash `#new`, opens Command dialog, clears hash.
- Dashboard shortcut: `⌘K` / `Ctrl+K` also opens the same dialog.
- shadcn **Command** dialog (not a card gallery):
  - Search filters catalog.
  - Groups: Stacks / Agent boxes / General.
  - Item: `name` + one-line `summary`.
  - Select → mocked create → close → fleet refresh.
  - Empty: “No templates match”.
- Success: brief toast or status text; fleet list updates from shared store.

Wire create through a tRPC mutation (`machines.create`) so the browser never writes the filesystem mock store directly. MCP `create_machine` calls the same store helper used by that mutation.

## Error handling

- Invalid / missing template id → user-visible error in Command; MCP tool error payload.
- Corrupt / missing manifest → fail fast at load with a clear message (dev) rather than empty silent catalog.
- Concurrent creates: append-safe writes to mock store (read-modify-write with simple file lock or rewrite-atomic temp file).

## Testing

- Unit: search/recommend scoring against fixture manifest.
- Unit: create_machine rejects unknown ids; writes expected machine shape.
- Manual: open `#new`, search `python`, create, see fleet row; MCP `list_templates` / `recommend_template` / `create_machine` via inspector or CLI.
- Optional: `docker build` smoke for one stack + one agent image in CI later (not required for first merge).

## Out of scope follow-ups

- Real provisioner reading `dockerfile` / pushing images
- Embedding recommend
- Public VM marketplace page on the marketing site
- Auth-scoped per-user fleets in Postgres
