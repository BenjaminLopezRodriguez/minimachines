import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { platform } from "node:os";
import { basename } from "node:path";
import { createInterface } from "node:readline";

import { copyToClipboard } from "./proc.js";

type Api = (method: string, path: string, body?: unknown) => Promise<Response>;

type Project = { id: string; name: string; repoKey: string | null };
type Member = { principal: string; role: string; name: string; email: string | null };
type Pending = { id: string; channel: "email" | "sms"; contact: string; role: string; createdAt: string; expiresAt: string };
type Author = { n: number; name: string; email: string; commits: number; usable: boolean };
type Contact = { email: string } | { phone: string } | { agentMachineId: string };
type InviteResult = { contact: string; channel?: string; status: string; message?: string; error?: string; role?: string };

const PHONE = /^\+[1-9]\d{6,14}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ponytail: copy of repoKeyFromRemote in the `minimachine` SDK — the CLI ships without deps.
export function repoKeyFromRemote(remote: string): string | null {
  const s = remote.trim();
  const m =
    /^[\w.-]+@([\w.-]+):(.+)$/.exec(s) ??
    /^(?:https?|ssh|git):\/\/(?:[^@/]+@)?([\w.-]+)(?::\d+)?\/(.+)$/.exec(s);
  if (!m?.[1] || !m[2]) return null;
  const path = m[2].replace(/\/+$/, "").replace(/\.git$/, "");
  return path ? `${m[1]}/${path}`.toLowerCase() : null;
}

function git(args: string[]): string | null {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

/** Commit authors from the last 12 months, read locally — the log never leaves this machine. */
export function gitAuthors(): Author[] {
  const log = git(["log", "--since=12.months", "--format=%aN%x09%aE"]) ?? "";
  const byEmail = new Map<string, { name: string; email: string; commits: number }>();
  for (const line of log.split("\n")) {
    const [name = "", raw = ""] = line.split("\t");
    const email = raw.trim().toLowerCase();
    if (!email) continue;
    if (/\[bot\]|^dependabot|^renovate/i.test(name) || email.endsWith("[bot]@users.noreply.github.com")) continue;
    const prev = byEmail.get(email);
    if (prev) prev.commits++;
    else byEmail.set(email, { name: name.trim(), email, commits: 1 });
  }
  return [...byEmail.values()]
    .sort((a, b) => b.commits - a.commits)
    .map((a, i) => ({ ...a, n: i + 1, usable: !a.email.endsWith("noreply.github.com") }));
}

/**
 * Parse `+ 2 sam@lee.io +14155550123 agent:vm_ab12` and `- 1 ana@acme.dev`.
 * A bare `+`/`-` token switches mode; a row whose git email is a noreply takes
 * the next email/phone as its contact (`+ 3 kim@ota.dev`).
 */
export function parseOps(tokens: string[], authors: Author[]) {
  const add: Contact[] = [];
  const remove: string[] = [];
  const errors: string[] = [];
  let mode: "+" | "-" | null = null;
  const parts = tokens.flatMap((t) => t.split(",")).map((t) => t.trim()).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const t = parts[i]!;
    if (t === "+" || t === "-") {
      mode = t;
      continue;
    }
    if (!mode) {
      errors.push(`"${t}": start with + to invite or - to revoke`);
      continue;
    }
    let contact: Contact | null = null;
    if (/^\d+$/.test(t)) {
      const a = authors.find((x) => x.n === Number(t));
      if (!a) {
        errors.push(`no row ${t}`);
        continue;
      }
      const next = parts[i + 1];
      if (mode === "+" && next && (EMAIL.test(next) || PHONE.test(next.replace(/[\s().-]/g, "")))) {
        i++;
        contact = EMAIL.test(next) ? { email: next } : { phone: next.replace(/[\s().-]/g, "") };
      } else if (a.usable) {
        contact = { email: a.email };
      } else {
        errors.push(`row ${t} (${a.name}) has a GitHub noreply address — add an email or phone: + ${t} name@example.com`);
        continue;
      }
    } else if (EMAIL.test(t)) {
      contact = { email: t };
    } else if (PHONE.test(t.replace(/[\s().-]/g, ""))) {
      contact = { phone: t.replace(/[\s().-]/g, "") };
    } else if (mode === "+" && /^agent:[\w-]+$/.test(t)) {
      contact = { agentMachineId: t.slice("agent:".length) };
    } else {
      errors.push(`"${t}" is not a row number, email, +phone or agent:<machine>`);
      continue;
    }
    if (mode === "+") add.push(contact);
    else if ("email" in contact) remove.push(contact.email.toLowerCase());
    else if ("phone" in contact) remove.push(contact.phone);
  }
  return { add, remove, errors };
}

