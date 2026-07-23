# AI Docker Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship searchable AI-optimized Docker templates with LLM-readable metadata, a dashboard Command palette for New machine, and an MCP server that can list/recommend/create mocked machines.

**Architecture:** Manifest-first catalog at `templates/manifest.json`; Dockerfiles per template; shared mock fleet store at `.data/machines.json`; tRPC `machines` router for the UI; stdio MCP in `packages/mcp` reading the same catalog + store helpers.

**Tech Stack:** Next.js App Router, tRPC, Zod, shadcn Command/Dialog, `@modelcontextprotocol/sdk`, pnpm workspace, Dockerfiles.

## Global Constraints

- Manifest shape: `{ "templates": [ ... ] }` with fields from the design spec (including `group`, `when_to_use`, `when_not_to_use`).
- Create status: always `running` immediately.
- Mock store: `.data/machines.json` (gitignored); atomic write.
- No real Docker/K8s provisioning in v1.
- Do not commit unless the user asks (repo rule).

---

## File map

| Path | Responsibility |
|------|----------------|
| `templates/manifest.json` | Catalog source of truth |
| `templates/<id>/Dockerfile` | Image definitions |
| `src/server/data/templates.ts` | Load/search/recommend templates |
| `src/server/data/machines.ts` | Machine type + seed defaults |
| `src/server/data/machine-store.ts` | Read/write `.data/machines.json` + create |
| `src/server/api/routers/machines.ts` | tRPC list/templates/create |
| `packages/mcp/` | MCP server package |
| `src/components/dashboard/new-machine-command.tsx` | Command dialog |
| `src/components/ui/command.tsx` + `dialog.tsx` | shadcn primitives |

---

### Task 1: Catalog + Dockerfiles + template helpers

**Files:**
- Create: `templates/manifest.json`
- Create: `templates/*/Dockerfile` (10 templates)
- Create: `src/server/data/templates.ts`
- Create: `src/server/data/templates.test.ts`
- Modify: `.gitignore` (add `.data/`)

**Interfaces:**
- Produces: `Template`, `loadTemplates()`, `searchTemplates(query)`, `recommendTemplates(task)`, `getTemplate(id)`

- [ ] **Step 1:** Write `templates/manifest.json` with all 10 templates (full LLM fields).
- [ ] **Step 2:** Write Dockerfiles (Debian/language bases, non-root `agent`, `/workspace`).
- [ ] **Step 3:** Implement `templates.ts` + unit tests for search/recommend.
- [ ] **Step 4:** Run `pnpm exec tsx --test src/server/data/templates.test.ts` — expect PASS.

### Task 2: Mock machine store + tRPC

**Files:**
- Modify: `src/server/data/machines.ts` (seed export; add `templateId?`, `dockerfile?`)
- Create: `src/server/data/machine-store.ts`
- Create: `src/server/data/machine-store.test.ts`
- Create: `src/server/api/routers/machines.ts`
- Modify: `src/server/api/root.ts`
- Modify: `src/app/dashboard/page.tsx` (load from store)

**Interfaces:**
- Produces: `listMachines()`, `createMachine({ templateId, name?, task? })`, tRPC `machines.list`, `machines.templates`, `machines.create`

- [ ] **Step 1:** Implement store with seed-from-placeholder + atomic JSON write.
- [ ] **Step 2:** Unit tests for create + unknown template rejection.
- [ ] **Step 3:** Wire tRPC router; dashboard page uses `listMachines()`.
- [ ] **Step 4:** Run store tests — expect PASS.

### Task 3: Command palette UI

**Files:**
- Add shadcn `command` + `dialog` (and deps)
- Create: `src/components/dashboard/new-machine-command.tsx`
- Modify: dashboard page / shell to mount palette
- Modify: `FleetList` to refresh after create (router.refresh or invalidate)

- [ ] **Step 1:** `pnpm dlx shadcn@latest add command dialog`
- [ ] **Step 2:** Build Command dialog: hash `#new`, ⌘K, grouped search, create mutation.
- [ ] **Step 3:** Manual smoke: open New machine → search → create → fleet updates.

### Task 4: MCP package

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `packages/mcp/package.json`, `tsconfig.json`, `src/index.ts`
- Modify: root `package.json` scripts (`mcp:dev`)
- Create: short MCP usage note in `packages/mcp/README.md`

**Interfaces:**
- Tools: `list_templates`, `recommend_template`, `create_machine`, `list_machines`

- [ ] **Step 1:** Workspace + MCP package depending on `@modelcontextprotocol/sdk` + `zod`.
- [ ] **Step 2:** Implement tools calling shared catalog/store (via path into `src/server/data` or duplicated thin wrappers that read the same JSON files — prefer importing TS helpers with tsx).
- [ ] **Step 3:** Smoke with `pnpm mcp:dev` / MCP inspector if available.

### Task 5: Verify

- [ ] `pnpm check` (lint + typecheck)
- [ ] Fix any failures
- [ ] Summarize for user (no commit unless asked)
