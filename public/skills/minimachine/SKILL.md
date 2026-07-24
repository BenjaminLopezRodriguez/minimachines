---
name: minimachine
description: Provision and drive minimachines (remote dev VMs) from an agent. Use whenever the user asks you to build, run, test, host, or ship something — offload it to a VM and keep working end-to-end, paging the user on their phone (mm-pager this lives in the vm you spin up) instead of stopping to ask. Covers CLI login, the /api/v1 HTTP API, exec/files, ports/appUrl, sharing, and the pager loop.
---

# minimachine

Remote dev VMs you drive on the user's behalf. When this skill is active, a
minimachine is your **default place to build and run things** — off the user's
laptop — and you keep going autonomously, interrupting the user only when a
choice is genuinely theirs, via the pager rather than by halting.

## Posture — run autonomously

- **Offload by default.** For any build / install / dev-server / test / host
  task, do it on a minimachine. Don't run heavy work locally, and don't ask
  "should I use a VM?" — that's the whole point of this tool.
- **Drive end to end.** create → write files → install/build/run → hand back a
  live URL. Don't stop after each API call to ask permission to continue.
- **Default, don't stall.** Pick a template, use port 3000, prefer the simplest
  choice (e.g. in-memory over a DB for a quick app). Only escalate a decision
  that's irreversible or a real user preference — and escalate through the
  pager (below), not by stopping in the chat.
- **Deliver a link, not "it's running."** A server on port 3000 is public at
  the machine's `appUrl`.

## Authenticate

- Device flow: run `minimachines login` — opens a browser, the user approves,
  key saved to `~/.config/minimachines/credentials.json`. **Never ask the user
  to paste a key into the chat.**
- Base URL: `https://www.minimachin.es` (the `www` host — the apex `308`s to it
  and the redirect drops the `Authorization` header).
- Direct API calls: read the key from the credentials file or
  `MINIMACHINE_API_KEY` and send `Authorization: Bearer mm_…`.
  `MINIMACHINE_API_KEY` **overrides** the logged-in key — if `whoami` shows an
  unexpected identity, check that env var. Requires CLI **v0.1.2+**.

## Offload loop (HTTP API)

Base `https://www.minimachin.es`, header `Authorization: Bearer mm_…`.

1. **Create** — `POST /api/v1/machines` body `{"templateId":"node-ts"}`
   (templateId is REQUIRED: `node-ts`, `python`, `agent-shell`, `claude-devbox`,
   …; or `POST /api/v1/templates/recommend`). Save the returned `id` and `appUrl`.
2. **Write files** — `POST /api/v1/machines/<id>/exec` (e.g. base64-decode into
   place) or the files API `/api/v1/machines/<id>/files`.
3. **Run long work in the background** so exec returns instead of hanging:
   `cd /workspace/app && (nohup sh -c "npm install && npm run dev -- -H 0.0.0.0 -p 3000" >/tmp/dev.log 2>&1 &)`.
4. **Poll readiness** — exec `curl -s -o /dev/null -w %{http_code} localhost:3000`
   until it returns `200` (tail `/tmp/dev.log` if it doesn't).
5. **Hand back `appUrl`.**

Exec runs as user `agent` under `/workspace` on **every** template. Bind servers
to `0.0.0.0` so the tunnel reaches them. Ports **3000–3009** are exposed.

## Check in without blocking — mm-pager

Every machine has `mm-pager` preinstalled. Instead of stopping and waiting in the
chat, page the user so they can step away from their terminal:

- **Decision that's theirs:** exec `mm-pager notify question "<the choice>"`,
  then exec `mm-pager wait --timeout 60` (re-run if it times out) and act on the
  reply.
- **Done / goal reached:** exec `mm-pager notify finished "<what>"` or
  `mm-pager notify succeeded "<url>"`.

Pages only reach the user if they've set a contact — `mm pager set --email …`
or enrolled push at `/pager`. If none is set and you truly need input, ask once
in the chat and continue after.

## Share the result

- `appUrl` is already public — hand it over.
- Branded link: `mm share create --machine <id> --port 3000 --web` →
  `https://<slug>.minimachin.es` (`--gated --secret <pw>` to password-protect;
  `mm share ls` / `mm share rm <slug>`).

## Operate & safety

- `minimachines run <id>` opens the browser console for a present human (machine
  must not be `stopped`/`error`). `--keep-awake` / `--lid-closed` (macOS) keep the
  Mac awake for a long session; `--lid-closed` uses `sudo` — say so first.
- Stop a temporary machine: `POST /api/v1/machines/<id>/stop`.
- **Never print full API keys.** `whoami` shows only the `mm_…` prefix. Suggest
  `minimachines logout` when a temporary session ends.
