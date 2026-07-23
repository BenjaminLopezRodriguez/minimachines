# minimachine

TypeScript SDK + MCP server for [minimachin.es](https://minimachin.es).

Agents use this to create template-based machine sessions, run commands, sync files, and submit offload jobs (e.g. render). v1 runners are mocked; the HTTP contract is stable for a real provisioner.

## Install

```bash
npm install minimachine
# or
pnpm add minimachine
```

## SDK

```ts
import { Minimachine } from "minimachine";

const mm = new Minimachine({
  apiKey: process.env.MINIMACHINE_API_KEY!,
  // baseUrl: "http://localhost:3000", // optional
});

const machine = await mm.machines.create({
  templateId: "node-ts",
  task: "pnpm build",
});

await mm.machines.exec(machine.id, { cmd: "pnpm build" });
await mm.machines.putFile(machine.id, "src/app.ts", "export {}");

const job = await mm.jobs.create(machine.id, {
  type: "render",
  input: { width: 1920, height: 1080 },
});
await mm.jobs.wait(job.id);
await mm.machines.stop(machine.id);
```

## Env

| Variable | Required | Default |
|----------|----------|---------|
| `MINIMACHINE_API_KEY` | yes | — |
| `MINIMACHINE_BASE_URL` | no | `https://minimachin.es` |

Create keys in the dashboard: **API keys**.

## MCP

```json
{
  "mcpServers": {
    "minimachine": {
      "command": "npx",
      "args": ["-y", "minimachine-mcp"],
      "env": {
        "MINIMACHINE_API_KEY": "mm_…",
        "MINIMACHINE_BASE_URL": "https://minimachin.es"
      }
    }
  }
}
```

From this monorepo (dev):

```bash
pnpm minimachine:mcp
```

Tools: `list_templates`, `recommend_template`, `create_machine`, `list_machines`, `get_machine`, `stop_machine`, `exec`, `put_file`, `get_file`, `create_job`, `get_job`.
