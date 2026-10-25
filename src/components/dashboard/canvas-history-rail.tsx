"use client";

import { useEffect, useRef } from "react";
import type { CanvasFrame } from "~/lib/canvas-history";

export function CanvasHistoryRail({
  frames,
  position,
  onSelect,
}: {
  frames: CanvasFrame[];
  position: number;
  onSelect: (index: number) => void;
}) {
  const rail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = rail.current;
    if (!node) return;
    const scroll = (event: WheelEvent) => {
      event.preventDefault();
      if (event.deltaY)
        onSelect(
          Math.max(
            0,
            Math.min(frames.length - 1, position + Math.sign(event.deltaY)),
          ),
        );
    };
    node.addEventListener("wheel", scroll, { passive: false });
    return () => node.removeEventListener("wheel", scroll);
  }, [frames.length, position, onSelect]);
  if (frames.length < 2) return null;
  return (
    <div className="mm-history-rail" ref={rail}>
      <div className="mm-history-ticks" aria-hidden="true">
        {frames.map((frame, index) => (
          <span
            key={frame.id}
            className={index === position ? "is-current" : ""}
            style={{
              width:
                index === position
                  ? 38
                  : Math.max(9, 29 - Math.abs(index - position) * 8),
              position: "absolute",
              top: `${(index / (frames.length - 1)) * 100}%`,
              left: "50%",
              transform: "translateX(-50%)",
            }}
          />
        ))}
      </div>
      <input
        aria-label="Whiteboard edit history"
        aria-orientation="vertical"
        aria-describedby="canvas-history-hint"
        aria-valuetext={`Edit ${position + 1} of ${frames.length}${position === frames.length - 1 ? ", present" : `, ${new Date(frames[position]!.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}`}
        type="range"
        min={0}
        max={frames.length - 1}
        value={position}
        onChange={(event) => onSelect(Number(event.target.value))}
      />
      <span id="canvas-history-hint" className="sr-only">
        Scroll, drag, or use the arrow keys to browse up to 120 recent edits
        saved in this browser. Browsing history is read-only.
      </span>
    </div>
  );
}
