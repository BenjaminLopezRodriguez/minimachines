# @minimachines/mcp

Local stdio MCP server for **offline/dev** against the repo mock store (no network).

For remote agents against https://minimachin.es, prefer the publishable package:

```bash
npm install minimachine
# MINIMACHINE_API_KEY=mm_… npx minimachine-mcp
```

See `packages/minimachine/README.md`.

## Local tools

| Tool | Purpose |
|------|---------|
| `list_templates` | Search/list catalog (`when_to_use` included for LLM choice) |
| `recommend_template` | Rank templates for a task description |
| `create_machine` | Mock-create a machine from `templateId` |
| `list_machines` | Show current mocked fleet |

## Run (local mock)

From the repo root (after `pnpm install`):

```bash
pnpm mcp:dev
```

Catalog source of truth: `templates/manifest.json`. Fleet store: `.data/machines.json`.
