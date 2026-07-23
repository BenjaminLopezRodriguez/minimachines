# @minimachines/cli

Attach to a [minimachin.es](https://minimachin.es) machine console from your terminal.

## Install / run

```bash
pnpm dlx @minimachines/cli run vm_…
# or
npx @minimachines/cli run vm_…
```

## Auth

```bash
export MINIMACHINE_API_KEY=mm_…   # Dashboard → API keys
# optional
export MINIMACHINE_BASE_URL=https://minimachin.es
```

## Commands

| Command | What it does |
|---------|----------------|
| `run <machineId>` | Fetch the machine and open its ttyd console in the browser |
| `agent run <machineId>` | Same as `run` (dashboard “agent” preset) |

Bins: `minimachines`, `mm`.
