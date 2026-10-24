# Git workspace and Bots

The Git workspace lives at `/dashboard/git`. Bots is a separate product surface at `/bots`, linked from the dashboard. Both use the existing WorkOS account and owner-scoped machine access.

## Research and product decisions

Research reviewed 10 Exa results across Cursor and Git, plus official CLI documentation for the conversation runtime.

- [Cursor Origin](https://cursor.com/docs/origin) is a Git forge with repositories, standard Git transport, code browsing, GitHub mirroring and pull requests. This implementation brings repository selection, cloning, branches, history, diffs and remote sync into the machine dashboard. It operates existing machine repositories and remote hosts; it does not introduce a new hosted forge, GitHub mirror service or pull request server.
- [Cursor checkpoints](https://cursor.com/docs/agent/overview) are temporary recovery points separate from normal Git history. Here, checkpoint objects live under `refs/minimachines/checkpoints/`, leaving HEAD and the real index unchanged when captured. Git objects give us native file modes, binary content and symlink handling.
- [Native Git stashes](https://git-scm.com/docs/git-stash) retain staged and working changes. Dashboard stash includes untracked files, excludes ignored files and applies with `--index`. Apply retains the stash; drop preserves its object under a recovery reference.
- [Claude Code programmatic mode](https://code.claude.com/docs/en/headless) and [CLI reference](https://code.claude.com/docs/en/cli-reference) provide noninteractive JSON replies with the existing account. Built-in tools are disabled, MCP tools are denied, MCP configuration is empty and user/project settings are excluded.
- [Codex noninteractive mode](https://learn.chatgpt.com/docs/non-interactive-mode) reuses saved CLI authentication. Bots uses ephemeral JSON output, an empty temporary working directory, read-only mode, disabled shell tools and web search, and ignores user configuration and rules. See the [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).

## Git behavior

- Commands run as `agent` in the owned sandbox. Git and Python 3 must be installed. Stopped or simulated machines return a setup error.
- Repository and metadata paths must resolve under `/workspace`. User input is JSON and subprocess arguments; file pathspecs are literal. HTTPS URLs cannot contain credentials; local and external-command transport protocols are disabled.
- Checkpoints record working files, the staging tree, the base HEAD, a label and agent attribution. They include nonignored untracked files. Capturing conflicts is rejected.
- Restore first captures a recovery checkpoint, then restores the working files and staging tree. Branch history and chat history remain unchanged. Restore is rejected after HEAD changes; return to the original commit first.
- Stash apply can produce native Git conflicts. Resolve these in the machine console. The dashboard refreshes after failures so conflicts are visible.
- Pull uses `--ff-only`; push never forces. The first push sets upstream on `origin` if necessary. Existing CLI Git credentials stay on the machine.
- Git operations are serialized per repository with a nonblocking file lock. External terminal operations still require normal coordination.
- Diffs are capped at 250 KB; lists show up to 2,000 changed files and the newest 50 checkpoints/stashes. Checkpoint comparisons include current untracked files.
- Checkpoints and stashes have the same lifetime as the sandbox. Push permanent commits before stopping or restarting a temporary machine.

### Agent checkpoint API

`POST /api/v1/machines/:id/git` uses the existing Bearer API key. The dashboard uses protected tRPC procedures backed by the same service.

```json
{
  "action": "checkpoint",
  "path": "/workspace/project",
  "message": "Before refactoring authentication",
  "agent": "codex"
}
```

The result includes the checkpoint reference. Use `status`, `checkpointDiff` and `restore` on the same endpoint to review and recover.

To automatically save a checkpoint immediately before an agent command, add `checkpoint` to the existing exec request. A failed checkpoint prevents the command from running. The dashboard remote-command panel exposes the same option.

```json
{
  "cmd": "your-agent-command",
  "cwd": "/workspace/project",
  "checkpoint": {
    "path": "/workspace/project",
    "label": "Before agent turn",
    "agent": "claude"
  }
}
```

The exec response includes `checkpointRef`. Existing clients keep their current behavior unless they opt in.

## Bots behavior and setup

Apply the new migration with the existing `pnpm db:migrate` command before using Bots. The `0011_bots_conversations` migration creates profiles, conversations and messages, with cascading deletion of conversation content.

1. Create or select a cloud machine.
2. Install a current Claude Code or Codex CLI and sign in through that machine's console. No account tokens are copied from the developer laptop or exposed to the web app.
3. Open `/bots`, create a bot, choose its machine and agent, and write its instructions.
4. Start a conversation. Saved messages survive browser refreshes and machine replacement; update the bot's machine in settings when needed.

Each turn uses up to the latest 20 messages and a 30 KB UTF-8 context budget. Replies arrive when the CLI completes, rather than token streaming. The runner has a two-minute process timeout; the tRPC route allows 180 seconds. The deployment must support that duration.

An owner-scoped database lease permits one generation per conversation. User messages are saved before generation, and request IDs make retries idempotent. Failed replies release the lease and can be retried without duplicating user messages. Stale leases expire after three minutes. Bots never fabricates a fallback reply when an account or CLI is unavailable.

## Verification

Run in a minimachine with a disposable PostgreSQL database:

```sh
pnpm db:migrate
pnpm test
pnpm typecheck
pnpm build
```

Git tests use real repositories under `/workspace`. Bots database tests exercise persistence, ownership, retry and concurrency. Runner tests use controlled CLI executables to verify the process contract and JSON parsing; these do not validate a live model account. An authenticated account on a selected machine is needed for that final integration check.

Implementation validation passed in the VM: 58 tests, TypeScript, ESLint through the production build, and a full Next.js production build. Browser checks exercised real diff inspection, staging, checkpoint creation and restoration, native stashing, saved conversations, bot settings and the missing-account retry state. The preview uses disposable fixture data and a VM-only access adapter; that adapter is excluded from the repository changes.
