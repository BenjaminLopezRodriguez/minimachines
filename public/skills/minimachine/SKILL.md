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
  (use the `www` host — the apex domain drops the `Authorization` header).
- If you must call the API directly, read the key from the credentials file
  or the `MINIMACHINE_API_KEY` env var and send it as `Authorization: Bearer mm_…`.

## Create and list machines

Use the CLI, or the HTTP API with a Bearer `mm_` key.

```bash
# create
curl -X POST https://www.minimachin.es/api/v1/machines \
  -H "Authorization: Bearer mm_…"

# list
curl https://www.minimachin.es/api/v1/machines \
  -H "Authorization: Bearer mm_…"
```

The user can also create machines from the dashboard **New machine** action.

## Run and operate

- `minimachines run <id>` opens an interactive console. Use this when a human
  is present.
- For non-interactive / scripted work, use the HTTP API:
  - Exec a command: `POST /api/v1/machines/<id>/exec`
  - Read/write files: the files API under `/api/v1/machines/<id>/files`

## Safety

- **Never print full API keys** in output, logs, or chat.
- Use `minimachines whoami` to confirm the active identity — it shows only the
  key prefix (`mm_…`), never the full secret.
- When you finish and the session was temporary, suggest `minimachines logout`
  to clear the saved credentials.
