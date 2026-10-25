---
name: agent-pager
description: Page your human when you need them and wait for a reply, using the mm-pager CLI (auto-installed in this minimachine). Use when you are blocked and need a decision, when you finish a task the user was waiting on, or when you reach the goal.
---

# agent-pager

`mm-pager` emails the machine's owner and waits for their reply. Use it
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

## Default behavior

Infer low-risk choices from the project and make a useful first draft. State assumptions briefly instead of asking a setup questionnaire. Page only for a blocking decision, spending money, publishing externally, deleting data, or a credential the human must supply. Ask one concrete question and recommend a default. Never put credentials or private file contents in an email. Replies arrive through the signed reply page linked in the email, not by replying to the email itself. Run `mm-pager wait` and continue with that reply; do not start a second task that could consume the same machine mailbox.
