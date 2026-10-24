export const installers = {
  npm: "npm install --global @minimachines/cli@latest",
  pnpm: "pnpm add --global @minimachines/cli@latest",
} as const;

export const agentSetups = [
  {
    id: "codex",
    name: "Codex",
    location: "~/.codex/skills/minimachine/SKILL.md",
  },
  {
    id: "claude",
    name: "Claude Code",
    location: "~/.claude/skills/minimachine/SKILL.md",
  },
  { id: "cursor", name: "Cursor", location: "~/.cursor/rules/minimachine.md" },
] as const;

export const commandReference = [
  ["mm login", "Sign in through your browser and save a CLI credential."],
  [
    "mm whoami",
    "Show the saved credential source and API host. This does not validate the key with the server.",
  ],
  [
    "mm skill install --agent codex",
    "Install instructions for your coding agent. Also supports claude and cursor.",
  ],
  [
    "mm create node-ts",
    "Create a cloud machine from the Node.js / TypeScript template.",
  ],
  [
    "mm exec MACHINE_ID 'node --version'",
    "Run a shell command and stream its output.",
  ],
  [
    "mm put MACHINE_ID ./index.html app/index.html",
    "Upload a file to /workspace/app/index.html.",
  ],
  ["mm run MACHINE_ID", "Open the machine’s browser console."],
  ["mm stop MACHINE_ID", "Stop the machine. Save any work you need first."],
] as const;

export function isMachineId(value: string) {
  return /^vm_[a-zA-Z0-9_-]+$/.test(value);
}
