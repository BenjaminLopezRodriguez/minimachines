/**
 * `mm tui` — keyboard-first dashboard over the same API the commands use.
 * Tabs: Machines · Shares · People. One key map everywhere (press ?).
 * `--json` skips the UI and prints each tab as NDJSON for agents.
 */
import { execFileSync } from "node:child_process";
import { basename } from "node:path";

import { Box, render, Text, useApp, useInput, useStdout } from "ink";
import { useCallback, useEffect, useState } from "react";

import { gitAuthors, repoKeyFromRemote } from "./people.js";

type Api = (method: string, path: string, body?: unknown) => Promise<Response>;
export type TuiDeps = {
  api: Api; // throws on non-2xx
  openUrl: (url: string) => Promise<void>;
  code: (machineId: string) => Promise<void>;
};

export const TABS = ["machines", "shares", "people"] as const;
export type Tab = (typeof TABS)[number];

type Machine = { id: string; name: string; title: string; status: string; region: string; cpu: number; memoryGb: number; templateId?: string; task?: string; appUrl?: string; emulatorUrl?: string };
type Share = { slug: string; url: string; label: string; access: string; enabled: boolean; port: number | null; machineId: string | null };
type Person = { kind: "member" | "pending" | "git"; id: string; name: string; contact: string; role?: string; commits?: number };
type Item = { key: string; label: string; fields: [string, string][]; raw: Machine | Share | Person };

// --- pure state: everything a key can do to navigation lives here -----------

export type Mode =
  | { kind: "list" }
  | { kind: "help" }
  | { kind: "filter" }
  | { kind: "prompt"; purpose: "exec" | "create" | "invite"; label: string; value: string }
  | { kind: "confirm"; purpose: "stop" | "revoke-share" | "remove-person" | "invite"; label: string; payload: string };

export type State = { tab: Tab; index: number; filter: string; mode: Mode };
export type Key = { input: string; upArrow?: boolean; downArrow?: boolean; leftArrow?: boolean; rightArrow?: boolean; tab?: boolean; return?: boolean; escape?: boolean; backspace?: boolean; delete?: boolean };

/** Navigation + text entry. Returns the next state and, at most, one named action for the component to run. */
export function reduce(s: State, k: Key, count: number): { state: State; action?: string } {
  const m = s.mode;
  if (m.kind === "help") return { state: { ...s, mode: { kind: "list" } } }; // any key closes help
  if (m.kind === "filter" || m.kind === "prompt") {
    const value = m.kind === "filter" ? s.filter : m.value;
    if (k.escape) return { state: { ...s, mode: { kind: "list" }, ...(m.kind === "filter" ? { filter: "" } : {}) } };
    if (k.return) return m.kind === "filter" ? { state: { ...s, mode: { kind: "list" } } } : { state: { ...s, mode: { kind: "list" } }, action: `submit:${m.purpose}:${m.value}` };
    const next = k.backspace || k.delete ? value.slice(0, -1) : k.input && !k.upArrow && !k.downArrow ? value + k.input : value;
    return m.kind === "filter" ? { state: { ...s, filter: next, index: 0 } } : { state: { ...s, mode: { ...m, value: next } } };
  }
  if (m.kind === "confirm") {
    const yes = k.input === "y";
    return { state: { ...s, mode: { kind: "list" } }, action: yes ? `confirm:${m.purpose}:${m.payload}` : "cancelled" };
  }
  const move = (d: number) => ({ state: { ...s, index: Math.max(0, Math.min(count - 1, s.index + d)) } });
  const switchTab = (d: number) => ({ state: { ...s, tab: TABS[(TABS.indexOf(s.tab) + d + TABS.length) % TABS.length]!, index: 0, filter: "" } });
  if (k.downArrow || k.input === "j") return move(1);
  if (k.upArrow || k.input === "k") return move(-1);
  if (k.rightArrow || k.tab || k.input === "l") return switchTab(1);
  if (k.leftArrow || k.input === "h") return switchTab(-1);
  if (k.input === "?") return { state: { ...s, mode: { kind: "help" } } };
  if (k.input === "/") return { state: { ...s, mode: { kind: "filter" } } };
  if (k.input === "q") return { state: s, action: "quit" };
  if (k.input === "r") return { state: s, action: "refresh" };
  if (k.return) return { state: s, action: "open" };
  if (k.input && "nxsco+-d".includes(k.input)) return { state: s, action: `key:${k.input}` };
  return { state: s };
}

