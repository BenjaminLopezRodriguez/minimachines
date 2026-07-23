"use client";

import {
  createElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { cn } from "~/lib/utils";

type DiffuseTypeTextProps = {
  children: string;
  as?: "h1" | "h2" | "h3" | "p" | "span";
  className?: string;
  style?: CSSProperties;
  /** Settle cadence in ms (lower = faster). */
  speed?: number;
  /** How scrambled / bursty resolves feel (0–1). */
  variance?: number;
  /** Unused — kept so existing call sites keep working. */
  wave?: number;
  delay?: number;
  startOnMount?: boolean;
  threshold?: number;
};

const HASH = [
  "#",
  "*",
  "%",
  "+",
  "=",
  "/",
  "\\",
  "|",
  "_",
  "-",
  "·",
  "•",
  "0",
  "1",
  "x",
] as const;
const BLOCKS = ["█", "▓", "▒", "░", "▪", "▫"] as const;
const CURSORS = ["[", "]", "(", ")", "{", "}", "<", ">"] as const;

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function normalizeCopy(value: string) {
  return value
    .replace(/[ \t]*\n[ \t]*/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

function shuffle(indices: number[]) {
  const next = [...indices];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j]!, next[i]!];
  }
  return next;
}

function noiseGlyph(seed: number, tick: number) {
  const n = (seed * 131 + tick * 17) % 100;
  if (n < 38) return CURSORS[(seed + tick) % CURSORS.length]!;
  if (n < 58) return HASH[(seed * 3 + tick) % HASH.length]!;
  if (n < 78) return (tick + seed) % 2 === 0 ? "·" : "•";
  if (n < 90) return BLOCKS[(seed + tick) % BLOCKS.length]!;
  return HASH[(seed + tick * 2) % HASH.length]!;
}

