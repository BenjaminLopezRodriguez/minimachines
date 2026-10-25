/**
 * TUI bot mode: a pixel pet you text. Every message goes to your local Claude
 * Code (headless) working in the current folder, so "add a test for x" really
 * edits files; the conversation carries over between messages. The pet
 * reacts: thinks while it works, is happy when it lands something, sad when
 * it fails, sleepy when ignored. Mood, energy and level persist in pet.json.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { Box, Text, useInput } from "ink";
import { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";

import { addCard } from "./board.js";
import { connect, projectForDir } from "./sync.js";

type Api = (method: string, path: string, body?: unknown) => Promise<Response>;
const BRAND = "#6f8cff";

// --- the pet ------------------------------------------------------------------

export type Mood = "idle" | "blink" | "think" | "happy" | "sad" | "sleep";

/** 16×14 pixels; two pixel rows per terminal row via half blocks. Inner face is cols 3–12. */
const BODY = [
  ".......AA.......",
  ".......DD.......",
  "...BBBBBBBBBB...",
  "..BBBBBBBBBBBB..",
  "..BWWWWWWWWWWB..",
  "..B~~~~~~~~~~B..", // eyes, row 1
  "..B~~~~~~~~~~B..", // eyes, row 2
  "..BWWWWWWWWWWB..",
  "..B~~~~~~~~~~B..", // mouth, row 1
  "..B~~~~~~~~~~B..", // mouth, row 2
  "..BBBBBBBBBBBB..",
  "...DDDDDDDDDD...",
  "...BB......BB...",
  "...DD......DD...",
];
const FACES: Record<Mood, [string, string, string, string]> = {
  idle: ["WGKWWWWGKW", "WKKWWWWKKW", "PWKWWWWKWP", "WWWKKKKWWW"],
  blink: ["WWWWWWWWWW", "WKKWWWWKKW", "PWKWWWWKWP", "WWWKKKKWWW"],
  think: ["WWWGKWWWGK", "WWWKKWWWKK", "PWWWWKKWWP", "WWWWWKKWWW"],
  happy: ["WWKWWWWKWW", "WKWKWWKWKW", "PWKWWWWKWP", "WWWKKKKWWW"],
  sad: ["WWWWWWWWWW", "WKKWWWWKKW", "PWWKKKKWWP", "WWKWWWWKWW"],
  sleep: ["WWWWWWWWWW", "WKKWWWWKKW", "PWWWKKWWWP", "WWWWWWWWWW"],
};
const PALETTE: Record<string, string> = {
  B: BRAND,
  D: "#3558f5",
  W: "#e8ecff",
  K: "#0d0f14",
  G: "#ffffff",
  P: "#ff8fb1",
  A: "#facc15",
  a: "#3558f5", // antenna off (blinks while working)
};

export function sprite(mood: Mood, frame: number): string[] {
  const [e1, e2, m1, m2] = FACES[mood];
  const rows = BODY.map((r, i) =>
    i === 5 ? r.replace("~~~~~~~~~~", e1) : i === 6 ? r.replace("~~~~~~~~~~", e2) : i === 8 ? r.replace("~~~~~~~~~~", m1) : i === 9 ? r.replace("~~~~~~~~~~", m2) : r,
  );
  if (mood === "think" && frame % 2) rows[0] = rows[0]!.replace("AA", "aa");
  // A gentle bob: one pixel down on odd frames (not while asleep).
  return mood !== "sleep" && frame % 2 ? ["................", ...rows.slice(0, -1)] : [...rows, "................"].slice(0, 14);
}

function Pet({ mood, frame }: { mood: Mood; frame: number }) {
  const px = sprite(mood, frame);
  const lines: React.ReactNode[] = [];
  for (let y = 0; y < px.length; y += 2) {
    const top = px[y]!;
    const bot = px[y + 1] ?? "................";
    lines.push(
      <Text key={y}>
        {[...top].map((t, x) => {
          const fg = PALETTE[t];
          const bg = PALETTE[bot[x]!];
          if (!fg && !bg) return " ";
          if (fg && !bg) return <Text key={x} color={fg}>▀</Text>;
          if (!fg && bg) return <Text key={x} color={bg}>▄</Text>;
          return <Text key={x} color={fg} backgroundColor={bg}>▀</Text>;
        })}
      </Text>,
    );
  }
  return <Box flexDirection="column">{lines}</Box>;
}

