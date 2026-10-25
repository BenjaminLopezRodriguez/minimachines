"use client";

import dynamic from "next/dynamic";
const Canvas = dynamic(
  () => import("./blank-canvas").then((m) => m.BlankCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="mm-board-notice" role="status">
        Opening whiteboard…
      </div>
    ),
  },
);
export function BlankWhiteboard({ owner }: { owner: string }) {
  return <Canvas key={owner} owner={owner} />;
}
