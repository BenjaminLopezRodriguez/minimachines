"use client";

import { CaptureUpdateAction, Excalidraw } from "@excalidraw/excalidraw";
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  AppState,
  BinaryFiles,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  appendFrame,
  onionLayers,
  readCanvas,
  writeCanvas,
  type CanvasArchive,
} from "~/lib/canvas-history";
import { CanvasHistoryRail } from "./canvas-history-rail";

const emptyArchive = (): CanvasArchive => ({
  version: 1,
  frames: appendFrame([], []),
  files: {},
  appState: { viewBackgroundColor: "#ffffff" },
});

export function BlankCanvas({ owner }: { owner: string }) {
  const [archive, setArchive] = useState<CanvasArchive | null>(null);
  const archiveRef = useRef<CanvasArchive | null>(null);
  const live = useRef<{
    elements: readonly ExcalidrawElement[];
    state: CanvasArchive["appState"];
    files: BinaryFiles;
  } | null>(null);
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const browsing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);
  const writeQueue = useRef(Promise.resolve());
  const [position, setPosition] = useState<number | null>(null);
  const [onions, setOnions] = useState(true);
  const [saveError, setSaveError] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );
  const store = useCallback(
    (next: CanvasArchive) => {
      writeQueue.current = writeQueue.current
        .catch(() => undefined)
        .then(() => writeCanvas(owner, next));
      void writeQueue.current
        .then(() => {
          if (mounted.current) setSaveError("");
        })
        .catch(() => {
          if (mounted.current)
            setSaveError(
              "Couldn’t cache edits in this browser. Export a copy from the canvas menu before leaving.",
            );
        });
    },
    [owner],
  );
  const capture = useCallback(() => {
    const current = archiveRef.current;
    const scene = live.current;
    if (!current || !scene) return current;
    const next = {
      ...current,
      frames: appendFrame(current.frames, scene.elements),
      appState: scene.state,
      files: scene.files,
    };
    archiveRef.current = next;
    if (mounted.current) setArchive(next);
    store(next);
    return next;
  }, [store]);
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    void readCanvas(owner)
      .then((saved) => {
        if (cancelled) return;
        const next =
          saved?.version === 1 && saved.frames.length ? saved : emptyArchive();
        // Preserve drafts created before history caching was introduced.
        if (!saved) {
          try {
            const old = localStorage.getItem(
              `minimachines:whiteboard:${owner}`,
            );
            if (old) {
              const data = JSON.parse(old) as ExcalidrawInitialDataState;
              next.frames = appendFrame(next.frames, data.elements ?? []);
              next.files = data.files ?? {};
              next.appState = data.appState ?? next.appState;
            }
          } catch {
            /* The new blank canvas remains usable. */
          }
        }
        archiveRef.current = next;
        setArchive(next);
      })
      .catch(() => {
        if (!cancelled) {
          const next = emptyArchive();
          archiveRef.current = next;
          setArchive(next);
          setSaveError(
            "History storage is unavailable. You can still draw and export a copy.",
          );
        }
      });
    const observer = new MutationObserver(() =>
      setTheme(
        document.documentElement.dataset.theme === "dark" ? "dark" : "light",
      ),
    );
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const flush = () => {
      if (timer.current) clearTimeout(timer.current);
      capture();
    };
    window.addEventListener("pagehide", flush);
    return () => {
      cancelled = true;
      mounted.current = false;
      flush();
      observer.disconnect();
      window.removeEventListener("pagehide", flush);
    };
  }, [owner, capture]);
  const onChange = useCallback(
    (
      elements: readonly ExcalidrawElement[],
      state: AppState,
      files: BinaryFiles,
    ) => {
      if (
        browsing.current ||
        elements.some((element) => element.id.startsWith("onion-"))
      )
        return;
      live.current = {
        elements,
        files,
        state: {
          viewBackgroundColor: state.viewBackgroundColor,
          scrollX: state.scrollX,
          scrollY: state.scrollY,
          zoom: state.zoom,
          gridSize: state.gridSize,
          gridModeEnabled: state.gridModeEnabled,
        },
      };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(capture, 700);
    },
    [capture],
  );
  const returnToPresent = useCallback(() => {
    const scene = live.current;
    if (!scene || !api.current) return;
    browsing.current = false;
    setPosition(null);
    api.current.updateScene({
      elements: scene.elements,
      appState: { viewModeEnabled: false },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }, []);
  const selectHistory = useCallback(
    (index: number) => {
      const current = browsing.current ? archiveRef.current : capture();
      if (!current || !api.current) return;
      if (timer.current) clearTimeout(timer.current);
      const chosen = Math.min(current.frames.length - 1, Math.max(0, index));
      if (chosen === current.frames.length - 1) {
        returnToPresent();
        return;
      }
      browsing.current = true;
      setPosition(chosen);
      api.current.updateScene({
        elements: [
          ...(onions ? onionLayers(current.frames, chosen) : []),
          ...current.frames[chosen]!.elements,
        ],
        appState: { viewModeEnabled: true },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    },
    [capture, onions, returnToPresent],
  );
  const toggleOnions = () => {
    const next = !onions;
    setOnions(next);
    const current = archiveRef.current;
    if (position !== null && current && api.current)
      api.current.updateScene({
        elements: [
          ...(next ? onionLayers(current.frames, position) : []),
          ...current.frames[position]!.elements,
        ],
        captureUpdate: CaptureUpdateAction.NEVER,
      });
  };
  const restore = () => {
    const current = archiveRef.current;
    if (position === null || !current || !api.current || !live.current) return;
    live.current = {
      ...live.current,
      elements: structuredClone(current.frames[position]!.elements),
    };
    returnToPresent();
    capture();
  };
  if (!archive)
    return (
      <div className="mm-board-notice" role="status">
        Opening whiteboard…
      </div>
    );
  return (
    <div className="mm-blank-whiteboard">
      <div className="mm-canvas-caption">
        <span>Whiteboard</span>
        <small role="status">
          {position !== null
            ? `Edit ${position + 1} of ${archive.frames.length} · Read only`
            : saveError
              ? "Not saved"
              : "Saved in this browser"}
        </small>
        {position !== null && (
          <div className="mm-history-actions">
            <button onClick={toggleOnions} aria-pressed={onions}>
              Onion skins
            </button>
            <button onClick={restore}>Restore this edit</button>
            <button onClick={returnToPresent}>Back to present</button>
          </div>
        )}
      </div>
      {saveError && (
        <p className="mm-canvas-save-error" role="alert">
          {saveError}
        </p>
      )}
      <div className="mm-freeform-canvas">
        <Excalidraw
          excalidrawAPI={(instance) => {
            api.current = instance;
          }}
          initialData={{
            elements: archive.frames.at(-1)!.elements,
            files: archive.files,
            appState: archive.appState,
          }}
          onChange={onChange}
          theme={theme}
          name="minimachines-whiteboard"
          UIOptions={{
            canvasActions: {
              loadScene: true,
              saveToActiveFile: false,
              export: { saveFileToDisk: true },
            },
          }}
        />
        <CanvasHistoryRail
          frames={archive.frames}
          position={position ?? archive.frames.length - 1}
          onSelect={selectHistory}
        />
      </div>
    </div>
  );
}
