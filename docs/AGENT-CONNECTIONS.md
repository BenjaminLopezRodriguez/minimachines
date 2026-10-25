# Agent accounts and email baton

Users choose Claude Code or Codex in Bot settings. A running owned workspace is reused by default; otherwise Create agent workspace starts the corresponding devbox with the official CLI installed. Additional name, instructions and workspace choices are optional. The user's unsent chat draft stays in place during connection.

Sign-in runs directly in the VM terminal: `claude auth login` or `codex login --device-auth`. The user completes the provider's official browser flow. No local credential file upload, token-paste form, password proxy, or account credential is stored in the minimachines database. Check connection returns only installed/connected booleans; disconnect invokes the official logout. Account eligibility and usage limits are controlled by the provider. Codex device auth can require enabling it in account/workspace settings.

Credentials belong to that VM. They are not a portable account vault; replacing/stopping an ephemeral VM can require sign-in again. Do not share its terminal URL or authorize strangers' machines. Auth status commands support current CLI versions; older existing VMs may need updating. Newly built devboxes include the CLI.

## What works where

Bot conversations use the existing restricted CLI adapter, with files and shell tools disabled. A connected coding agent can work on projects in its VM terminal, using its native tools. This change does not turn chat into an autonomous background job scheduler or silently grant chat filesystem access.

Both agents receive the `agent-pager` skill in newly provisioned machines. Ask the coding agent:

> Work on this project. Infer reversible defaults and show a useful draft. For a blocking decision or before publishing, spending money or deleting data, ask one question with `mm-pager notify question "…"`, then run `mm-pager wait`. Continue when the reply arrives. Use `mm-pager notify succeeded "…"` when done. Never include secrets in notifications.

The verified WorkOS account address becomes the default email contact on sign-in and connection check. Existing explicit contacts are preserved. The server needs `RESEND_API_KEY`, `PAGER_FROM_EMAIL` (a verified sender), and the correct `APP_BASE_URL`. Missing configuration is reported as a delivery failure rather than successful notification. Emails contain a 30-minute, single-use reply link. Respond on that web page; inbound email replies are not parsed. Replies and consumption are committed atomically; concurrent clicks cannot deliver duplicates. The waiting agent reads the machine mailbox and continues. Use one waiting agent per machine; mailbox routing is machine-scoped, not per conversation.

Notification requests are capped at 20 per account per fixed hour, in addition to API write limits. The existing optional push channel remains compatible; email is the default contact.

## Release verification

Before admitting testers: migrate the beta tables, configure operator IDs and email delivery, create a VM, sign in to each provider with a real eligible account, check its status, run one real prompt, send a baton question, answer its email link, and verify the agent continues. Then test logout and VM replacement. CI tests do not authorize a paid provider account or send live email. Do not claim the live-account and mail-provider checks passed until a human has completed them.

Sources: [Codex authentication](https://learn.chatgpt.com/docs/auth), [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference).
