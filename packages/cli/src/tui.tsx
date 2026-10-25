/**
 * `mm` / `mm tui` — the human entry point. Opens on a home screen (logo +
 * prompt, like opencode): type a task to start the coding agent, `/` for
 * commands, Tab for the dashboard (Machines · Shares · People).
 * `--json` (or `mm --no-tui`) skips the UI and prints each tab as NDJSON.
 */
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { basename } from "node:path";

import { Box, render, Text, useInput, useStdout } from "ink";
import { useCallback, useEffect, useState } from "react";

import { BotMode } from "./bot-mode.js";
import { gitAuthors, repoKeyFromRemote } from "./people.js";
import { WhiteboardMode } from "./whiteboard-mode.js";

type Api = (method: string, path: string, body?: unknown) => Promise<Response>;
export type TuiDeps = {
  api: Api; // throws on non-2xx
  openUrl: (url: string) => Promise<void>;
  /** Hand the terminal to `mm code` (local unless a machine id is given), optionally with a first task. */
  code: (machineId?: string, prompt?: string) => Promise<void>;
  info: { version: string; host: string; model: string };
  openInViewer: (url: string, window?: string) => Promise<"viewer" | "browser">;
  configDir: string;
  baseUrl: string;
};

export const TABS = ["machines", "shares", "people"] as const;
export type Tab = (typeof TABS)[number];

// Cobalt between the site's light (#3558f5) and dark (#9ab0ff) brand tokens, so it reads on either terminal theme.
const BRAND = "#6f8cff";
const OK = "green";
const WARN = "yellow";
const BAD = "red";

type Machine = { id: string; name: string; title: string; status: string; region: string; cpu: number; memoryGb: number; templateId?: string; task?: string; appUrl?: string; emulatorUrl?: string };
type Share = { slug: string; url: string; label: string; access: string; enabled: boolean; port: number | null; machineId: string | null };
type Person = { kind: "member" | "pending" | "team" | "git"; id: string; name: string; contact: string; role?: string; commits?: number; team?: string };
/** Status is always a word plus a symbol, never color alone. */
type Badge = { text: string; color: string };
type Item = { key: string; title: string; badge?: Badge; fields: [string, string][]; raw: Machine | Share | Person };

export const COMMANDS: [string, string][] = [
  ["/bot", "your pet: chat with it and it works in this folder"],
  ["/board", "the project whiteboard: cards, agents, open the canvas"],
  ["/machines", "machine dashboard"],
  ["/shares", "share links"],
  ["/people", "invite people to this project"],
  ["/new", "create a machine"],
  ["/code", "coding agent here · /code <machine-id> for a VM"],
  ["/help", "keys"],
  ["/quit", "exit"],
];

// --- pure state: everything a key can do to navigation lives here -----------

export type Mode =
  | { kind: "list" }
  | { kind: "help" }
  | { kind: "filter" }
  | { kind: "prompt"; purpose: "exec" | "create" | "invite"; label: string; value: string }
  | { kind: "confirm"; purpose: "stop" | "revoke-share" | "remove-person" | "invite" | "add-teammate"; label: string; payload: string };

export type State = { view: "home" | "dash" | "bot" | "board"; input: string; pick: number; tab: Tab; index: number; filter: string; mode: Mode };
export type Key = { input: string; upArrow?: boolean; downArrow?: boolean; leftArrow?: boolean; rightArrow?: boolean; tab?: boolean; return?: boolean; escape?: boolean; backspace?: boolean; delete?: boolean; ctrl?: boolean; meta?: boolean };

export const initialState: State = { view: "home", input: "", pick: 0, tab: "machines", index: 0, filter: "", mode: { kind: "list" } };

export function paletteMatches(input: string): [string, string][] {
  if (!input.startsWith("/")) return [];
  const word = input.split(/\s/)[0]!;
  return COMMANDS.filter(([c]) => c.startsWith(word));
}

const typed = (k: Key) => (k.ctrl || k.meta || !k.input || /[\x00-\x1f]/.test(k.input) ? "" : k.input);