export function DiffuseTypeText({
  children,
  as = "span",
  className,
  style,
  speed = 26,
  variance = 0.55,
  delay = 0,
  startOnMount = false,
  threshold = 0.35,
}: DiffuseTypeTextProps) {
  const ref = useRef<HTMLElement | null>(null);
  const text = useMemo(() => normalizeCopy(children), [children]);
  const chars = useMemo(() => Array.from(text), [text]);
  const seeds = useMemo(
    () => chars.map((_, i) => (i * 2654435761) >>> 0),
    [chars],
  );

  const [phase, setPhase] = useState<"idle" | "scramble" | "done">("idle");
  const [tick, setTick] = useState(0);
  // Bitmask of indices that have locked to the real character
  const [locked, setLocked] = useState<Set<number>>(() => new Set());

  const orderRef = useRef<number[]>([]);
  const timersRef = useRef<number[]>([]);
  const textRef = useRef(text);
  textRef.current = text;

  const clearTimers = () => {
    for (const id of timersRef.current) {
      window.clearTimeout(id);
      window.clearInterval(id);
    }
    timersRef.current = [];
  };

  const lockAll = () => {
    const all = new Set<number>();
    chars.forEach((_, i) => all.add(i));
    setLocked(all);
    setPhase("done");
  };

  useEffect(() => {
    clearTimers();
    setPhase("idle");
    setTick(0);
    setLocked(new Set());
    orderRef.current = [];

    if (prefersReducedMotion()) {
      lockAll();
      return;
    }

    const glyphIdx: number[] = [];
    chars.forEach((ch, i) => {
      if (ch !== " " && ch !== "\n") glyphIdx.push(i);
    });
    orderRef.current = shuffle(glyphIdx);

    // Spaces/newlines are always the real character
    const initial = new Set<number>();
    chars.forEach((ch, i) => {
      if (ch === " " || ch === "\n") initial.add(i);
    });

    const begin = () => {
      setLocked(initial);
      setPhase("scramble");
    };

    let startTimer: number | undefined;

    if (startOnMount) {
      startTimer = window.setTimeout(begin, delay);
      timersRef.current.push(startTimer);
      return () => clearTimers();
    }

    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          startTimer = window.setTimeout(begin, delay);
          timersRef.current.push(startTimer);
          observer.disconnect();
        }
      },
      // Safari is pickier about threshold — fire earlier so scroll sections animate
      { threshold: Math.min(threshold, 0.15), rootMargin: "0px 0px -4% 0px" },
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, delay, startOnMount, threshold]);

  // Flicker noise glyphs during scramble, and during startOnMount idle wait
  useEffect(() => {
    const shouldFlicker = phase === "scramble" || (phase === "idle" && startOnMount);
    if (!shouldFlicker) return;

    const flicker = window.setInterval(() => {
      setTick((t) => t + 1);
    }, 36);
    timersRef.current.push(flicker);

    return () => {
      window.clearInterval(flicker);
    };
  }, [phase, startOnMount]);

  // Scramble tick + resolve onto real characters
  useEffect(() => {
    if (phase !== "scramble") return;

    const base = Math.max(12, speed);
    let cursor = 0;
    const order = orderRef.current;

    const beat = () => {
      const left = order.length - cursor;
      if (left <= 0) {
        // Final frame: commit every index to the real string
        setLocked(new Set(chars.map((_, i) => i)));
        setPhase("done");
        return;
      }

      const burst =
        left > 28
          ? 2 + Math.floor(Math.random() * 3)
          : left > 10
            ? 1 + (Math.random() > 0.4 ? 1 : 0)
            : 1;

      const newly: number[] = [];
      for (let n = 0; n < burst && cursor < order.length; n++) {
        if (
          variance > 0 &&
          Math.random() < variance &&
          cursor + 4 < order.length
        ) {
          const a = cursor;
          const b = a + 1 + Math.floor(Math.random() * 4);
          const tmp = order[a]!;
          order[a] = order[b]!;
          order[b] = tmp;
        }
        newly.push(order[cursor]!);
        cursor += 1;
      }

      setLocked((prev) => {
        const next = new Set(prev);
        for (const idx of newly) next.add(idx);
        return next;
      });

      if (cursor >= order.length) {
        const finish = window.setTimeout(() => {
          setLocked(new Set(chars.map((_, i) => i)));
          setPhase("done");
        }, 40);
        timersRef.current.push(finish);
        return;
      }

      const wait = base * (0.5 + Math.random() * (0.85 + variance));
      const t = window.setTimeout(beat, wait);
      timersRef.current.push(t);
    };

    const first = window.setTimeout(beat, base * 0.4);
    timersRef.current.push(first);
  }, [phase, speed, variance, chars]);

  // Once done, render the real string — no noise spans left behind
  if (phase === "done") {
    return createElement(
      as,
      {
        ref,
        className: cn("relative overflow-visible", className),
        style,
      },
      text,
    );
  }

  return createElement(
    as,
    {
      ref,
      className: cn("relative overflow-visible", className),
      style,
      "aria-label": text,
    },
    <span aria-hidden className="overflow-visible whitespace-pre-wrap">
      {chars.map((char, index) => {
        if (char === "\n") return <br key={`br-${index}`} />;

        if (char === " ") {
          return (
            <span key={`sp-${index}`} className="inline-block">
              {"\u00A0"}
            </span>
          );
        }

        if (phase === "idle") {
          // startOnMount: show noise immediately so AuthKit/RSC remounts
          // never leave the brand as invisible `text-transparent`.
          if (startOnMount) {
            const glyph = noiseGlyph(seeds[index] ?? index, tick);
            const delayMs = `${(seeds[index] ?? index) % 7}0ms`;
            return (
              <span key={`${index}-idle`} className="mm-type-glyph">
                <span className="invisible">{char}</span>
                <span
                  className="mm-type-noise absolute inset-[-0.45em] flex items-center justify-center font-mono text-[0.92em] leading-none text-muted-foreground"
                  style={{
                    WebkitAnimationDelay: delayMs,
                    animationDelay: delayMs,
                  }}
                >
                  {glyph}
                </span>
              </span>
            );
          }

          return (
            <span
              key={`${index}-idle`}
              className="inline-block text-transparent"
            >
              {char}
            </span>
          );
        }

        const isLocked = locked.has(index);

        if (isLocked) {
          const delayMs = `${((seeds[index] ?? index) % 5) * 12}ms`;
          // Settled: fade + motion-blur into the real character
          return (
            <span
              key={`${index}-ok`}
              className="mm-type-settle mm-type-glyph"
              style={{
                WebkitAnimationDelay: delayMs,
                animationDelay: delayMs,
              }}
            >
              {char}
            </span>
          );
        }

        const glyph = noiseGlyph(seeds[index] ?? index, tick);
        const isCursor = (CURSORS as readonly string[]).includes(glyph);
        const isBlock = (BLOCKS as readonly string[]).includes(glyph);
        const delayMs = `${(seeds[index] ?? index) % 7}0ms`;

        return (
          <span key={`${index}-noise`} className="mm-type-glyph">
            <span className="invisible">{char}</span>
            <span
              className={cn(
                "absolute inset-[-0.45em] flex items-center justify-center font-mono text-[0.92em] leading-none",
                isCursor && "mm-type-noise-cursor text-foreground",
                isBlock && "mm-type-noise-block text-foreground",
                !isCursor && !isBlock && "mm-type-noise text-muted-foreground",
              )}
              style={{
                WebkitAnimationDelay: delayMs,
                animationDelay: delayMs,
              }}
            >
              {glyph}
            </span>
          </span>
        );
      })}
      {phase === "scramble" ? (
        <span
          className="mm-type-caret ml-0.5 inline-block h-[0.85em] w-[0.4em] translate-y-[0.12em] bg-current align-baseline"
          aria-hidden
        />
      ) : null}
    </span>,
  );
}