// --- data -------------------------------------------------------------------

async function repoProject(api: Api): Promise<{ id: string; name: string } | null> {
  let remote = "";
  try {
    remote = execFileSync("git", ["remote", "get-url", "origin"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
  const key = repoKeyFromRemote(remote);
  const { projects } = (await (await api("GET", "/api/v1/projects")).json()) as { projects: { id: string; name: string; repoKey: string | null }[] };
  return projects.find((p) => p.repoKey === key) ?? (key ? { id: "", name: basename(key) } : null);
}

export async function load(api: Api, tab: Tab): Promise<{ items: Item[]; projectId?: string; note?: string }> {
  if (tab === "machines") {
    const { machines } = (await (await api("GET", "/api/v1/machines")).json()) as { machines: Machine[] };
    return {
      items: machines.map((m) => ({
        key: m.id,
        label: `${m.status === "running" ? "●" : "○"} ${m.name.padEnd(14)} ${m.status}`,
        fields: [["id", m.id], ["status", m.status], ["template", m.templateId ?? "—"], ["size", `${m.cpu} cpu · ${m.memoryGb} GB`], ["region", m.region], ["task", m.task ?? "—"], ["app", m.appUrl ?? "—"], ["console", m.emulatorUrl ? "Enter to open" : "—"]],
        raw: m,
      })),
    };
  }
  if (tab === "shares") {
    const { shares } = (await (await api("GET", "/api/v1/shares")).json()) as { shares: Share[] };
    return {
      items: shares.map((x) => ({
        key: x.slug,
        label: `${x.enabled ? "●" : "○"} ${x.slug} ${x.label || ""}`.trim(),
        fields: [["url", x.url], ["status", x.enabled ? "live" : "revoked"], ["access", x.access], ["machine", x.machineId ?? "local"], ["port", String(x.port ?? "—")]],
        raw: x,
      })),
    };
  }
  const project = await repoProject(api);
  const authors = gitAuthors();
  const people: Person[] = [];
  if (project?.id) {
    const p = (await (await api("GET", `/api/v1/projects/${project.id}/people`)).json()) as {
      members: { principal: string; name: string; email: string | null; role: string }[];
      pending: { id: string; contact: string; role: string }[];
    };
    for (const m of p.members) people.push({ kind: "member", id: m.principal, name: m.name, contact: m.email ?? "", role: m.role });
    for (const x of p.pending) people.push({ kind: "pending", id: x.id, name: x.contact, contact: x.contact, role: x.role });
  }
  const known = new Set(people.map((x) => x.contact.toLowerCase()));
  for (const a of authors) if (!known.has(a.email)) people.push({ kind: "git", id: a.email, name: a.name, contact: a.usable ? a.email : "", commits: a.commits });
  return {
    projectId: project?.id || undefined,
    note: !project ? "Not in a git repo — use `mm people --project <name>`" : !project.id ? `No project for ${project.name} yet — press + to invite someone and create it` : undefined,
    items: people.map((x) => ({
      key: `${x.kind}:${x.id}`,
      label: `${x.kind === "member" ? "■" : x.kind === "pending" ? "◇" : "·"} ${x.name}`,
      fields: [["kind", x.kind], ["contact", x.contact || (x.kind === "git" ? "(github noreply — type an email)" : "—")], ["role", x.role ?? "—"], ...(x.commits ? ([["commits", String(x.commits)]] as [string, string][]) : [])],
      raw: x,
    })),
  };
}

// --- UI ---------------------------------------------------------------------

const HELP: [string, string][] = [
  ["j/k ↑/↓", "move"], ["h/l ←/→ Tab", "switch tab"], ["Enter", "open (console · share url)"], ["/", "filter"], ["r", "refresh"], ["?", "this help"], ["q", "quit"],
  ["", ""], ["Machines", ""], ["n", "new machine (template id)"], ["x", "exec a command"], ["o", "open app url"], ["c", "mm code on this machine"], ["s", "stop"],
  ["", ""], ["Shares", ""], ["d", "revoke"], ["", ""], ["People", ""], ["+", "invite (selected or typed contact)"], ["-", "revoke invite / remove member"],
];

function App({ deps, exit }: { deps: TuiDeps; exit: (after?: () => Promise<void>) => void }) {
  const { stdout } = useStdout();
  const [state, setState] = useState<State>({ tab: "machines", index: 0, filter: "", mode: { kind: "list" } });
  const [data, setData] = useState<{ items: Item[]; projectId?: string; note?: string }>({ items: [] });
  const [status, setStatus] = useState("loading…");
  const [output, setOutput] = useState<Record<string, string>>({});

  const refresh = useCallback(async (tab: Tab) => {
    setStatus("loading…");
    try {
      const d = await load(deps.api, tab);
      setData(d);
      setStatus(d.note ?? "ready");
    } catch (err) {
      setData({ items: [] });
      setStatus(`error: ${err instanceof Error ? err.message : err}`);
    }
  }, [deps.api]);
  useEffect(() => void refresh(state.tab), [state.tab, refresh]);

  const items = data.items.filter((i) => !state.filter || i.label.toLowerCase().includes(state.filter.toLowerCase()));
  const sel = items[Math.min(state.index, items.length - 1)];

  const act = async (action: string) => {
    const machine = state.tab === "machines" ? (sel?.raw as Machine | undefined) : undefined;
    const share = state.tab === "shares" ? (sel?.raw as Share | undefined) : undefined;
    const person = state.tab === "people" ? (sel?.raw as Person | undefined) : undefined;
    const ask = (mode: Mode) => setState((s) => ({ ...s, mode }));
    const run = async (label: string, fn: () => Promise<string | void>) => {
      setStatus(`${label}…`);
      try {
        const result = (await fn()) || `${label}: done`;
        await refresh(state.tab); // refresh first so its "ready" doesn't hide the result
        setStatus(result);
      } catch (err) {
        setStatus(`${label} failed: ${err instanceof Error ? err.message : err}`);
      }
    };
    const [kind, purpose, ...rest] = action.split(":");
    const arg = rest.join(":");
    if (action === "quit") return exit();
    if (action === "refresh") return refresh(state.tab);
    if (action === "cancelled") return setStatus("cancelled");
    if (action === "open") {
      const url = machine?.emulatorUrl ?? share?.url;
      return url ? void deps.openUrl(url).then(() => setStatus(`opened ${url}`)) : setStatus("nothing to open");
    }
    if (kind === "key") {
      if (state.tab === "machines") {
        if (purpose === "n") return ask({ kind: "prompt", purpose: "create", label: "template id (e.g. node-ts)", value: "" });
        if (!machine) return setStatus("no machine selected");
        if (purpose === "x") return ask({ kind: "prompt", purpose: "exec", label: `$ on ${machine.name}`, value: "" });
        if (purpose === "o") return machine.appUrl ? void deps.openUrl(machine.appUrl) : setStatus("no app url");
        if (purpose === "c") return exit(() => deps.code(machine.id));
        if (purpose === "s") return ask({ kind: "confirm", purpose: "stop", label: `stop ${machine.name}?`, payload: machine.id });
      }
      if (state.tab === "shares" && purpose === "d" && share) return ask({ kind: "confirm", purpose: "revoke-share", label: `revoke ${share.url}?`, payload: share.slug });
      if (state.tab === "people") {
        if (purpose === "+") return ask({ kind: "prompt", purpose: "invite", label: "invite (email, +phone; add ' view' for read-only)", value: person?.kind === "git" ? person.contact : "" });
        if (purpose === "-" && person && person.kind !== "git" && person.role !== "owner")
          return ask({ kind: "confirm", purpose: "remove-person", label: `${person.kind === "pending" ? "revoke invite for" : "remove"} ${person.name}?`, payload: `${person.kind}|${person.id}` });
      }
      return setStatus(`${purpose} does nothing here — ? for help`);
    }
    if (kind === "submit") {
      if (!arg.trim()) return setStatus("cancelled");
      if (purpose === "create") return run("create", async () => {
        const { machine: m } = (await (await deps.api("POST", "/api/v1/machines", { templateId: arg.trim() })).json()) as { machine: Machine };
        return `created ${m.id}`;
      });
      if (purpose === "exec" && machine) return run("exec", async () => {
        const { exec } = (await (await deps.api("POST", `/api/v1/machines/${machine.id}/exec`, { cmd: arg })).json()) as { exec: { stdout: string; stderr: string; exitCode: number } };
        setOutput((o) => ({ ...o, [machine.id]: `$ ${arg}\n${exec.stdout}${exec.stderr}\n[exit ${exec.exitCode}]` }));
        return `exit ${exec.exitCode}`;
      });
      if (purpose === "invite") return ask({ kind: "confirm", purpose: "invite", label: `send invite to ${arg.trim()}? (y/N)`, payload: arg.trim() });
    }
    if (kind === "confirm") {
      if (purpose === "stop") return run("stop", async () => void (await deps.api("POST", `/api/v1/machines/${arg}/stop`)));
      if (purpose === "revoke-share") return run("revoke", async () => void (await deps.api("DELETE", `/api/v1/shares/${arg}`)));
      if (purpose === "invite") return run("invite", async () => {
        const [contact = "", view] = arg.split(/\s+/);
        const projectId = data.projectId ?? (await createProject(deps.api));
        const c = contact.includes("@") ? { email: contact } : { phone: contact.replace(/[\s().-]/g, "") };
        const { invites } = (await (await deps.api("POST", `/api/v1/projects/${projectId}/invites`, { contacts: [c], role: view === "view" ? "viewer" : "member" })).json()) as { invites: { status: string; message?: string; error?: string }[] };
        const r = invites[0];
        return r?.status === "sent" ? `invite sent to ${contact}` : r?.status === "handoff" ? `not sent by server — run \`mm people + ${contact}\` to hand it off` : `invite failed: ${r?.error ?? r?.status}`;
      });
      if (purpose === "remove-person" && data.projectId) return run("remove", async () => {
        const [k, id = ""] = arg.split("|");
        await deps.api("DELETE", k === "pending" ? `/api/v1/projects/${data.projectId}/invites/${id}` : `/api/v1/projects/${data.projectId}/members/${encodeURIComponent(id)}`);
      });
    }
  };

  useInput((input, key) => {
    const { state: next, action } = reduce(state, { input, ...key }, items.length);
    setState(next);
    if (action) void act(action);
  });

  const rows = Math.max(5, (stdout.rows ?? 24) - 6);
  const start = Math.max(0, Math.min(state.index - Math.floor(rows / 2), items.length - rows));
  const m = state.mode;

  if (m.kind === "help") {
    return (
      <Box flexDirection="column" borderStyle="round" paddingX={1}>
        <Text bold>mm tui — keys (any key to close)</Text>
        {HELP.map(([k, v], i) => (k && !v ? <Text key={i} bold>{k}</Text> : <Text key={i}>{k.padEnd(14)}<Text dimColor>{v}</Text></Text>))}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height={(stdout.rows ?? 24) - 1}>
      <Box>
        <Text bold>mm </Text>
        {TABS.map((t) => (
          <Text key={t} inverse={t === state.tab}>{` ${t} `}</Text>
        ))}
        <Text dimColor>{state.filter ? `  filter: ${state.filter}` : "  ? help"}</Text>
      </Box>
      <Box flexGrow={1}>
        <Box flexDirection="column" width="40%" borderStyle="round" paddingX={1}>
          {items.length === 0 && <Text dimColor>{status === "loading…" ? "loading…" : "nothing here"}</Text>}
          {items.slice(start, start + rows).map((it, i) => (
            <Text key={it.key} inverse={start + i === state.index} wrap="truncate">{it.label}</Text>
          ))}
        </Box>
        <Box flexDirection="column" flexGrow={1} borderStyle="round" paddingX={1}>
          {sel ? sel.fields.map(([k, v]) => <Text key={k} wrap="truncate"><Text dimColor>{k.padEnd(9)}</Text>{v}</Text>) : <Text dimColor>—</Text>}
          {sel && output[sel.key] && (
            <Text>{output[sel.key]!.trimEnd().split("\n").slice(-Math.max(3, rows - sel.fields.length - 2)).join("\n")}</Text>
          )}
        </Box>
      </Box>
      {m.kind === "prompt" || m.kind === "filter" ? (
        <Text>{m.kind === "filter" ? `/ ${state.filter}` : `${m.label}: ${m.value}`}<Text inverse> </Text><Text dimColor>  Enter ok · Esc cancel</Text></Text>
      ) : m.kind === "confirm" ? (
        <Text color="yellow">{m.label} [y/N]</Text>
      ) : (
        <Text dimColor wrap="truncate">{`${state.tab} | ${items.length} items | ${status} | [q]uit`}</Text>
      )}
    </Box>
  );
}

async function createProject(api: Api): Promise<string> {
  const remote = execFileSync("git", ["remote", "get-url", "origin"], { encoding: "utf8" }).trim();
  const repoKey = repoKeyFromRemote(remote) ?? undefined;
  if (!repoKey) throw new Error("not a git repo with an origin remote");
  const { project } = (await (await api("PUT", "/api/v1/projects", { name: basename(repoKey), repoKey })).json()) as { project: { id: string } };
  return project.id;
}

export async function tuiCommand(argv: string[], deps: TuiDeps) {
  if (argv.includes("--test")) return selfCheck();
  if (argv.includes("--json") || !process.stdin.isTTY) {
    // Agent mode: one NDJSON line per tab, status on stderr.
    for (const tab of TABS) {
      try {
        const d = await load(deps.api, tab);
        console.log(JSON.stringify({ type: "list", tab, items: d.items.map((i) => i.raw), ...(d.note ? { note: d.note } : {}) }));
        console.error(JSON.stringify({ status: "ready", tab, count: d.items.length }));
      } catch (err) {
        console.error(JSON.stringify({ status: "error", tab, error: err instanceof Error ? err.message : String(err) }));
      }
    }
    return;
  }
  let after: (() => Promise<void>) | undefined;
  const app = render(<App deps={deps} exit={(fn) => { after = fn; app.unmount(); }} />);
  await app.waitUntilExit();
  if (after) await after(); // e.g. `c`: hand the terminal to `mm code`
}

/** `mm tui --test`: drives the key reducer through a session and asserts each step. */
function selfCheck() {
  const k = (input: string, extra: Partial<Key> = {}): Key => ({ input, ...extra });
  let s: State = { tab: "machines", index: 0, filter: "", mode: { kind: "list" } };
  const step = (key: Key, count = 3) => {
    const r = reduce(s, key, count);
    s = r.state;
    return r.action;
  };
  const check = (ok: boolean, what: string) => {
    if (!ok) throw new Error(`tui self-check failed: ${what}`);
  };
  step(k("j")); step(k("j")); step(k("j"));
  check(s.index === 2, "j stops at the last item");
  step(k("k"));
  check(s.index === 1, "k moves up");
  step(k("l"));
  check(s.tab === "shares" && s.index === 0, "l switches tab and resets selection");
  step(k("h")); step(k("h"));
  check(s.tab === "people", "h wraps around");
  step(k("/")); step(k("a")); step(k("b")); step(k("", { backspace: true }));
  check(s.mode.kind === "filter" && s.filter === "a", "filter typing + backspace");
  step(k("", { escape: true }));
  check(s.mode.kind === "list" && s.filter === "", "esc clears filter");
  s = { ...s, mode: { kind: "prompt", purpose: "exec", label: "$", value: "" } };
  step(k("l")); step(k("s"));
  check(s.mode.kind === "prompt" && s.mode.value === "ls", "prompt captures keys that are shortcuts elsewhere");
  check(step(k("", { return: true })) === "submit:exec:ls", "enter submits the prompt");
  s = { ...s, mode: { kind: "confirm", purpose: "stop", label: "", payload: "vm_1" } };
  check(step(k("n")) === "cancelled", "anything but y cancels");
  s = { ...s, mode: { kind: "confirm", purpose: "stop", label: "", payload: "vm_1" } };
  check(step(k("y")) === "confirm:stop:vm_1", "y confirms");
  step(k("?"));
  check(s.mode.kind === "help", "? opens help");
  step(k("x"));
  check(s.mode.kind === "list", "any key closes help");
  check(step(k("q")) === "quit", "q quits");
  console.log("ok");
}
