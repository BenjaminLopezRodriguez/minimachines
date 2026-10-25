/**
 * Pick-or-create prompts for commands whose input doesn't exist yet. People at
 * a terminal get a short numbered menu; agents and scripts (no TTY, or
 * --no-tui) never get a prompt — they get the exact command that creates the
 * missing thing, and the command exits non-zero.
 */
import { createInterface } from "node:readline/promises";

let interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
export const isInteractive = () => interactive;
export const setInteractive = (on: boolean) => void (interactive = on && Boolean(process.stdin.isTTY && process.stdout.isTTY));

async function line(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

export type Option<T> = { label: string; value: T; hint?: string };

/**
 * A numbered menu; Enter takes the first option. With many options, typing
 * text instead of a number filters the list. Null when cancelled (q / ctrl+d).
 */
export async function choose<T>(question: string, options: Option<T>[]): Promise<T | null> {
  let shown = options;
  for (;;) {
    console.log(`\n${question}`);
    shown.slice(0, 30).forEach((o, i) => console.log(`  ${String(i + 1).padStart(2)}  ${o.label}${o.hint ? `  \x1b[2m${o.hint}\x1b[0m` : ""}`));
    if (shown.length > 30) console.log(`      … ${shown.length - 30} more — type to filter`);
    const a = await line(shown.length > 9 ? "› number, or text to filter (q to cancel): " : "› number (enter = 1, q to cancel): ").catch(() => "q");
    if (a === "q") return null;
    if (a === "") return shown[0]?.value ?? null;
    const n = Number(a);
    if (Number.isInteger(n) && n >= 1 && n <= shown.length) return shown[n - 1]!.value;
    const filtered = options.filter((o) => `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(a.toLowerCase()));
    if (filtered.length) shown = filtered;
    else console.log("  no match");
  }
}

export async function confirm(question: string, byDefault = true): Promise<boolean> {
  const a = (await line(`${question} ${byDefault ? "[Y/n]" : "[y/N]"} `).catch(() => "n")).toLowerCase();
  return a === "" ? byDefault : a === "y" || a === "yes";
}

export async function askText(question: string, byDefault?: string): Promise<string> {
  const a = await line(`${question}${byDefault ? ` (${byDefault})` : ""}: `).catch(() => "");
  return a || byDefault || "";
}

/** Non-interactive dead end: say what's missing and the command that creates it. */
export function missing(what: string, create: string): never {
  console.error(`${what}\n  create it: ${create}`);
  process.exit(1);
}
