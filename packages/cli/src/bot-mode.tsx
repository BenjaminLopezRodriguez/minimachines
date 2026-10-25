/**
 * TUI bot mode: Byte in the terminal. The brain (bot-brain.ts) is shared with
 * the desktop window this screen opens (bot-server.ts), so you can talk to
 * the same pet from either place.
 */
import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";

import { BotBrain, level, type BrainState, type Msg } from "./bot-brain.js";
import { startBotServer } from "./bot-server.js";
import { BRAND, PALETTE, sprite, type Mood } from "./pet-sprite.js";

type Api = (method: string, path: string, body?: unknown) => Promise<Response>;

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

export function BotMode(props: {
  api: Api;
  configDir: string;
  openInViewer: (url: string, window?: string) => Promise<"viewer" | "browser">;
  onExit: () => void;
  width: number;
  height: number;
}) {
  const [brain] = useState(() => new BotBrain(props.api, props.configDir));
  const [s, setS] = useState<BrainState>(brain.state);
  const [frame, setFrame] = useState(0);
  const [blink, setBlink] = useState(false);
  const [input, setInput] = useState("");
  const [window, setWindow] = useState("opening the desktop window…");

  useEffect(() => brain.subscribe(setS), [brain]);
  useEffect(() => {
    let close: (() => void) | undefined;
    let gone = false;
    void startBotServer(brain).then(async (srv) => {
      if (gone) return srv.close();
      close = srv.close;
      const where = await props.openInViewer(srv.url, "bot");
      setWindow(where === "viewer" ? "also open in its own window" : "also open in your browser");
    });
    return () => {
      gone = true;
      close?.();
      brain.dispose(); // leaving bot mode stops a running task
    };
  }, [brain]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setInterval(() => {
      setFrame((f) => f + 1);
      setBlink(Math.random() < 0.12);
    }, 450);
    return () => clearInterval(t);
  }, []);

  useInput((ch, key) => {
    brain.touch();
    if (key.escape) return s.busy ? brain.stop() : props.onExit();
    if (s.busy) return; // one task at a time
    if (key.return) {
      const text = input.trim();
      setInput("");
      if (text) void brain.send(text);
      return;
    }
    if (key.backspace || key.delete) return setInput((v) => v.slice(0, -1));
    if (ch && !key.ctrl && !key.meta && !/[\x00-\x1f]/.test(ch)) setInput((v) => v + ch);
  });

  const { pet, mood } = s;
  const shownMood: Mood = mood === "idle" && blink ? "blink" : mood;
  const bar = (n: number, color: string) => <Text color={color}>{"●".repeat(n)}<Text dimColor>{"○".repeat(5 - n)}</Text></Text>;
  const lv = level(pet.xp);
  const status = mood === "think" ? `${pet.name} is on it…` : mood === "happy" ? "♥ done!" : mood === "sad" ? "hmm, that didn't go well" : mood === "sleep" ? "z z z" : `${pet.name} is ready`;
  const chatRows = Math.max(4, props.height - 15);
  const width = Math.min(props.width - 4, 100);

  // Newest messages that fit, oldest first.
  const shown: Msg[] = [];
  let used = 0;
  for (let i = s.msgs.length - 1; i >= 0 && used < chatRows; i--) {
    const m = s.msgs[i]!;
    used += Math.min(6, Math.ceil(m.text.length / Math.max(20, width - 12)) + (m.from === "step" ? 0 : 1));
    shown.unshift(m);
  }

  return (
    <Box flexDirection="column" height={props.height - 1} paddingX={1}>
      <Box borderStyle="round" borderColor={BRAND} paddingX={2} width={width}>
        <Pet mood={shownMood} frame={frame} />
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
            <Text dimColor>{` / ${20 * lv * lv}`}</Text>
          </Text>
          <Text color={mood === "sad" ? "red" : mood === "happy" ? "#ff8fb1" : undefined} dimColor={mood === "idle" || mood === "sleep"}>
            {`\n${status}`}
          </Text>
          <Text dimColor>{window}</Text>
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

      <Box borderStyle="round" borderColor={s.busy ? "gray" : BRAND} paddingX={1} width={width}>
        <Text color={BRAND} bold>{"› "}</Text>
        {s.busy ? <Text dimColor>working… esc to stop</Text> : input ? <Text>{input}</Text> : <Text dimColor>{`tell ${pet.name} what to do · /task adds to the whiteboard · /help`}</Text>}
        {!s.busy && <Text inverse> </Text>}
      </Box>
      <Text dimColor>{"  edits files in this folder only · esc home"}</Text>
    </Box>
  );
}