function label(c: Contact): string {
  return "email" in c ? c.email : "phone" in c ? c.phone : `agent:${c.agentMachineId}`;
}

function ago(iso: string): string {
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? "today" : `${d}d ago`;
}

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => (rl.close(), resolve(a))));
}

/** Text invite without Twilio: open Messages pre-filled (macOS), else print + copy. */
async function handoffSms(phone: string, message: string, openUrl: (u: string) => Promise<void>) {
  if (platform() === "darwin" && process.stdout.isTTY) {
    await openUrl(`sms:${phone}&body=${encodeURIComponent(message)}`);
    console.log(`  → opened Messages for ${phone}; press send`);
    return;
  }
  console.log(`  → send this to ${phone} yourself:\n\n${message}\n`);
  if (copyToClipboard(message)) console.log("  (copied to clipboard)");
}

export async function peopleCommand(
  argv: string[],
  deps: { api: Api; openUrl: (u: string) => Promise<void> },
) {
  const flag = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const json = argv.includes("--json");
  const yes = argv.includes("--yes");
  const role = argv.includes("--view") ? "viewer" : "member";
  const note = flag("--note");
  const tokens = argv.filter((a, i) => !a.startsWith("--") && !["--project", "--note"].includes(argv[i - 1] ?? ""));

  // Resolve the project: explicit name, else this repo's origin.
  const named = flag("--project");
  const remote = git(["remote", "get-url", "origin"])?.trim();
  const repoKey = named ? undefined : remote ? (repoKeyFromRemote(remote) ?? undefined) : undefined;
  // Not a repo: the project is named after the folder (created if it doesn't exist; it's an upsert).
  const name = named ?? (repoKey ? basename(repoKey) : basename(process.cwd()));
  const { project } = (await (await deps.api("PUT", "/api/v1/projects", { name, repoKey })).json()) as {
    project: Project;
  };
  const authors = named ? [] : gitAuthors();

  const load = async () =>
    (await (await deps.api("GET", `/api/v1/projects/${project.id}/people`)).json()) as {
      members: Member[];
      pending: Pending[];
    };

  const render = (p: { members: Member[]; pending: Pending[] }) => {
    const pendingSet = new Set(p.pending.map((x) => x.contact));
    const memberEmails = new Set(p.members.map((m) => m.email?.toLowerCase()).filter(Boolean));
    console.log(`\n${project.name}${project.repoKey ? ` · ${project.repoKey}` : ""}\n`);
    console.log("  MEMBERS");
    for (const m of p.members) console.log(`     ${m.name.padEnd(20)} ${(m.email ?? "").padEnd(28)} ${m.role}`);
    if (p.pending.length) {
      console.log("  PENDING");
      for (const x of p.pending)
        console.log(`     ${x.contact.padEnd(49)} ${x.channel === "email" ? "email" : "text"} invite · ${ago(x.createdAt)} · ${x.role}`);
    }
    if (authors.length) {
      console.log("  FROM GIT (12 mo)");
      for (const a of authors) {
        const status = memberEmails.has(a.email) ? "member" : pendingSet.has(a.email) ? "pending" : a.usable ? "" : "needs email or phone";
        console.log(
          `  ${String(a.n).padStart(2)} ${a.name.slice(0, 20).padEnd(20)} ${(a.usable ? a.email : "(github noreply)").padEnd(28)} ${String(a.commits).padStart(4)} commits  ${status}`,
        );
      }
    }
  };

  const apply = async (opTokens: string[]) => {
    const { add, remove, errors } = parseOps(opTokens, authors);
    for (const e of errors) console.error(`  ✗ ${e}`);
    if (!add.length && !remove.length) return;

    if (add.length) {
      const what = `${add.length} invite${add.length > 1 ? "s" : ""}${role === "viewer" ? " (view-only)" : ""} to ${add.map(label).join(", ")} for ${project.name}`;
      if (!yes) {
        if (!process.stdin.isTTY) {
          console.error(`Refusing to send ${what} without --yes. Get a human's OK first.`);
          process.exit(1);
        }
        if (!/^y(es)?$/i.test((await ask(`  Send ${what}? [y/N] `)).trim())) {
          console.log("  Nothing sent.");
          return;
        }
      }
      const res = await deps.api("POST", `/api/v1/projects/${project.id}/invites`, { contacts: add, role, note });
      const { invites } = (await res.json()) as { invites: InviteResult[] };
      for (const r of invites) {
        if (r.status === "sent") console.log(`  ✓ ${r.channel === "sms" ? "texted" : "emailed"} ${r.contact}`);
        else if (r.status === "added") console.log(`  ✓ ${r.contact} can now view ${project.name}`);
        else if (r.status === "handoff" && r.message && r.channel === "sms") await handoffSms(r.contact, r.message, deps.openUrl);
        else if (r.status === "handoff") console.log(`  ! email not configured on the server; send this to ${r.contact}:\n\n${r.message}\n`);
        else console.error(`  ✗ ${r.contact}: ${r.error ?? r.status}`);
      }
    }

    if (remove.length) {
      const { members, pending } = await load();
      for (const target of remove) {
        const inv = pending.find((x) => x.contact === target);
        const mem = members.find((m) => m.email?.toLowerCase() === target && m.role !== "owner");
        if (inv) {
          await deps.api("DELETE", `/api/v1/projects/${project.id}/invites/${inv.id}`);
          console.log(`  ✓ revoked invite for ${target}`);
        } else if (mem) {
          await deps.api("DELETE", `/api/v1/projects/${project.id}/members/${encodeURIComponent(mem.principal)}`);
          console.log(`  ✓ removed ${target}`);
        } else {
          console.error(`  ✗ ${target} has no pending invite or membership`);
        }
      }
    }
  };

  if (tokens.length) {
    await apply(tokens);
    if (!json) return;
  }
  const people = await load();
  if (json) {
    console.log(JSON.stringify({ project, ...people, authors }, null, 2));
    return;
  }
  render(people);
  if (!process.stdin.isTTY) return;

  console.log(
    "\n  + 2  invite row 2 · + a@b.dev · + +14155550123 · + agent:<machine> · - 1  revoke\n  Enter on an empty line to quit\n",
  );
  for (;;) {
    const line = (await ask("> ")).trim();
    if (!line) return;
    await apply(line.split(/\s+/));
    render(await load());
  }
}

function demo() {
  const authors: Author[] = [
    { n: 1, name: "Ana", email: "ana@acme.dev", commits: 9, usable: true },
    { n: 2, name: "Kim", email: "1+kim@users.noreply.github.com", commits: 2, usable: false },
  ];
  const r = parseOps(["+", "1,2", "kim@ota.dev", "+1 (415) 555-0123", "agent:vm_ab12", "-", "ana@acme.dev"], authors);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.add, [
    { email: "ana@acme.dev" },
    { email: "kim@ota.dev" },
    { phone: "+14155550123" },
    { agentMachineId: "vm_ab12" },
  ]);
  assert.deepEqual(r.remove, ["ana@acme.dev"]);
  assert.equal(parseOps(["+", "2"], authors).errors.length, 1, "noreply row needs a contact");
  assert.equal(parseOps(["2"], authors).errors.length, 1, "needs + or -");
  assert.equal(repoKeyFromRemote("git@github.com:Acme/App.git"), "github.com/acme/app");
  console.log("people demo ok");
}

if (process.argv[1]?.endsWith("people.ts") && process.argv[2] === "--demo") demo();
