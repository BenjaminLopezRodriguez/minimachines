import { and, eq } from "drizzle-orm";
import { db } from "~/server/db";
import { machines } from "~/server/db/schema";
import { execSandbox, modalEnabled } from "./modal-driver";

export const agentCommands = {
  claude: {
    login: "claude auth login",
    logout: "claude auth logout",
    status: ["claude", "auth", "status"],
  },
  codex: {
    login: "codex login --device-auth",
    logout: "codex logout",
    status: ["codex", "login", "status"],
  },
} as const;

export function agentStatusScript(args: readonly string[]) {
  const payload = Buffer.from(JSON.stringify(args)).toString("base64");
  const source = `import subprocess,json,base64,shutil,os\nos.environ['PATH']=os.path.expanduser('~/.local/bin')+os.pathsep+os.environ.get('PATH','')\na=json.loads(base64.b64decode('${payload}'))\ninstalled=bool(shutil.which(a[0]))\nconnected=False\nif installed:\n try:\n  p=subprocess.run(a,capture_output=True,timeout=15)\n  connected=p.returncode==0\n except Exception: pass\nprint(json.dumps({'installed':installed,'connected':connected}))`;
  return source;
}

/** Never return CLI diagnostics, account details, auth files, or tokens. */
export async function agentConnection(
  owner: string,
  machineId: string,
  provider: keyof typeof agentCommands,
  disconnect = false,
): Promise<{ installed: boolean; connected: boolean }> {
  const [machine] = await db
    .select()
    .from(machines)
    .where(and(eq(machines.id, machineId), eq(machines.ownerUserId, owner)))
    .limit(1);
  if (!machine) throw new Error("Machine not found.");
  if (machine.status !== "running" || !machine.sandboxId || !modalEnabled())
    throw new Error("Start a cloud machine to connect your agent.");
  const args = disconnect
    ? agentCommands[provider].logout.split(" ")
    : [...agentCommands[provider].status];
  const source = agentStatusScript(args);
  const encoded = Buffer.from(source).toString("base64");
  const result = await execSandbox(machine.sandboxId, [
    "sh",
    "-c",
    `exec "$(command -v gosu || command -v su-exec)" agent python3 -c "import base64;exec(base64.b64decode('${encoded}'))"`,
  ]);
  if (result.exitCode !== 0)
    throw new Error("Could not check the agent. Try the machine console.");
  const state = JSON.parse(result.stdout) as {
    installed: boolean;
    connected: boolean;
  };
  // A failed logout must never be presented as disconnected.
  if (disconnect && !state.connected)
    throw new Error("Sign-out failed. Retry in the machine console.");
  if (disconnect) {
    const remaining = await agentConnection(owner, machineId, provider, false);
    if (remaining.connected)
      throw new Error(
        "The agent is still connected through this VM’s configuration. Remove its provider credentials in machine settings.",
      );
    return remaining;
  }
  return { installed: state.installed, connected: state.connected };
}
