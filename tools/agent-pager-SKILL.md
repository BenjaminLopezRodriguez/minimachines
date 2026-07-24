---
name: agent-pager
description: Page your human when you need them and wait for a reply, using the mm-pager CLI (auto-installed in this minimachine). Use when you are blocked and need a decision, when you finish a task the user was waiting on, or when you reach the goal.
---

# agent-pager

`mm-pager` texts/emails the machine's owner and waits for their reply. Use it
only for the three moments below — never for routine status. No page spam.

## Rules

- **Blocked / need a decision:**
  `mm-pager notify question "<the exact question>"` then `mm-pager wait`.
  Stdout of `wait` is the human's reply — act on it. (`wait` exits 2 on
  timeout; run it again to keep waiting.)
- **Finished an awaited task:** `mm-pager notify finished "<what's done>"`.
- **Reached the goal:** `mm-pager notify succeeded "<result>"`.

Only page for these. Routine progress stays in the console.

## Optional auto-page

`mm-pager on` arms a Stop hook that auto-pages `finished` and waits after every
turn; `mm-pager off` disarms. Leave it off unless the user asks — explicit
`notify` calls keep pages meaningful.
