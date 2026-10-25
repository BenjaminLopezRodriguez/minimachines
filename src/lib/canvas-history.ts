import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";

export const HISTORY_LIMIT = 120;
export type CanvasFrame = {
  id: string;
  at: number;
  elements: readonly ExcalidrawElement[];
};
export type CanvasArchive = {
  version: 1;
  frames: CanvasFrame[];
  files: BinaryFiles;
  appState: Partial<
    Pick<
      AppState,
      | "viewBackgroundColor"
      | "scrollX"
      | "scrollY"
      | "zoom"
      | "gridSize"
      | "gridModeEnabled"
    >
  >;
};
export function sceneFingerprint(elements: readonly ExcalidrawElement[]) {
  return elements
    .map((e) => `${e.id}:${e.version}:${e.versionNonce}:${e.isDeleted}`)
    .join("|");
}
export function appendFrame(
  frames: CanvasFrame[],
  elements: readonly ExcalidrawElement[],
  at = Date.now(),
): CanvasFrame[] {
  if (
    frames.length &&
    sceneFingerprint(frames.at(-1)!.elements) === sceneFingerprint(elements)
  )
    return frames;
  return [
    ...frames,
    { id: crypto.randomUUID(), at, elements: structuredClone(elements) },
  ].slice(-HISTORY_LIMIT);
}

/** Remap every relationship so translucent copies never bind to the current drawing. */
export function onionLayers(
  frames: CanvasFrame[],
  position: number,
): ExcalidrawElement[] {
  const current = new Map(
    frames[position]?.elements.map((element) => [element.id, element]),
  );
  return frames
    .slice(Math.max(0, position - 2), position)
    .flatMap((frame, layer, past) => {
      const prefix = `onion-${frame.id}-`;
      const remap = (id: string | null | undefined) => (id ? prefix + id : id);
      return frame.elements
        .filter((e) => {
          const present = current.get(e.id);
          return (
            !e.isDeleted &&
            (!present ||
              present.isDeleted ||
              present.version !== e.version ||
              present.versionNonce !== e.versionNonce)
          );
        })
        .map((e) => {
          const copy = structuredClone(e) as unknown as Record<string, unknown>;
          copy.id = prefix + e.id;
          copy.opacity = Math.min(
            e.opacity,
            layer === past.length - 1 ? 20 : 9,
          );
          copy.locked = true;
          copy.groupIds = e.groupIds.map((id) => prefix + id);
          copy.frameId = remap(e.frameId) ?? null;
          copy.boundElements =
            e.boundElements?.map((bound) => ({
              ...bound,
              id: prefix + bound.id,
            })) ?? null;
          if ("containerId" in copy)
            copy.containerId = remap(copy.containerId as string | null);
          for (const field of ["startBinding", "endBinding"] as const) {
            const binding = copy[field] as
              { elementId: string } | null | undefined;
            if (binding)
              copy[field] = {
                ...binding,
                elementId: prefix + binding.elementId,
              };
          }
          return copy as unknown as ExcalidrawElement;
        });
    });
}

const DB = "minimachines-canvas";
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Canvas storage is unavailable"));
  });
}
export async function readCanvas(
  owner: string,
): Promise<CanvasArchive | undefined> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction("drafts", "readonly")
        .objectStore("drafts")
        .get(owner);
      request.onsuccess = () =>
        resolve(request.result as CanvasArchive | undefined);
      request.onerror = () =>
        reject(request.error ?? new Error("Could not read canvas history"));
    });
  } finally {
    db.close();
  }
}
export async function writeCanvas(
  owner: string,
  archive: CanvasArchive,
): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("drafts", "readwrite");
      transaction.objectStore("drafts").put(archive, owner);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(
          transaction.error ?? new Error("Could not cache canvas history"),
        );
      transaction.onabort = () =>
        reject(
          transaction.error ?? new Error("Could not cache canvas history"),
        );
    });
  } finally {
    db.close();
  }
}
