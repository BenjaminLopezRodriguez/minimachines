import assert from "node:assert/strict";
import test from "node:test";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { appendFrame, HISTORY_LIMIT, onionLayers } from "./canvas-history";

function shape(
  id: string,
  extra: Record<string, unknown> = {},
): ExcalidrawElement {
  return {
    id,
    version: 1,
    versionNonce: 1,
    isDeleted: false,
    opacity: 100,
    groupIds: ["group"],
    frameId: null,
    boundElements: null,
    ...extra,
  } as unknown as ExcalidrawElement;
}
void test("history isolates snapshots from later mutations and deduplicates unchanged scenes", () => {
  const elements = [shape("a")];
  const first = appendFrame([], elements, 1);
  assert.equal(appendFrame(first, elements, 2), first);
  (elements[0] as unknown as { version: number }).version = 2;
  assert.equal(first[0]!.elements[0]!.version, 1);
  const next = appendFrame(first, elements, 3);
  assert.equal(next.length, 2);
  assert.equal(next[1]!.elements[0]!.version, 2);
});
void test("restoring an old edit appends history without deleting the later work", () => {
  const initial = appendFrame([], [shape("a")], 1);
  const changed = appendFrame(initial, [shape("a", { version: 2 })], 2);
  const restored = appendFrame(changed, initial[0]!.elements, 3);
  assert.equal(restored.length, 3);
  assert.equal(restored[1]!.elements[0]!.version, 2);
  assert.equal(restored[2]!.elements[0]!.version, 1);
});
void test("history stays bounded at the latest 120 meaningful edits", () => {
  let frames = appendFrame([], [], 0);
  for (let version = 1; version <= HISTORY_LIMIT + 10; version++)
    frames = appendFrame(frames, [shape("a", { version })], version);
  assert.equal(frames.length, HISTORY_LIMIT);
  assert.equal(frames.at(-1)!.elements[0]!.version, HISTORY_LIMIT + 10);
});
void test("onion copies remap bindings, remain faint and leave real elements untouched", () => {
  const elements = [
    shape("box", { boundElements: [{ id: "text", type: "text" }] }),
    shape("text", { containerId: "box", frameId: "frame" }),
    shape("arrow", {
      startBinding: { elementId: "box", focus: 0 },
      endBinding: null,
    }),
    shape("deleted", { isDeleted: true }),
  ];
  const frames = appendFrame([], elements, 1);
  const newer = appendFrame(frames, [shape("new")], 2);
  const ghosts = onionLayers(newer, 1);
  const prefix = `onion-${frames[0]!.id}-`;
  assert.equal(ghosts.length, 3);
  assert.equal(ghosts[0]!.boundElements?.[0]?.id, prefix + "text");
  assert.equal(
    (ghosts[1] as unknown as { containerId: string }).containerId,
    prefix + "box",
  );
  assert.equal(ghosts[1]!.frameId, prefix + "frame");
  assert.equal(
    (ghosts[2] as unknown as { startBinding: { elementId: string } })
      .startBinding.elementId,
    prefix + "box",
  );
  assert.ok(ghosts.every((e) => e.locked && e.opacity <= 20));
  assert.equal(elements[0]!.id, "box");
  assert.equal(elements[0]!.opacity, 100);
  assert.equal(onionLayers(newer, 0).length, 0);
});
