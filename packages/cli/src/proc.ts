/**
 * Starting other programs the same way on macOS, Linux and Windows.
 *
 * Windows is the odd one out: `claude`, `codex` and `npm` are `.cmd` shims
 * there, which a plain spawn can't run, and passing a prompt full of spaces,
 * quotes and newlines through cmd.exe needs careful escaping. cross-spawn does
 * both. Shell snippets (deploy commands, the coding agent's shell tool) go to
 * the platform's own shell.
 */
import type { ChildProcess, SpawnOptions } from "node:child_process";
import { execFileSync } from "node:child_process";

import crossSpawn from "cross-spawn";

export const isWindows = process.platform === "win32";

/** Spawn a program with exact arguments (no shell parsing anywhere). */
export function spawnProgram(cmd: string, args: string[], opts: SpawnOptions = {}): ChildProcess {
  return crossSpawn(cmd, args, { windowsHide: true, ...opts });
}

/** The platform shell for a one-line command: PowerShell on Windows, bash (else sh) elsewhere. */
export function shellFor(command: string): { cmd: string; args: string[]; name: string } {
  if (isWindows) return { cmd: "powershell.exe", args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command], name: "PowerShell" };
  return { cmd: process.env.SHELL?.endsWith("bash") || hasBash() ? "bash" : "sh", args: ["-lc", command], name: "bash" };
}

let bash: boolean | undefined;
function hasBash(): boolean {
  if (bash === undefined) {
    try {
      execFileSync("bash", ["-c", "true"], { stdio: "ignore" });
      bash = true;
    } catch {
      bash = false;
    }
  }
  return bash;
}

/** Put text on the clipboard if the platform has a tool for it; false when it doesn't. */
export function copyToClipboard(text: string): boolean {
  const tools: [string, string[]][] = isWindows
    ? [["clip", []]]
    : process.platform === "darwin"
      ? [["pbcopy", []]]
      : [["wl-copy", []], ["xclip", ["-selection", "clipboard"]], ["xsel", ["--clipboard", "--input"]]];
  for (const [cmd, args] of tools) {
    try {
      execFileSync(cmd, args, { input: text, stdio: ["pipe", "ignore", "ignore"] });
      return true;
    } catch {
      // try the next one
    }
  }
  return false;
}

/** `node dist/proc.js --demo`: run a real .cmd shim and a shell snippet on this platform. */
async function demo() {
  const out = (cmd: string, args: string[]) =>
    new Promise<string>((resolve, reject) => {
      const child = spawnProgram(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
      let s = "";
      child.stdout!.on("data", (d: Buffer) => (s += d));
      child.on("error", reject);
      child.on("close", (code) => (code === 0 ? resolve(s.trim()) : reject(new Error(`${cmd} exited ${code}`))));
    });
  // npm is a .cmd on Windows: the case plain spawn gets wrong.
  const npm = await out("npm", ["--version"]);
  if (!/^\d+\.\d+\.\d+/.test(npm)) throw new Error(`npm --version gave ${npm}`);
  // An argument with spaces, quotes and a newline must arrive intact.
  const tricky = 'say "hi" & <then>\nline two';
  const echoed = await out(process.execPath, ["-e", "process.stdout.write(process.argv[1])", tricky]);
  if (echoed !== tricky) throw new Error(`argument mangled: ${JSON.stringify(echoed)}`);
  if (isWindows) {
    // The real-world case: a prompt through an npm-style .cmd shim (like claude.cmd), which goes via cmd.exe.
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(join(tmpdir(), "mm-shim-"));
    const shim = join(dir, "echoarg.cmd");
    writeFileSync(shim, `@"${process.execPath}" -e "process.stdout.write(process.argv[1])" %*\r\n`);
    const viaShim = await out(shim, [tricky]);
    if (viaShim !== tricky) throw new Error(`argument mangled through a .cmd shim: ${JSON.stringify(viaShim)}`);
  }
  const sh = shellFor("echo https://deployed.example.test");
  const shOut = await out(sh.cmd, sh.args);
  if (!shOut.includes("https://deployed.example.test")) throw new Error(`${sh.name} gave ${shOut}`);
  console.log(`proc demo ok · npm ${npm} · shell ${sh.name}`);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("/proc.js") && process.argv[2] === "--demo") void demo().catch((e) => (console.error(e), process.exit(1)));