/** Returns the next state and, at most, one named action for the component to run. */
export function reduce(s: State, k: Key, count: number): { state: State; action?: string } {
  const m = s.mode;
  if (s.view === "bot" || s.view === "board") return { state: s }; // those screens read their own keys
  if (m.kind === "help") return { state: { ...s, mode: { kind: "list" } } }; // any key closes help

  if (s.view === "home") {
    const matches = paletteMatches(s.input);
    if (k.escape) return { state: { ...s, input: "", pick: 0 } };
    if (k.upArrow || k.downArrow) {
      const n = Math.max(1, matches.length);
      return { state: { ...s, pick: (s.pick + (k.downArrow ? 1 : -1) + n) % n } };
    }
    if (k.tab) {
      // In the palette Tab completes; otherwise it opens the dashboard.
      const pick = matches[s.pick];
      return pick ? { state: { ...s, input: `${pick[0]} `, pick: 0 } } : { state: { ...s, view: "dash" } };
    }
    if (k.return) {
      const text = s.input.trim();
      if (!text) return { state: s };
      const next = { ...s, input: "", pick: 0 };
      if (!text.startsWith("/")) return { state: next, action: `agent:${text}` };
      const [word = "", ...rest] = text.split(/\s+/);
      const cmd = COMMANDS.some(([c]) => c === word) ? word : (matches[s.pick]?.[0] ?? word);
      return { state: next, action: `cmd:${cmd}${rest.length ? ` ${rest.join(" ")}` : ""}` };
    }
    if (k.backspace || k.delete) return { state: { ...s, input: s.input.slice(0, -1), pick: 0 } };
    const ch = typed(k);
    return ch ? { state: { ...s, input: s.input + ch, pick: 0 } } : { state: s };
  }

  if (m.kind === "filter" || m.kind === "prompt") {
    const value = m.kind === "filter" ? s.filter : m.value;
    if (k.escape) return { state: { ...s, mode: { kind: "list" }, ...(m.kind === "filter" ? { filter: "" } : {}) } };
    if (k.return) return m.kind === "filter" ? { state: { ...s, mode: { kind: "list" } } } : { state: { ...s, mode: { kind: "list" } }, action: `submit:${m.purpose}:${m.value}` };
    const next = k.backspace || k.delete ? value.slice(0, -1) : value + typed(k);
    return m.kind === "filter" ? { state: { ...s, filter: next, index: 0 } } : { state: { ...s, mode: { ...m, value: next } } };
  }
  if (m.kind === "confirm") {
    return { state: { ...s, mode: { kind: "list" } }, action: k.input === "y" ? `confirm:${m.purpose}:${m.payload}` : "cancelled" };
  }
  const move = (d: number) => ({ state: { ...s, index: Math.max(0, Math.min(count - 1, s.index + d)) } });
  const switchTab = (d: number) => ({ state: { ...s, tab: TABS[(TABS.indexOf(s.tab) + d + TABS.length) % TABS.length]!, index: 0, filter: "" } });
  if (k.escape) return { state: { ...s, view: "home", filter: "" } };
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

function originKey(): string | null {
  try {
    return repoKeyFromRemote(execFileSync("git", ["remote", "get-url", "origin"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim());
  } catch {
    return null;
  }
}

/** This folder's project: by git origin, else by folder name (as `mm people` creates it). id "" = none yet. */
async function repoProject(api: Api): Promise<{ id: string; name: string }> {
  const key = originKey();
  const name = key ? basename(key) : basename(process.cwd());
  const { projects } = (await (await api("GET", "/api/v1/projects")).json()) as { projects: { id: string; name: string; repoKey: string | null }[] };
  return projects.find((p) => (key ? p.repoKey === key : p.name === name && !p.repoKey)) ?? { id: "", name };
}

function machineBadge(status: string): Badge {
  if (status === "running") return { text: "● running", color: OK };
  if (status === "error") return { text: "✕ error", color: BAD };
  if (status === "stopped") return { text: "○ stopped", color: "gray" };
  return { text: `◐ ${status}`, color: WARN };
}

export async function load(api: Api, tab: Tab): Promise<{ items: Item[]; projectId?: string; note?: string }> {
  if (tab === "machines") {
    const { machines } = (await (await api("GET", "/api/v1/machines")).json()) as { machines: Machine[] };
    return {
      items: machines.map((m) => ({
        key: m.id,
        title: m.name,
        badge: machineBadge(m.status),
        fields: [["id", m.id], ["template", m.templateId ?? "—"], ["size", `${m.cpu} cpu · ${m.memoryGb} GB`], ["region", m.region], ["task", m.task ?? "—"], ["app", m.appUrl ?? "—"], ["console", m.emulatorUrl ? "enter to open" : "—"]],
        raw: m,
      })),
    };
  }
  if (tab === "shares") {
    const { shares } = (await (await api("GET", "/api/v1/shares")).json()) as { shares: Share[] };
    return {
      items: shares.map((x) => ({
        key: x.slug,
        title: x.label || x.slug,
        badge: x.enabled ? { text: "● live", color: OK } : { text: "○ revoked", color: "gray" },
        fields: [["url", x.url], ["access", x.access], ["machine", x.machineId ?? "local"], ["port", String(x.port ?? "—")]],
        raw: x,
      })),
    };
  }
  const project = await repoProject(api);
  const people: Person[] = [];
  if (project?.id) {
    const p = (await (await api("GET", `/api/v1/projects/${project.id}/people`)).json()) as {
      members: { principal: string; name: string; email: string | null; role: string }[];
      pending: { id: string; contact: string; role: string }[];
    };
    for (const m of p.members) people.push({ kind: "member", id: m.principal, name: m.name, contact: m.email ?? "", role: m.role });
    for (const x of p.pending) people.push({ kind: "pending", id: x.id, name: x.contact, contact: x.contact, role: x.role });
  }
  const known = new Set(people.flatMap((x) => [x.contact.toLowerCase(), x.id]));
  // Teammates with accounts (from the website) before git authors; + adds them directly.
  const teamRes = await api("GET", "/api/v1/orgs").catch(() => null);
  const { teammates = [] } = teamRes?.ok ? ((await teamRes.json()) as { teammates?: { userId: string; name: string; email: string | null; team: string }[] }) : {};
  for (const t of teammates) {
    if (known.has(t.userId) || (t.email && known.has(t.email.toLowerCase()))) continue;
    people.push({ kind: "team", id: t.userId, name: t.name, contact: t.email ?? "", team: t.team });
    if (t.email) known.add(t.email.toLowerCase());
  }
  for (const a of gitAuthors()) if (!known.has(a.email)) people.push({ kind: "git", id: a.email, name: a.name, contact: a.usable ? a.email : "", commits: a.commits });
  return {
    projectId: project?.id || undefined,
    note: !project.id ? `no project for ${project.name} yet — press + to invite someone and create it` : undefined,
    items: people.map((x) => ({
      key: `${x.kind}:${x.id}`,
      title: x.name,
      badge:
        x.kind === "member" ? { text: `■ ${x.role}`, color: OK }
        : x.kind === "pending" ? { text: "◇ invited", color: WARN }
        : x.kind === "team" ? { text: "◆ teammate", color: BRAND }
        : { text: `· ${x.commits} commits`, color: "gray" },
      fields: [
        ["contact", x.contact || (x.kind === "git" ? "github noreply — type an email" : "—")],
        ["role", x.role ?? (x.kind === "team" ? "+ adds them directly" : "—")],
        ["source", x.kind === "git" ? "git log (12 mo)" : x.kind === "team" ? `team: ${x.team}` : "project"],
      ],
      raw: x,
    })),
  };
}

// --- look -------------------------------------------------------------------

const GLYPHS: Record<string, [string, string, string]> = {
  M: ["█▄ ▄█", "█ ▀ █", "▀   ▀"],
  I: ["█", "█", "▀"],
  N: ["█▄  █", "█ ▀▄█", "▀   ▀"],
  A: ["▄▀▀▄", "█▀▀█", "▀  ▀"],
  C: ["▄▀▀▀", "█   ", " ▀▀▀"],
  H: ["█  █", "█▀▀█", "▀  ▀"],
  E: ["█▀▀▀", "█▀▀ ", "▀▀▀▀"],
  S: ["▄▀▀▀", " ▀▀▄", "▀▀▀ "],
};
const word = (w: string, row: number) => [...w].map((c) => GLYPHS[c]![row]).join(" ");

/** "mini" muted, "machines" in brand — the opencode two-tone treatment. */
function Logo({ width }: { width: number }) {
  if (width < 62) return <Text bold color={BRAND}>mm</Text>;
  return (
    <Box flexDirection="column">
      {[0, 1, 2].map((r) => (
        <Text key={r}>
          <Text color="gray">{word("MINI", r)} </Text>
          <Text color={BRAND} bold>{word("MACHINES", r)}</Text>
        </Text>
      ))}
    </Box>
  );
}

function Hints({ items }: { items: [string, string][] }) {
  return (
    <Text wrap="truncate">
      {items.map(([k, v], i) => (
        <Text key={k}>
          {i ? "   " : ""}
          <Text color={BRAND}>{k}</Text>
          <Text dimColor> {v}</Text>
        </Text>
      ))}
    </Text>
  );
}

function InputBox({ prefix, value, placeholder, focus = true }: { prefix: string; value: string; placeholder?: string; focus?: boolean }) {
  return (
    <Box borderStyle="round" borderColor={focus ? BRAND : "gray"} paddingX={1}>
      <Text color={BRAND} bold>{prefix} </Text>
      {value ? <Text>{value}</Text> : <Text dimColor>{placeholder}</Text>}
      <Text inverse> </Text>
    </Box>
  );
}

const HELP: [string, [string, string][]][] = [
  ["Home", [["type", "a task for the coding agent"], ["/", "commands"], ["/bot", "your pet"], ["/board", "whiteboard"], ["tab", "dashboard"], ["esc", "clear"], ["ctrl+c", "quit"]]],
  ["Dashboard", [["j k ↑ ↓", "move"], ["h l ← → tab", "switch tab"], ["enter", "open console / link"], ["/", "filter"], ["r", "refresh"], ["esc", "home"], ["q", "quit"]]],
  ["Machines", [["n", "new"], ["x", "run a command"], ["o", "open app"], ["c", "coding agent on it"], ["s", "stop"]]],
  ["Shares · People", [["d", "revoke link"], ["+", "invite"], ["-", "revoke / remove"]]],
];

function Help() {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={BRAND} paddingX={2} paddingY={1}>
      <Text bold color={BRAND}>keys <Text dimColor>· any key to close</Text></Text>
      {HELP.map(([section, keys]) => (
        <Box key={section} flexDirection="column" marginTop={1}>
          <Text bold>{section}</Text>
          {keys.map(([k, v]) => (
            <Text key={k}>  <Text color={BRAND}>{k.padEnd(13)}</Text><Text dimColor>{v}</Text></Text>
          ))}
        </Box>
      ))}
    </Box>
  );
}

const TAB_HINTS: Record<Tab, [string, string][]> = {
  machines: [["n", "new"], ["x", "exec"], ["c", "code"], ["s", "stop"], ["enter", "console"]],
  shares: [["enter", "open"], ["d", "revoke"]],
  people: [["+", "invite"], ["-", "revoke"]],
};

// --- app --------------------------------------------------------------------

function App({ deps, exit, startView }: { deps: TuiDeps; exit: (after?: () => Promise<void>) => void; startView?: State["view"] }) {
  const { stdout } = useStdout();
  const width = stdout.columns || 80; // a pty can report 0
  const height = stdout.rows || 24;
  const [state, setState] = useState<State>({ ...initialState, view: startView ?? "home" });
  const [data, setData] = useState<{ items: Item[]; projectId?: string; note?: string }>({ items: [] });
  const [status, setStatus] = useState("loading…");
  const [output, setOutput] = useState<Record<string, string>>({});
  const [fleet, setFleet] = useState<string>("");

  const refresh = useCallback(async (tab: Tab) => {
    setStatus("loading…");
    try {
      const d = await load(deps.api, tab);
      setData(d);
      setStatus(d.note ?? "ready");
      if (tab === "machines") {
        const running = d.items.filter((i) => (i.raw as Machine).status === "running").length;
        setFleet(`${running} running · ${d.items.length} machine${d.items.length === 1 ? "" : "s"}`);
      }
    } catch (err) {
      setData({ items: [] });
      setStatus(`error: ${err instanceof Error ? err.message : err}`);
      setFleet("offline");
    }
  }, [deps.api]);
  useEffect(() => void refresh(state.tab), [state.tab, refresh]);

  const items = data.items.filter((i) => !state.filter || `${i.title} ${i.badge?.text ?? ""}`.toLowerCase().includes(state.filter.toLowerCase()));
  const sel = items[Math.min(state.index, items.length - 1)];

  const act = async (action: string) => {
    const machine = state.tab === "machines" ? (sel?.raw as Machine | undefined) : undefined;
    const share = state.tab === "shares" ? (sel?.raw as Share | undefined) : undefined;
    const person = state.tab === "people" ? (sel?.raw as Person | undefined) : undefined;
    const ask = (mode: Mode) => setState((s) => ({ ...s, view: "dash", mode }));
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
    const [kind = "", ...restParts] = action.split(":");
    const rest = restParts.join(":");
    if (kind === "agent") return exit(() => deps.code(undefined, rest));
    if (kind === "cmd") {
      const [cmd, ...args] = rest.split(" ");
      const tab = cmd?.slice(1) as Tab;
      if (TABS.includes(tab)) return setState((s) => ({ ...s, view: "dash", tab, index: 0 }));
      if (cmd === "/bot") return setState((s) => ({ ...s, view: "bot" }));
      if (cmd === "/board") return setState((s) => ({ ...s, view: "board" }));
      if (cmd === "/new") return setState((s) => ({ ...s, view: "dash", tab: "machines", mode: { kind: "prompt", purpose: "create", label: "template", value: "node-ts" } }));
      if (cmd === "/code") return exit(() => deps.code(args[0]));
      if (cmd === "/help") return setState((s) => ({ ...s, mode: { kind: "help" } }));
      if (cmd === "/quit") return exit();
      return setStatus(`unknown command ${cmd}`);
    }
    const [purpose = "", ...argParts] = rest.split(":");
    const arg = argParts.join(":");
    if (action === "quit") return exit();
    if (action === "refresh") return refresh(state.tab);
    if (action === "cancelled") return setStatus("cancelled");
    if (action === "open") {
      const url = machine?.emulatorUrl ?? share?.url;
      return url ? void deps.openUrl(url).then(() => setStatus(`opened ${url}`)) : setStatus("nothing to open");
    }
    if (kind === "key") {
      if (state.tab === "machines") {
        if (purpose === "n") return ask({ kind: "prompt", purpose: "create", label: "template", value: "node-ts" });
        if (!machine) return setStatus("no machine selected");
        if (purpose === "x") return ask({ kind: "prompt", purpose: "exec", label: `$ ${machine.name}`, value: "" });
        if (purpose === "o") return machine.appUrl ? void deps.openUrl(machine.appUrl) : setStatus("no app url");
        if (purpose === "c") return exit(() => deps.code(machine.id));
        if (purpose === "s") return ask({ kind: "confirm", purpose: "stop", label: `stop ${machine.name}?`, payload: machine.id });
      }
      if (state.tab === "shares" && purpose === "d" && share) return ask({ kind: "confirm", purpose: "revoke-share", label: `revoke ${share.url}?`, payload: share.slug });
      if (state.tab === "people") {
        if (purpose === "+" && person?.kind === "team") return ask({ kind: "confirm", purpose: "add-teammate", label: `add ${person.name} to this project? (they get an email)`, payload: person.id });
        if (purpose === "+") return ask({ kind: "prompt", purpose: "invite", label: "invite", value: person?.kind === "git" ? person.contact : "" });
        if (purpose === "-" && person && (person.kind === "member" || person.kind === "pending") && person.role !== "owner")
          return ask({ kind: "confirm", purpose: "remove-person", label: `${person.kind === "pending" ? "revoke invite for" : "remove"} ${person.name}?`, payload: `${person.kind}|${person.id}` });
      }
      return setStatus(`${purpose} does nothing here — ? for keys`);
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
      if (purpose === "invite") return ask({ kind: "confirm", purpose: "invite", label: `send an invite to ${arg.trim()}?`, payload: arg.trim() });
    }
    if (kind === "confirm") {
      if (purpose === "stop") return run("stop", async () => void (await deps.api("POST", `/api/v1/machines/${arg}/stop`)));
      if (purpose === "revoke-share") return run("revoke", async () => void (await deps.api("DELETE", `/api/v1/shares/${arg}`)));
      if (purpose === "invite") return run("invite", async () => {
        const [contact = "", view] = arg.split(/\s+/);
        const projectId = data.projectId ?? (await createProject(deps.api));
        const c = contact.includes("@") ? { email: contact } : { phone: contact.replace(/[\s().-]/g, "") };
        const { invites } = (await (await deps.api("POST", `/api/v1/projects/${projectId}/invites`, { contacts: [c], role: view === "view" ? "viewer" : "member" })).json()) as { invites: { status: string; error?: string }[] };
        const r = invites[0];
        return r?.status === "sent" ? `invite sent to ${contact}` : r?.status === "handoff" ? `not sent by the server — run mm people + ${contact}` : `invite failed: ${r?.error ?? r?.status}`;
      });
      if (purpose === "add-teammate") return run("add", async () => {
        const projectId = data.projectId ?? (await createProject(deps.api));
        const res = await deps.api("POST", `/api/v1/projects/${projectId}/members`, { userIds: [arg] });
        const body = (await res.json()) as { members?: { status: string; error?: string }[]; error?: { message: string } };
        const m = body.members?.[0];
        return m?.status === "added" ? "added — they'll get an email with the link" : m?.status === "already" ? "already in this project" : `add failed: ${m?.error ?? body.error?.message ?? res.status}`;
      });
      if (purpose === "remove-person" && data.projectId) return run("remove", async () => {
        const [k, id = ""] = arg.split("|");
        await deps.api("DELETE", k === "pending" ? `/api/v1/projects/${data.projectId}/invites/${id}` : `/api/v1/projects/${data.projectId}/members/${encodeURIComponent(id)}`);
      });
    }
  };

  useInput(
    (input, key) => {
      const { state: next, action } = reduce(state, { input, ...key }, items.length);
      setState(next);
      if (action) void act(action);
    },
    { isActive: state.view === "home" || state.view === "dash" },
  );

  const cwd = process.cwd().replace(homedir(), "~");
  const footer = (
    <Box justifyContent="space-between" width="100%">
      <Box flexShrink={1} flexGrow={1}><Text dimColor wrap="truncate">{`${cwd}  ·  ${deps.info.model}  ·  ${fleet || "…"}`}</Text></Box>
      <Text dimColor>{`  ${deps.info.host}`}</Text>
    </Box>
  );

  if (state.mode.kind === "help") return <Help />;
  const goHome = () => setState((s) => ({ ...s, view: "home", input: "" }));
  if (state.view === "bot") return <BotMode api={deps.api} configDir={deps.configDir} openInViewer={deps.openInViewer} onExit={goHome} width={width} height={height} />;
  if (state.view === "board") return <WhiteboardMode api={deps.api} baseUrl={deps.baseUrl} openInViewer={deps.openInViewer} onExit={goHome} width={width} height={height} />;

  if (state.view === "home") {
    const matches = paletteMatches(state.input);
    return (
      <Box flexDirection="column" height={height - 1} paddingX={2}>
        <Box flexDirection="column" alignItems="center" flexGrow={1} justifyContent="center">
          <Logo width={width} />
          <Text dimColor>{`v${deps.info.version} · remote machines for your agents`}</Text>
          <Box flexDirection="column" marginTop={1} display={matches.length ? "none" : "flex"}>
            {COMMANDS.slice(0, 6).map(([c, d]) => (
              <Text key={c}><Text color={BRAND}>{c.padEnd(11)}</Text><Text dimColor>{d}</Text></Text>
            ))}
          </Box>
        </Box>
        {matches.length > 0 && (
          <Box flexDirection="column" paddingX={2}>
            {matches.map(([c, d], i) => (
              i === state.pick ? (
                <Text key={c} backgroundColor={BRAND} color="white" bold>{` ${c.padEnd(11)}${d} `}</Text>
              ) : (
                <Text key={c}>{` ${c.padEnd(11)}`}<Text dimColor>{d} </Text></Text>
              )
            ))}
          </Box>
        )}
        <InputBox prefix="›" value={state.input} placeholder="ask the coding agent anything, or / for commands" />
        <Box justifyContent="space-between" paddingX={1}>
          <Hints items={[["enter", "send"], ["/", "commands"], ["tab", "dashboard"], ["ctrl+c", "quit"]]} />
        </Box>
        <Box paddingX={1}>{footer}</Box>
      </Box>
    );
  }

  const rows = Math.max(5, height - 9);
  const start = Math.max(0, Math.min(state.index - Math.floor(rows / 2), items.length - rows));
  const m = state.mode;
  const listWidth = Math.min(44, Math.max(28, Math.floor(width * 0.38)));

  return (
    <Box flexDirection="column" height={height - 1} paddingX={1}>
      <Box width="100%" justifyContent="space-between">
        <Text>
          <Text bold color={BRAND}>mm  </Text>
          {TABS.map((t) => (t === state.tab ? <Text key={t} backgroundColor={BRAND} color="white" bold>{` ${t} `}</Text> : <Text key={t} dimColor>{`  ${t}  `}</Text>))}
        </Text>
        <Text dimColor>{state.filter ? `filter: ${state.filter}  ` : ""}? keys  esc home</Text>
      </Box>
      <Box flexGrow={1}>
        <Box flexDirection="column" width={listWidth} borderStyle="round" borderColor={BRAND} paddingX={1}>
          {items.length === 0 && (
            <Text dimColor>
              {status === "loading…"
                ? "loading…"
                : (data.note ??
                  (state.tab === "machines" ? "No machines yet — press n to create one." : state.tab === "shares" ? "No share links yet — mm share create --machine <id>" : "nothing here yet"))}
            </Text>
          )}
          {items.slice(start, start + rows).map((it, i) => {
            const on = start + i === state.index;
            const badgeW = it.badge?.text.length ?? 0;
            return (
              <Box key={it.key}>
                <Text color={BRAND}>{on ? "▌" : " "}</Text>
                <Box flexGrow={1}><Text bold={on} wrap="truncate">{` ${it.title}`}</Text></Box>
                {it.badge && <Text color={it.badge.color}>{it.badge.text.slice(0, Math.max(0, listWidth - 8)).padStart(badgeW)}</Text>}
              </Box>
            );
          })}
        </Box>
        <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor="gray" paddingX={1}>
          {sel ? (
            <>
              <Text bold>{sel.title} {sel.badge && <Text color={sel.badge.color}>{sel.badge.text}</Text>}</Text>
              <Box flexDirection="column" marginTop={1}>
                {sel.fields.map(([k, v]) => (
                  <Text key={k} wrap="truncate"><Text dimColor>{k.padEnd(10)}</Text>{v}</Text>
                ))}
              </Box>
              {output[sel.key] && (
                <Box marginTop={1} borderStyle="single" borderColor="gray" borderLeft borderRight={false} borderTop={false} borderBottom={false} paddingLeft={1}>
                  <Text>{output[sel.key]!.trimEnd().split("\n").slice(-Math.max(3, rows - sel.fields.length - 4)).join("\n")}</Text>
                </Box>
              )}
            </>
          ) : (
            <Text dimColor>—</Text>
          )}
        </Box>
      </Box>
      {m.kind === "prompt" ? (
        <InputBox prefix={m.label} value={m.value} placeholder="enter to run · esc to cancel" />
      ) : m.kind === "filter" ? (
        <InputBox prefix="/" value={state.filter} placeholder="filter" />
      ) : m.kind === "confirm" ? (
        <Box borderStyle="round" borderColor={WARN} paddingX={1}><Text color={WARN}>{m.label}</Text><Text dimColor>  y to confirm · any other key cancels</Text></Box>
      ) : (
        <Box paddingX={1} justifyContent="space-between">
          <Hints items={TAB_HINTS[state.tab]} />
          <Text dimColor wrap="truncate">{` ${items.length} · ${status}`}</Text>
        </Box>
      )}
      <Box paddingX={1}>{footer}</Box>
    </Box>
  );
}

async function createProject(api: Api): Promise<string> {
  const repoKey = originKey() ?? undefined;
  const name = repoKey ? basename(repoKey) : basename(process.cwd());
  const { project } = (await (await api("PUT", "/api/v1/projects", { name, repoKey })).json()) as { project: { id: string } };
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
  const startView = argv.includes("--bot") ? "bot" : argv.includes("--board") ? "board" : undefined;
  const app = render(<App deps={deps} startView={startView} exit={(fn) => { after = fn; app.unmount(); }} />);
  await app.waitUntilExit();
  if (after) await after(); // hand the terminal to `mm code`
}

/** `mm tui --test`: drives the key reducer through a session and asserts each step. */
function selfCheck() {
  const k = (input: string, extra: Partial<Key> = {}): Key => ({ input, ...extra });
  let s: State = initialState;
  const step = (key: Key, count = 3) => {
    const r = reduce(s, key, count);
    s = r.state;
    return r.action;
  };
  const check = (ok: boolean, what: string) => {
    if (!ok) throw new Error(`tui self-check failed: ${what}`);
  };
  // home
  for (const c of "fix the build") step(k(c));
  check(s.view === "home" && s.input === "fix the build", "home types into the prompt (q and j included)");
  check(step(k("", { return: true })) === "agent:fix the build" && s.input === "", "enter sends a task to the agent");
  step(k("/")); step(k("p"));
  check(paletteMatches(s.input).length === 1, "palette filters as you type");
  step(k("", { tab: true }));
  check(s.input === "/people ", "tab completes the command");
  check(step(k("", { return: true })) === "cmd:/people", "enter runs it");
  step(k("/")); step(k("", { downArrow: true }));
  check(step(k("", { return: true })) === "cmd:/board", "arrows pick from the palette");
  step(k("/")); step(k("b"));
  check(paletteMatches(s.input).length === 2, "/b offers bot and board");
  check(step(k("", { return: true })) === "cmd:/bot", "enter takes the first match");
  s = { ...s, view: "bot" };
  check(reduce(s, k("q"), 3).action === undefined && reduce(s, k("q"), 3).state === s, "bot mode owns its keys (q doesn't quit)");
  s = { ...s, view: "home", input: "" };
  step(k("/")); step(k("c")); step(k("o")); step(k("d")); step(k("e")); step(k(" ")); step(k("v")); step(k("m"));
  check(step(k("", { return: true })) === "cmd:/code vm", "command arguments pass through");
  step(k("x")); step(k("", { escape: true }));
  check(s.input === "", "esc clears the prompt");
  step(k("", { tab: true }));
  check(s.view === "dash", "tab on an empty prompt opens the dashboard");
  // dashboard
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
  step(k("", { escape: true }));
  check(s.view === "home", "esc goes home from the dashboard");
  s = { ...s, view: "dash" };
  check(step(k("q")) === "quit", "q quits from the dashboard");
  console.log("ok");
}
