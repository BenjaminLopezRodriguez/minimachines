# Agent Pager — companion app (feature spec)

**Date:** 2026-07-23
**Status:** Idea captured — not scheduled. Saved at user request.
**Discipline:** `/plan` `/ponytail` `/backend-check`

## One-liner

A phone-first companion that **texts you when your agent needs you**, and gives
you a one-tap link to **talk back**. It rides on top of minimachines (VM) or the
CLI — it does not replace the dashboard.

## What it does (exactly two things)

1. **Notify by SMS.** Text the user's phone number when the agent:
   - has a **question** (blocked, needs a decision),
   - **finishes a task** the user was waiting on,
   - **succeeds** (goal reached).
   Nothing else. No status spam.

2. **Link to talk back.** Every text contains a link. The link opens a minimal
   page with exactly three controls:
   - **Whisperflow voice input** — hold-to-talk, speech → text to the agent.
   - **Intelligence dial** — pick the model/effort tier for the reply.
   - **Text input box** — type instead of talk.
   That's the whole surface. Send → routed to the agent (VM session or CLI).

## Non-goals (v1)

- No full chat history UI (the link is a reply surface, not an inbox).
- No account system of its own — reuse minimachines auth / the machine's owner.
- No push notifications / native app — SMS + a web link only.
- No multi-agent fan-out — one machine/agent per number to start.

## How it hangs off what exists

- **Trigger source:** the agent (in the VM sandbox, or the CLI) signals an
  event. Simplest: a new event type the agent emits, e.g.
  `POST /api/v1/machines/<id>/notify { kind: "question"|"finished"|"succeeded", text }`
  (Bearer API key — the machine already has one via device login).
- **SMS out:** a provider (Twilio / Vercel-friendly). Send on notify. The
  message body = short summary + the reply link.
- **Reply link:** `https://www.minimachin.es/m/<token>` — a signed, expiring
  token bound to (machine, user, event). Opens the 3-control page.
- **Reply in:** the page posts voice-transcript / text back to the agent via
  the same machine session (exec / a message queue the agent polls).
- **Intelligence dial:** maps to model/effort passed with the reply (the agent
  picks up the tier for its next step).

## Open questions (resolve at plan time)

- Where does the agent's "question" originate — does Claude Code inside the
  sandbox expose a hook we can catch, or does the CLI wrap the run and detect
  a prompt? (Determines the trigger integration.)
- Whisperflow: hosted STT vs on-device Web Speech API (ponytail: Web Speech
  API first — zero backend, browser-native).
- Reply delivery to a *running* agent: does the agent poll a mailbox, or do we
  inject via `execMachine`? A mailbox table the agent polls is the clean shape.
- Phone number storage + verification (SMS opt-in / STOP compliance).

## Ponytail read

- Web Speech API for voice → no STT backend in v1.
- One SMS provider, one `notify` endpoint, one signed reply link, one mailbox
  table. Resist building an inbox, presence, or a second auth system.
- Reuse the machine's existing `mm_` key + `ownerUserId` scoping.

## Backend-check checklist (when built)

- `notify` endpoint auths by Bearer key, scoped to the machine's owner.
- Reply token is signed + single-use + expiring; can't be replayed.
- SMS send failures don't lose the event (retry / log).
- Reply reaches the agent and the agent actually consumes it (end-to-end, not
  just stored).
