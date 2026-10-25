/**
 * The bot's brain, shared by both faces (the TUI screen and the desktop
 * window): the pet's state, the conversation, and the work. Each message runs
 * your local Claude Code headless in the current folder (edits only), one
 * session per conversation. Faces subscribe to state and call send/stop.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import * as Y from "yjs";

import { addCard } from "./board.js";
import { connect, projectForDir } from "./sync.js";

type Api = (method: string, path: string, body?: unknown) => Promise<Response>;

import type { Mood } from "./pet-sprite.js";

export type { Mood };
export type Msg = { from: "you" | "pet" | "step" | "note"; text: string };
export type PetState = { name: string; xp: number; tasks: number; mood: number; energy: number; born: number; lastSeen: number };
export type BrainState = { pet: PetState; mood: Mood; busy: boolean; msgs: Msg[] };

const fresh = (): PetState => ({ name: "Byte", xp: 0, tasks: 0, mood: 3, energy: 4, born: Date.now(), lastSeen: Date.now() });
const clamp = (n: number) => Math.max(1, Math.min(5, n));
export const level = (xp: number) => 1 + Math.floor(Math.sqrt(xp / 20));

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

function claudeTurn(opts: { prompt: string; session: string; resume: boolean; name: string; onStep: (s: string) => void }): { child: ChildProcess; done: Promise<string> } {
  const persona =
    `You are ${opts.name}, a small pixel pet that lives in the minimachines CLI and helps with the project in the current folder. ` +
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
          const ev = JSON.parse(line) as { type: string; is_error?: boolean; result?: string; message?: { content?: { type: string; name?: string; input?: Record<string, unknown> }[] } };
          if (ev.type === "result" && ev.result) (ev.is_error ? (failure = ev.result) : (result = ev.result));
          if (ev.type !== "assistant") continue;
          for (const c of ev.message?.content ?? []) {
            if (c.type === "tool_use") opts.onStep(`${c.name} ${String(c.input?.file_path ?? c.input?.command ?? c.input?.pattern ?? "").split("\n")[0]!.slice(0, 70)}`);
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

export class BotBrain {
  state: BrainState;
  private listeners = new Set<(s: BrainState) => void>();
  private child: ChildProcess | null = null;
  private session = { id: randomUUID(), started: false };
  private lastTouch = Date.now();
  private moodUntil = 0;
  private timer: NodeJS.Timeout;
  private readonly file: string;

  constructor(private readonly api: Api, private readonly configDir: string) {
    this.file = join(configDir, "pet.json");
    const pet = loadPet(this.file);
    this.state = { pet, mood: "idle", busy: false, msgs: [{ from: "pet", text: `Hi! I'm ${pet.name}. Tell me what to do in this folder and I'll get on it.` }] };
    // Mood clock: a pet left alone for 90 seconds falls asleep.
    this.timer = setInterval(() => {
      if (this.state.busy || Date.now() < this.moodUntil) return;
      const next: Mood = Date.now() - this.lastTouch > 90_000 ? "sleep" : "idle";
      if (next !== this.state.mood) this.set({ mood: next });
    }, 1000);
  }

  subscribe(fn: (s: BrainState) => void): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<BrainState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }
  private say(m: Msg) {
    this.set({ msgs: [...this.state.msgs, m].slice(-200) });
  }
  private react(mood: Mood, ms = 4000) {
    this.moodUntil = Date.now() + ms;
    this.set({ mood });
  }
  private savePet(pet: PetState) {
    this.set({ pet });
    try {
      mkdirSync(this.configDir, { recursive: true });
      writeFileSync(this.file, JSON.stringify({ ...pet, lastSeen: Date.now() }, null, 2));
    } catch {
      // a read-only home dir just means the pet forgets
    }
  }

  /** Any interaction (typing counts) keeps the pet awake. */
  touch() {
    this.lastTouch = Date.now();
    if (this.state.mood === "sleep") this.set({ mood: "idle" });
  }

  stop() {
    this.child?.kill("SIGTERM");
  }

  dispose() {
    clearInterval(this.timer);
    this.stop();
    this.listeners.clear();
  }

  private async addTask(title: string) {
    const id = await projectForDir(this.api, process.cwd());
    if (!id) return this.say({ from: "note", text: "No project for this folder yet — share it with `mm up` first." });
    const doc = new Y.Doc();
    const { provider } = await connect(this.api, id, doc);
    const card = addCard(doc, { title, column: "ready", by: this.state.pet.name });
    await new Promise((r) => setTimeout(r, 600)); // let the card reach the room
    provider.destroy();
    this.say({ from: "pet", text: `Put "${title}" on the whiteboard as #${card} — an agent running \`mm board work\` will pick it up.` });
    this.react("happy");
  }

  async send(raw: string) {
    const text = raw.trim();
    if (!text || this.state.busy) return;
    this.touch();
    const pet = this.state.pet;
    const [cmd, ...rest] = text.split(" ");
    const arg = rest.join(" ").trim();
    if (cmd === "/help") return this.say({ from: "note", text: "Type a task and press enter. /task <title> adds a card to the whiteboard · /name <name> · /feed · /new starts a fresh conversation · esc stops a running task" });
    if (cmd === "/name" && arg) {
      this.savePet({ ...pet, name: arg.slice(0, 20) });
      this.say({ from: "pet", text: `${arg.slice(0, 20)}! I love it.` });
      return this.react("happy");
    }
    if (cmd === "/feed") {
      this.savePet({ ...pet, energy: clamp(pet.energy + 2), mood: clamp(pet.mood + 1) });
      this.say({ from: "pet", text: "Mmm, electrons. Thanks!" });
      return this.react("happy");
    }
    if (cmd === "/new") {
      this.session = { id: randomUUID(), started: false };
      return this.say({ from: "note", text: "Fresh conversation." });
    }
    if (cmd === "/task") {
      if (!arg) return this.say({ from: "note", text: "Usage: /task <what an agent should do>" });
      return void this.addTask(arg).catch((e: Error) => this.say({ from: "note", text: e.message }));
    }

    this.say({ from: "you", text });
    this.set({ busy: true, mood: "think" });
    try {
      const turn = claudeTurn({ prompt: text, session: this.session.id, resume: this.session.started, name: pet.name, onStep: (s) => this.say({ from: "step", text: s }) });
      this.child = turn.child;
      this.session.started = true;
      const reply = await turn.done;
      this.say({ from: "pet", text: reply });
      const now = this.state.pet;
      this.savePet({ ...now, xp: now.xp + 10, tasks: now.tasks + 1, mood: clamp(now.mood + 1), energy: clamp(now.energy - 1) });
      this.set({ busy: false });
      this.react("happy");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const hint = /credit balance|ANTHROPIC_API_KEY|invalid x-api-key/i.test(msg) ? " (If you sign in to Claude with claude.ai, unset ANTHROPIC_API_KEY — it takes precedence.)" : "";
      this.say({ from: "note", text: msg === "stopped" ? "Stopped." : `That didn't work: ${msg.slice(0, 300)}${hint}` });
      if (msg !== "stopped") this.savePet({ ...this.state.pet, mood: clamp(this.state.pet.mood - 1) });
      this.set({ busy: false });
      this.react("sad");
    } finally {
      this.child = null;
      this.lastTouch = Date.now();
    }
  }
}
