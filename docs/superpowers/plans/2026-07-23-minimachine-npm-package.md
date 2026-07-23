# `minimachine` npm package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a publishable `minimachine` package (SDK + MCP) and `/api/v1` REST surface with API-key auth so agents can create sessions, exec, files, and jobs against minimachin.es (mocked runners).

**Architecture:** File-backed API keys + per-user machine/session store (same persistence model as today’s fleet mock). Next.js App Router handlers under `/api/v1`. Published workspace package `packages/minimachine` calling that API. Dashboard UI to mint/revoke keys. tRPC dashboard create/list scoped to WorkOS user id.

**Tech Stack:** Next.js 15 App Router, Zod, `node:crypto` (scrypt/sha256 for keys), `@modelcontextprotocol/sdk`, pnpm workspace, `node:test` via `tsx --test`.

## Global Constraints

- Package publish name: `minimachine`
- API key prefix: `mm_`
- Default base URL: `https://minimachin.es`
- Env: `MINIMACHINE_API_KEY`, optional `MINIMACHINE_BASE_URL`
- Runners mocked; stable JSON error shape `{ error: { code, message } }`
- Do not commit unless the user asks (repo rule)
- Prefer `tsx --test` for unit tests

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/server/data/api-keys.ts` | Create/list/revoke/verify API keys (hash only) |
| `src/server/data/api-keys.test.ts` | Key crypto + revoke tests |
| `src/server/data/machines.ts` | Add `ownerUserId?` on Machine |
| `src/server/data/machine-store.ts` | Owner scoping + stop + stub exec/files/jobs |
| `src/server/data/machine-session.test.ts` | Exec/files/jobs stubs |
| `src/server/api/v1/auth.ts` | Bearer → userId helper |
| `src/server/api/v1/respond.ts` | JSON ok/error helpers |
| `src/app/api/v1/**/route.ts` | REST endpoints |
| `src/middleware.ts` | Allow `/api/v1` without cookie auth |
| `src/server/api/routers/machines.ts` | Pass `ownerUserId` from session |
| `src/server/api/trpc.ts` | Attach WorkOS user to context when present |
| `src/components/dashboard/api-keys-panel.tsx` | Create/list/revoke UI |
| `src/app/dashboard/settings/page.tsx` | Settings page hosting keys panel |
| `packages/minimachine/**` | SDK + MCP + README |
| `package.json` / `pnpm-workspace.yaml` | Workspace scripts |

---

### Task 1: API key store

**Files:**
- Create: `src/server/data/api-keys.ts`
- Create: `src/server/data/api-keys.test.ts`

**Interfaces:**
- Produces:
  - `createApiKey({ userId, label? }, root?) → { key: ApiKeyRecord, secret: string }`
  - `listApiKeys(userId, root?) → ApiKeyPublic[]`
  - `revokeApiKey({ userId, id }, root?) → boolean`
  - `verifyApiKey(secret, root?) → { userId, keyId } | null`
  - Types: `ApiKeyRecord` (includes hash), `ApiKeyPublic` (no hash)

- [ ] **Step 1: Write failing tests**

```ts
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  verifyApiKey,
} from "./api-keys";

void test("create returns mm_ secret and verifies", () => {
  const root = mkdtempSync(join(tmpdir(), "mm-keys-"));
  try {
    const { secret, key } = createApiKey({ userId: "user_1", label: "cli" }, root);
    assert.match(secret, /^mm_/);
    assert.equal(listApiKeys("user_1", root).length, 1);
    assert.equal(verifyApiKey(secret, root)?.userId, "user_1");
    assert.ok(key.keyPrefix.length > 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test("revoked key fails verify", () => {
  const root = mkdtempSync(join(tmpdir(), "mm-keys-"));
  try {
    const { secret, key } = createApiKey({ userId: "user_1" }, root);
    assert.equal(revokeApiKey({ userId: "user_1", id: key.id }, root), true);
    assert.equal(verifyApiKey(secret, root), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `pnpm exec tsx --test src/server/data/api-keys.test.ts`

- [ ] **Step 3: Implement `api-keys.ts`**

Persist `.data/api-keys.json` (same atomic write pattern as `machine-store`). Secret = `mm_` + 32 bytes hex. Store `sha256(secret)` as `keyHash`. Never return hash from list.

- [ ] **Step 4: Run tests — expect PASS**

---

### Task 2: Session stubs (owner, stop, exec, files, jobs)

**Files:**
- Modify: `src/server/data/machines.ts` — add `ownerUserId?: string`
- Modify: `src/server/data/machine-store.ts`
- Create: `src/server/data/machine-session.test.ts`

**Interfaces:**
- Consumes: existing `createMachine` / `listMachines`
- Produces:
  - `createMachine({ ..., ownerUserId? })`
  - `listMachines({ ownerUserId? }, root?)` overload or options bag
  - `getMachine(id, { ownerUserId? }, root?)`
  - `stopMachine(id, { ownerUserId? }, root?)`
  - `execMachine(id, { cmd, cwd?, env? }, { ownerUserId? }, root?) → ExecResult`
  - `putMachineFile` / `getMachineFile`
  - `createJob` / `getJob` / `listJobs`
  - Types: `ExecResult`, `Job` (`id`, `machineId`, `ownerUserId`, `type`, `status`, `input`, `artifacts`, `createdAt`, `updatedAt`)

Keep persistence under `.data/` (machines.json + sessions.json or embed session maps in machines store file). Prefer single `.data/sessions.json` for exec logs, files index, and jobs keyed by machine/job id.

- [ ] **Step 1: Write tests** for owner scoping, stop, exec stub, file put/get, job create→succeeded
- [ ] **Step 2: Implement store extensions**
- [ ] **Step 3: Run `pnpm exec tsx --test src/server/data/machine-session.test.ts` — PASS**

---

### Task 3: REST `/api/v1` + middleware

**Files:**
- Create: `src/server/api/v1/auth.ts`, `respond.ts`
- Create routes under `src/app/api/v1/`:
  - `templates/route.ts`
  - `templates/recommend/route.ts`
  - `machines/route.ts`
  - `machines/[id]/route.ts`
  - `machines/[id]/stop/route.ts`
  - `machines/[id]/exec/route.ts`
  - `machines/[id]/files/[...path]/route.ts`
  - `machines/[id]/jobs/route.ts`
  - `jobs/[id]/route.ts`
- Modify: `src/middleware.ts` — add `/api/v1/:path*` to matcher + `unauthenticatedPaths` (API key handles auth)

**Interfaces:**
- `requireApiKey(request) → { userId, keyId } | NextResponse(401)`
- `jsonOk(data, status?)`, `jsonError(code, message, status)`

- [ ] **Step 1: Implement auth + respond helpers**
- [ ] **Step 2: Implement all route handlers with Zod validation**
- [ ] **Step 3: Manual curl smoke with a created key (after Task 4) or unit-test handlers via imported helpers**

---

### Task 4: Dashboard API keys + per-user tRPC

**Files:**
- Create: `src/components/dashboard/api-keys-panel.tsx`
- Create: `src/app/dashboard/settings/page.tsx`
- Create: `src/server/api/routers/apiKeys.ts` (or server actions)
- Modify: `src/server/api/trpc.ts` — resolve WorkOS user into context when cookie present
- Modify: `src/server/api/routers/machines.ts` — filter/create with `ctx.userId`
- Modify: `src/components/dashboard/shell.tsx` — link to Settings
- Modify: `src/middleware.ts` — protect `/dashboard/settings`

Prefer tRPC `apiKeys.create|list|revoke` with `protectedProcedure` that requires `ctx.userId`.

- [ ] **Step 1: Add auth to tRPC context via `withAuth` / headers cookie path used by RSC**
- [ ] **Step 2: apiKeys router + settings page UI (show secret once)**
- [ ] **Step 3: Scope machines router to userId**

---

### Task 5: Publishable `packages/minimachine`

**Files:**
- Create: `packages/minimachine/package.json` (`name: "minimachine"`, bin `minimachine-mcp`)
- Create: `packages/minimachine/tsconfig.json`
- Create: `packages/minimachine/src/client.ts`
- Create: `packages/minimachine/src/errors.ts`
- Create: `packages/minimachine/src/mcp.ts`
- Create: `packages/minimachine/src/index.ts`
- Create: `packages/minimachine/src/client.test.ts`
- Create: `packages/minimachine/README.md`
- Modify: root `package.json` scripts (`minimachine:mcp`)

**Interfaces:**
```ts
class Minimachine {
  constructor(opts: { apiKey: string; baseUrl?: string; fetch?: typeof fetch })
  templates: { list(opts?: { query?: string }); recommend(task: string) }
  machines: {
    create(input); list(); get(id); stop(id);
    exec(id, { cmd, cwd?, env? });
    putFile(id, path, content: string | Uint8Array);
    getFile(id, path): Promise<Uint8Array>;
  }
  jobs: { create(machineId, { type, input, assets? }); get(id); wait(id, opts?: { timeoutMs?, intervalMs? }) }
}
```

- [ ] **Step 1: SDK + error type + fetch mock tests**
- [ ] **Step 2: MCP tools wrapping SDK**
- [ ] **Step 3: README with env + Cursor config**
- [ ] **Step 4: `pnpm install` in workspace; run client tests — PASS**

---

### Task 6: Verify

- [ ] `pnpm exec tsx --test src/server/data/api-keys.test.ts src/server/data/machine-session.test.ts packages/minimachine/src/client.test.ts`
- [ ] `pnpm typecheck` (root; package if configured)
- [ ] Smoke: create key in settings → SDK against `http://localhost:3000`

---

## Spec coverage check

| Spec item | Task |
|-----------|------|
| API keys `mm_` + hash | 1 |
| Per-user fleet | 2, 4 |
| REST `/api/v1` endpoints | 3 |
| exec/files/jobs stubs | 2, 3 |
| SDK + MCP | 5 |
| Dashboard key UI | 4 |
| Middleware allowlist | 3 |
| Display/real provisioner | out of scope |