// --- persistence ------------------------------------------------------------------

type PetState = { name: string; xp: number; tasks: number; mood: number; energy: number; born: number; lastSeen: number };
const fresh = (): PetState => ({ name: "Byte", xp: 0, tasks: 0, mood: 3, energy: 4, born: Date.now(), lastSeen: Date.now() });

function loadPet(file: string): PetState {
  try {
    const p = { ...fresh(), ...(JSON.parse(readFileSync(file, "utf8")) as Partial<PetState>) };
    // Rest restores energy: one point per ten minutes away.
    p.energy = Math.min(5, p.energy + Math.floor((Date.now() - p.lastSeen) / 600_000));
    return p;
  } catch {
    return fresh();
  }
}
const clamp = (n: number) => Math.max(1, Math.min(5, n));
export const level = (xp: number) => 1 + Math.floor(Math.sqrt(xp / 20));

// --- the brain: local Claude Code, one session per conversation ---------------------

type Step = { kind: "step" | "text"; text: string };

function claudeTurn(opts: { prompt: string; session: string; resume: boolean; name: string; onStep: (s: Step) => void }): { child: ChildProcess; done: Promise<string> } {
  const persona =
    `You are ${opts.name}, a small pixel pet that lives in the minimachines terminal and helps with the project in the current folder. ` +
    "Reply in one to four short, warm sentences. When asked to do something, do it with your tools, then say what you did. " +
    "You can read and edit files in this folder; if a task needs commands you can't run, say which command the user should run.";
  const args = ["-p", opts.prompt, "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits", "--append-system-prompt", persona, ...(opts.resume ? ["--resume", opts.session] : ["--session-id", opts.session])];
  const child = spawn("claude", args, { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], env: process.env });
  const done = new Promise<string>((resolve, reject) => {
    let buf = "";
    let result = "";
    let failure = "";
    let err = "";
    child.stdout!.on("data", (d: Buffer) => {
      buf += d;
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        try {
          const ev = JSON.parse(line) as { type: string; is_error?: boolean; result?: string; message?: { content?: { type: string; text?: string; name?: string; input?: Record<string, unknown> }[] } };
          if (ev.type === "result" && ev.result) (ev.is_error ? (failure = ev.result) : (result = ev.result));
          if (ev.type !== "assistant") continue;
          for (const c of ev.message?.content ?? []) {
            if (c.type === "tool_use") opts.onStep({ kind: "step", text: `${c.name} ${String(c.input?.file_path ?? c.input?.command ?? c.input?.pattern ?? "").split("\n")[0]!.slice(0, 70)}` });
          }
        } catch {
          // non-JSON noise
        }
      }
    });
    child.stderr!.on("data", (d: Buffer) => (err += d));
    child.on("error", (e) => reject(new Error(/ENOENT/.test(String(e)) ? "Claude Code isn't installed (npm i -g @anthropic-ai/claude-code)" : e.message)));
    child.on("close", (code, signal) => {
      if (signal) return reject(new Error("stopped"));
      if (failure) return reject(new Error(failure));
      if (code !== 0) return reject(new Error(err.trim().split("\n").slice(-2).join(" ") || `claude exited with ${code}`));
      resolve(result.trim() || "Done.");
    });
  });
  return { child, done };
}

// --- the screen ---------------------------------------------------------------------

type Msg = { from: "you" | "pet" | "step" | "note"; text: string };

