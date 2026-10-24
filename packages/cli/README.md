# @minimachines/cli

Drive cloud workspaces from your terminal or coding agent. Requires Node.js 20 or newer.

## Install

```sh
npm install --global @minimachines/cli@latest
# or
pnpm add --global @minimachines/cli@latest
```

Both `mm` and `minimachines` run the CLI. If you prefer not to install globally, use `npx --yes @minimachines/cli@latest` in place of `mm` for each command.

## Connect

```sh
mm login
mm skill install --agent codex
```

Login opens your browser for account sign-in and CLI approval. Use `mm login --no-open` in a headless terminal, then open the printed URL yourself. Credentials are saved in `~/.config/minimachines/credentials.json`.

The skill supports `codex`, `claude`, and `cursor`. Restart your agent session after installation. You can use the CLI directly without installing a skill.

## First machine

Creating a machine starts cloud compute and may incur usage charges. Check your account first.

```sh
mm create node-ts
```

Save the machine ID and app URL printed by that command. Replace `MACHINE_ID` in the examples below with your ID:

```sh
mm exec MACHINE_ID 'node --version'
mm put MACHINE_ID ./index.html app/index.html
mm run MACHINE_ID
```

`mm run` opens the browser console. The app URL serves port 3000; start an application listening on `0.0.0.0:3000` to use it.

Workspaces are temporary. Push or download your work before stopping:

```sh
mm stop MACHINE_ID
```

## Credentials and troubleshooting

`mm whoami` reports the local credential source and API host. It does not validate the key with the server. `MINIMACHINE_API_KEY` overrides the saved login. The default API host is `https://www.minimachin.es`; use the `www` host if setting `MINIMACHINE_BASE_URL`.

If a command is missing, update the CLI using the install command above. For the step-by-step guide and supported commands, see [the install guide](https://www.minimachin.es/install) and [documentation](https://www.minimachin.es/docs).
