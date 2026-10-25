/**
 * `mm code` — a small opencode-style coding agent. Claude drives four tools
 * (bash, read, write, edit) against either this directory or a minimachine
 * (`--machine <id>`, where commands and files go through the machine API).
 * Every command and write asks first unless `--yes`.
 */
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import nodePath from "node:path";
import { createInterface } from "node:readline/promises";

import Anthropic from "@anthropic-ai/sdk";

type Api = (method: string, path: string, body?: unknown) => Promise<Response>;

export const CODE_MODEL = "claude-opus-5-5";
const MODEL = CODE_MODEL;
const OUTPUT_CAP = 30_000; // chars of tool output sent back per call

// ponytail: one interface, two backends — local fs/shell or the machine API.
type Backend = {
  label: string;
  bash(command: string): Promise<string>;
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
};

function localBackend(root: string): Backend {
  // Model-supplied paths are untrusted: resolve and refuse anything outside root.
  const inside = (p: string) => {
    const target = nodePath.resolve(root, p);
    const rel = nodePath.relative(root, target);
    if (rel === ".." || rel.startsWith(`..${nodePath.sep}`) || nodePath.isAbsolute(rel)) {
      throw new Error(`path escapes ${root}`);
    }
    return target;
  };
  return {
    label: root,
    bash: (command) =>
      new Promise((resolve) => {
        execFile("bash", ["-lc", command], { cwd: root, timeout: 120_000, maxBuffer: 8 << 20 }, (err, stdout, stderr) => {
          const code = err && "code" in err ? err.code : 0;
          resolve(`${stdout}${stderr ? `\n[stderr]\n${stderr}` : ""}\n[exit ${code ?? 0}]`);
        });
      }),
    read: (p) => readFile(inside(p), "utf8"),
    write: async (p, content) => {
      const target = inside(p);
      await mkdir(nodePath.dirname(target), { recursive: true });
      await writeFile(target, content);
    },
  };
}

function machineBackend(id: string, api: Api): Backend {
  const m = `/api/v1/machines/${encodeURIComponent(id)}`;
  // The API roots files at /workspace; accept either spelling.
  const filePath = (p: string) =>
    `${m}/files/${p.replace(/^\/+/, "").replace(/^workspace\/+/, "").split("/").map(encodeURIComponent).join("/")}`;
  return {
    label: `machine ${id}:/workspace`,
    bash: async (command) => {
      const res = await api("POST", `${m}/exec`, { cmd: command, cwd: "/workspace" });
      const { exec } = (await res.json()) as { exec: { stdout: string; stderr: string; exitCode: number } };
      return `${exec.stdout}${exec.stderr ? `\n[stderr]\n${exec.stderr}` : ""}\n[exit ${exec.exitCode}]`;
    },
    read: async (p) => (await api("GET", filePath(p))).text(),
    write: async (p, content) => {
      await api("PUT", filePath(p), new Uint8Array(Buffer.from(content, "utf8")));
    },
  };
}

const tools: Anthropic.Beta.BetaTool[] = [
  {
    name: "bash",
    description: "Run a shell command in the workspace root. Returns stdout, stderr and the exit code.",
    input_schema: {
      type: "object",
      properties: { command: { type: "string" } },
      required: ["command"],
    },
  },
  {
    name: "read_file",
    description: "Read a text file, path relative to the workspace root.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Create or overwrite a file with the full content given.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
    },
  },
  {
    name: "edit_file",
    description: "Replace one exact, unique occurrence of old_text with new_text in a file. Read the file first.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        old_text: { type: "string" },
        new_text: { type: "string" },
      },
      required: ["path", "old_text", "new_text"],
    },
  },
];

/** Every field the schema requires must be a string — eager streaming skips server validation. */
function validInput(name: string, input: unknown): Record<string, string> | null {
  const required = tools.find((t) => t.name === name)?.input_schema.required ?? [];
  if (!input || typeof input !== "object") return null;
  const rec = input as Record<string, unknown>;
  return required.every((k) => typeof rec[k] === "string") ? (rec as Record<string, string>) : null;
}

function clip(s: string): string {
  return s.length > OUTPUT_CAP ? `${s.slice(0, OUTPUT_CAP)}\n…[${s.length - OUTPUT_CAP} more chars cut]` : s;
}

const dim = (s: string) => (process.stdout.isTTY ? `\x1b[2m${s}\x1b[0m` : s);
const bold = (s: string) => (process.stdout.isTTY ? `\x1b[1m${s}\x1b[0m` : s);
// Same cobalt as the TUI (#6f8cff).
const brand = (s: string) => (process.stdout.isTTY ? `\x1b[1;38;2;111;140;255m${s}\x1b[0m` : s);

