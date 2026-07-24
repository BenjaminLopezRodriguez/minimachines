---
name: minimachine
description: Provision and drive minimachines (remote dev VMs) from an agent via the CLI or the /api/v1 HTTP API.
---

# minimachine

Provision and control minimachines — remote dev VMs — on behalf of the user.

## Authenticate

- Prefer the device flow: run `minimachines login`. It opens a browser, the
  user approves, and the key is saved to `~/.config/minimachines/credentials.json`.
  **Do not ask the user to paste an API key into the chat.**
- Base URL for all HTTP calls: `https://www.minimachin.es`
  (use the `www` host — the apex `308`-redirects to it, and clients following
  that cross-host hop drop the `Authorization` header, so the call lands
  unauthenticated).
- If you must call the API directly, read the key from the credentials file
  or the `MINIMACHINE_API_KEY` env var and send it as `Authorization: Bearer mm_…`.
- `MINIMACHINE_API_KEY` **overrides** the logged-in key when set. If `whoami`
  reports an identity you did not expect, check the env var before re-running
  `login` — a stale export silently wins over the credentials file.

Requires CLI **v0.1.2+**. `login` / `logout` / `whoami` do not exist in 0.1.1
and earlier, where they print usage and exit 1; check `pnpm add -g
@minimachines/cli@latest` if they are missing.

## Create and list machines

Use the CLI, or the HTTP API with a Bearer `mm_` key.

```bash
# create — templateId is REQUIRED (e.g. node-ts, python, agent-shell)
curl -X POST https://www.minimachin.es/api/v1/machines \
  -H "Authorization: Bearer mm_…" \
  -H "Content-Type: application/json" \
  -d '{"templateId":"node-ts"}'

# list
curl https://www.minimachin.es/api/v1/machines \
  -H "Authorization: Bearer mm_…"
```

The user can also create machines from the dashboard **New machine** action.

## Run and operate

- `minimachines run <id>` opens an interactive console. Use this when a human
  is present. The machine must not be `stopped` or `error` — `run` exits 1 on
  those rather than starting it for you.
  - `--keep-awake` (macOS) caffeinates the Mac for the length of the session.
  - `--lid-closed` (macOS) also allows lid-shut + low-power operation. Uses
    `sudo` and restores the user's settings on exit — say so before running it.
- For non-interactive / scripted work, use the HTTP API:
  - Serve an app on **port 3000** inside the box — the machine's `appUrl`
    (in the machine JSON) is its public URL.
  - Exec a command: `POST /api/v1/machines/<id>/exec`
  - Read/write files: the files API under `/api/v1/machines/<id>/files`

## Safety

- **Never print full API keys** in output, logs, or chat.
- Use `minimachines whoami` to confirm the active identity — it shows only the
  key prefix (`mm_…`), never the full secret.
- When you finish and the session was temporary, suggest `minimachines logout`
  to clear the saved credentials.