export function BotMode(props: { api: Api; configDir: string; onExit: () => void; width: number; height: number }) {
  const file = join(props.configDir, "pet.json");
  const [pet, setPet] = useState<PetState>(() => loadPet(file));
  const [mood, setMood] = useState<Mood>("idle");
  const [frame, setFrame] = useState(0);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>(() => [{ from: "pet", text: `Hi! I'm ${loadPet(file).name}. Tell me what to do in this folder and I'll get on it.` }]);
  const [session, setSession] = useState(() => ({ id: randomUUID(), started: false }));
  const child = useRef<ChildProcess | null>(null);
  const lastTouch = useRef(Date.now());
  const moodUntil = useRef(0);

  const save = useCallback(
    (next: PetState) => {
      setPet(next);
      try {
        mkdirSync(props.configDir, { recursive: true });
        writeFileSync(file, JSON.stringify({ ...next, lastSeen: Date.now() }, null, 2));
      } catch {
        // a read-only home dir just means the pet forgets
      }
    },
    [file, props.configDir],
  );

  // Animation clock: bob, blink now and then, fall asleep when ignored.
  useEffect(() => {
    const t = setInterval(() => {
      setFrame((f) => f + 1);
      if (busy || Date.now() < moodUntil.current) return;
      if (Date.now() - lastTouch.current > 90_000) return setMood("sleep");
      setMood(Math.random() < 0.12 ? "blink" : "idle");
    }, 450);
    return () => clearInterval(t);
  }, [busy]);
  useEffect(() => () => void child.current?.kill("SIGTERM"), []); // leaving the screen stops a running task

  const say = (m: Msg) => setMsgs((list) => [...list, m].slice(-200));
  const react = (m: Mood, ms = 4000) => {
    setMood(m);
    moodUntil.current = Date.now() + ms;
  };

  const addTask = async (title: string) => {
    const id = await projectForDir(props.api, process.cwd());
    if (!id) return say({ from: "note", text: "No project for this folder yet — share it with `mm up` first." });
    const doc = new Y.Doc();
    const { provider } = await connect(props.api, id, doc);
    const card = addCard(doc, { title, column: "ready", by: pet.name });
    await new Promise((r) => setTimeout(r, 600));
    provider.destroy();
    say({ from: "pet", text: `Put "${title}" on the whiteboard as #${card} — an agent running \`mm board work\` will pick it up.` });
    react("happy");
  };

  const send = async (text: string) => {
    lastTouch.current = Date.now();
    const [cmd, ...rest] = text.split(" ");
    const arg = rest.join(" ").trim();
    if (cmd === "/help") {
      return say({ from: "note", text: "Type a task and press enter. /task <title> adds a card to the whiteboard · /name <name> · /feed · /new starts a fresh conversation · esc goes home (and stops a running task)" });
    }
    if (cmd === "/name" && arg) return (save({ ...pet, name: arg.slice(0, 20) }), say({ from: "pet", text: `${arg.slice(0, 20)}! I love it.` }), react("happy"));
    if (cmd === "/feed") return (save({ ...pet, energy: clamp(pet.energy + 2), mood: clamp(pet.mood + 1) }), say({ from: "pet", text: "Mmm, electrons. Thanks!" }), react("happy"));
    if (cmd === "/new") return (setSession({ id: randomUUID(), started: false }), say({ from: "note", text: "Fresh conversation." }));
    if (cmd === "/task") return arg ? void addTask(arg).catch((e: Error) => say({ from: "note", text: e.message })) : say({ from: "note", text: "Usage: /task <what an agent should do>" });

    say({ from: "you", text });
    setBusy(true);
    setMood("think");
    try {
      const turn = claudeTurn({ prompt: text, session: session.id, resume: session.started, name: pet.name, onStep: (s) => say({ from: "step", text: s.text }) });
      child.current = turn.child;
      setSession((s) => ({ ...s, started: true }));
      const reply = await turn.done;
      say({ from: "pet", text: reply });
      save({ ...pet, xp: pet.xp + 10, tasks: pet.tasks + 1, mood: clamp(pet.mood + 1), energy: clamp(pet.energy - 1) });
      react("happy");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const hint = /credit balance|ANTHROPIC_API_KEY|invalid x-api-key/i.test(msg) ? " (If you sign in to Claude with claude.ai, unset ANTHROPIC_API_KEY — it takes precedence.)" : "";
      say({ from: "note", text: msg === "stopped" ? "Stopped." : `That didn't work: ${msg.slice(0, 300)}${hint}` });
      if (msg !== "stopped") save({ ...pet, mood: clamp(pet.mood - 1) });
      react("sad");
    } finally {
      child.current = null;
      setBusy(false);
      lastTouch.current = Date.now();
    }
  };

  useInput((ch, key) => {
    lastTouch.current = Date.now();
    if (key.escape) {
      if (busy) return void child.current?.kill("SIGTERM");
      return props.onExit();
    }
    if (busy) return; // one task at a time
    if (key.return) {
      const text = input.trim();
      setInput("");
      if (text) void send(text);
      return;
    }
    if (key.backspace || key.delete) return setInput((v) => v.slice(0, -1));
    if (ch && !key.ctrl && !key.meta && !/[\x00-\x1f]/.test(ch)) setInput((v) => v + ch);
  });

  const bar = (n: number, color: string) => <Text color={color}>{"●".repeat(n)}<Text dimColor>{"○".repeat(5 - n)}</Text></Text>;
  const lv = level(pet.xp);
  const nextAt = 20 * lv * lv;
  const status =
    mood === "think" ? `${pet.name} is on it…` : mood === "happy" ? "♥ done!" : mood === "sad" ? "hmm, that didn't go well" : mood === "sleep" ? "z z z" : `${pet.name} is ready`;
  const chatRows = Math.max(4, props.height - 15);
  const width = Math.min(props.width - 4, 100);

  // Newest messages that fit, oldest first; long replies are trimmed to keep the pet on screen.
  const shown: Msg[] = [];
  let used = 0;
  for (let i = msgs.length - 1; i >= 0 && used < chatRows; i--) {
    const m = msgs[i]!;
    const lines = Math.min(6, Math.ceil(m.text.length / Math.max(20, width - 12)) + (m.from === "step" ? 0 : 1));
    used += lines;
    shown.unshift(m);
  }

  return (
    <Box flexDirection="column" height={props.height - 1} paddingX={1}>
      <Box borderStyle="round" borderColor={BRAND} paddingX={2} width={width}>
        <Pet mood={mood} frame={frame} />
        <Box flexDirection="column" marginLeft={3} justifyContent="center">
          <Text>
            <Text bold color={BRAND}>{pet.name}</Text>
            <Text dimColor>{`  lv ${lv} · ${pet.tasks} task${pet.tasks === 1 ? "" : "s"} done`}</Text>
          </Text>
          <Text>
            <Text dimColor>{"mood    "}</Text>
            {bar(pet.mood, "#ff8fb1")}
          </Text>
          <Text>
            <Text dimColor>{"energy  "}</Text>
            {bar(pet.energy, "#facc15")}
          </Text>
          <Text>
            <Text dimColor>{"xp      "}</Text>
            <Text color={BRAND}>{`${pet.xp}`}</Text>
            <Text dimColor>{` / ${nextAt}`}</Text>
          </Text>
          <Text color={mood === "sad" ? "red" : mood === "happy" ? "#ff8fb1" : undefined} dimColor={mood === "idle" || mood === "blink" || mood === "sleep"}>
            {`\n${status}`}
          </Text>
        </Box>
      </Box>

      <Box flexDirection="column" flexGrow={1} width={width} marginTop={1}>
        {shown.map((m, i) =>
          m.from === "you" ? (
            <Box key={i} justifyContent="flex-end" width="100%">
              <Box borderStyle="round" borderColor={BRAND} paddingX={1} maxWidth={Math.floor(width * 0.75)}>
                <Text wrap="truncate-end">{m.text}</Text>
              </Box>
            </Box>
          ) : m.from === "pet" ? (
            <Box key={i} borderStyle="round" borderColor="gray" paddingX={1} maxWidth={Math.floor(width * 0.85)}>
              <Text>
                <Text bold color={BRAND}>{`${pet.name}  `}</Text>
                {m.text.length > 600 ? `${m.text.slice(0, 600)}…` : m.text}
              </Text>
            </Box>
          ) : m.from === "step" ? (
            <Text key={i} dimColor wrap="truncate">{`   → ${m.text}`}</Text>
          ) : (
            <Text key={i} color="yellow" wrap="wrap">{`   ${m.text}`}</Text>
          ),
        )}
      </Box>

      <Box borderStyle="round" borderColor={busy ? "gray" : BRAND} paddingX={1} width={width}>
        <Text color={BRAND} bold>{"› "}</Text>
        {busy ? <Text dimColor>working… esc to stop</Text> : input ? <Text>{input}</Text> : <Text dimColor>{`tell ${pet.name} what to do · /task adds to the whiteboard · /help`}</Text>}
        {!busy && <Text inverse> </Text>}
      </Box>
      <Text dimColor>{"  edits files in this folder only · esc home"}</Text>
    </Box>
  );
}