export async function codeCommand(argv: string[], deps: { api: Api }) {
  const flag = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const machine = flag("--machine");
  const oneShot = flag("-p") ?? flag("--prompt");
  // From the TUI home screen: run this first, then stay in the REPL.
  const initial = flag("--initial");
  let autoApprove = argv.includes("--yes");
  const backend = machine ? machineBackend(machine, deps.api) : localBackend(process.cwd());

  // Credentials resolve from ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / an `ant auth login` profile.
  const client = new Anthropic();
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const system = [
    "You are a coding agent working in a terminal through tools.",
    `Workspace: ${backend.label}. All paths are relative to it.`,
    "Read before you edit. Prefer edit_file for small changes and write_file for new files.",
    "Run the project's tests or build after changes when there is one, and report what you ran and what happened.",
    "Keep replies short: what you did, what changed, anything that failed.",
  ].join("\n");

  // Append-only history: assistant content goes back exactly as received.
  const messages: Anthropic.Beta.BetaMessageParam[] = [];

  async function approve(summary: string): Promise<boolean> {
    if (autoApprove) return true;
    if (!process.stdin.isTTY) return false;
    const a = (await rl.question(`${bold("allow")} ${summary}? [y/N/a=always] `)).trim().toLowerCase();
    if (a === "a") autoApprove = true;
    return a === "y" || a === "a";
  }

  async function runTool(name: string, input: Record<string, string>): Promise<{ content: string; is_error?: boolean }> {
    try {
      switch (name) {
        case "bash": {
          if (!(await approve(`$ ${input.command}`))) return { content: "User declined to run this command.", is_error: true };
          return { content: clip(await backend.bash(input.command!)) };
        }
        case "read_file":
          console.log(dim(`  read ${input.path}`));
          return { content: clip(await backend.read(input.path!)) };
        case "write_file": {
          const lines = input.content!.split("\n").length;
          if (!(await approve(`write ${input.path} (${lines} lines)`))) return { content: "User declined this write.", is_error: true };
          await backend.write(input.path!, input.content!);
          return { content: `Wrote ${input.path}` };
        }
        case "edit_file": {
          const before = await backend.read(input.path!);
          const count = before.split(input.old_text!).length - 1;
          if (count !== 1) return { content: `old_text must match exactly once; it matched ${count} times`, is_error: true };
          console.log(dim(`  - ${input.old_text!.split("\n").join("\n  - ")}\n  + ${input.new_text!.split("\n").join("\n  + ")}`));
          if (!(await approve(`edit ${input.path}`))) return { content: "User declined this edit.", is_error: true };
          await backend.write(input.path!, before.replace(input.old_text!, () => input.new_text!));
          return { content: `Edited ${input.path}` };
        }
        default:
          return { content: `Unknown tool ${name}`, is_error: true };
      }
    } catch (err) {
      return { content: err instanceof Error ? err.message : String(err), is_error: true };
    }
  }

  /** One user turn: loop until Claude stops calling tools. */
  async function turn(userText: string) {
    messages.push({ role: "user", content: userText });
    let jsonRetries = 0;
    for (;;) {
      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 64_000,
        system,
        tools,
        messages,
        output_config: { effort: "high" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
      stream.on("text", (delta) => process.stdout.write(delta));

      let message: Anthropic.Beta.BetaMessage;
      try {
        message = await stream.finalMessage();
        jsonRetries = 0;
      } catch (err) {
        // Only an unparseable streamed tool input is retried; API errors surface.
        if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err;
        continue;
      }
      process.stdout.write("\n");

      if (message.stop_reason === "refusal") {
        console.log(dim("(declined)"));
        messages.push({ role: "assistant", content: message.content });
        return;
      }
      if (message.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: message.content });
        continue;
      }
      const uses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      // A truncated tool call is never recorded: history must not end on an unanswered tool_use.
      if (uses.length && message.stop_reason === "max_tokens") {
        throw new Error("A tool call was cut off at max_tokens; ask for a smaller step.");
      }
      messages.push({ role: "assistant", content: message.content });
      if (!uses.length) return;

      // All results go back in one user message so parallel calls keep working.
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const use of uses) {
        const input = validInput(use.name, use.input);
        const out = input
          ? await runTool(use.name, input)
          : { content: `Invalid input for ${use.name}: ${JSON.stringify(use.input)}`, is_error: true };
        results.push({ type: "tool_result", tool_use_id: use.id, ...out });
      }
      messages.push({ role: "user", content: results });
    }
  }

  /** Returns false when retrying is pointless (no credentials / no credit). */
  function report(err: unknown): boolean {
    if (err instanceof Anthropic.AuthenticationError) {
      console.error("No Anthropic credentials. Set ANTHROPIC_API_KEY or run `ant auth login`.");
      return false;
    }
    if (err instanceof Anthropic.RateLimitError) console.error("Rate limited — try again shortly.");
    else if (err instanceof Anthropic.APIError) console.error(`API error ${err.status}: ${err.message}`);
    else console.error(err instanceof Error ? err.message : err);
    return true;
  }

  try {
    if (oneShot) {
      try {
        await turn(oneShot);
      } catch (err) {
        report(err);
        process.exitCode = 1;
      }
      return;
    }
    console.log(`${brand("▌ mm code")} ${dim(`· ${MODEL} · ${backend.label}`)}\n${dim("  /exit to quit · /clear to reset · ctrl+c to stop")}\n`);
    if (initial) {
      console.log(`${brand("›")} ${initial}\n`);
      try {
        await turn(initial);
      } catch (err) {
        if (!report(err)) return;
      }
    }
    for (;;) {
      const line = (await rl.question(`\n${brand("›")} `)).trim();
      if (!line) continue;
      if (line === "/exit" || line === "/quit") return;
      if (line === "/clear") {
        messages.length = 0;
        console.log(dim("(history cleared)"));
        continue;
      }
      try {
        await turn(line);
      } catch (err) {
        if (!report(err)) return;
      }
    }
  } finally {
    rl.close();
  }
}
