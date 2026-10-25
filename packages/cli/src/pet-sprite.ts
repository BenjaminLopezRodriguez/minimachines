/** Byte, the bot's pixel pet: one sprite sheet for both the TUI and the desktop window. */
export type Mood = "idle" | "blink" | "think" | "happy" | "sad" | "sleep";
export const BRAND = "#6f8cff";

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
export const PALETTE: Record<string, string> = {
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


/** Every mood's two animation frames, for the desktop window to draw. */
export function spriteSheet(): Record<Mood, [string[], string[]]> {
  const moods: Mood[] = ["idle", "blink", "think", "happy", "sad", "sleep"];
  return Object.fromEntries(moods.map((m) => [m, [sprite(m, 0), sprite(m, 1)]])) as Record<Mood, [string[], string[]]>;
}
