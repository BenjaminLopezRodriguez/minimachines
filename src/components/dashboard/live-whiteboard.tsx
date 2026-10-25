"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import YProvider from "y-partyserver/provider";
import * as Y from "yjs";

const Board = dynamic(
  () => import("~/components/workspace/board").then((m) => m.Board),
  {
    ssr: false,
    loading: () => (
      <p className="mm-board-notice" role="status">
        Loading whiteboard…
      </p>
    ),
  },
);
type Access = {
  host: string;
  secure: boolean;
  room: string;
  token: string;
  role: "owner" | "member" | "viewer";
};

export function LiveWhiteboard({
  access,
  name,
  files,
  refreshToken,
}: {
  access: Access;
  name: string;
  files: string | null;
  refreshToken: () => Promise<string>;
}) {
  const [connection, setConnection] = useState<{
    doc: Y.Doc;
    provider: YProvider;
  } | null>(null);
  const [status, setStatus] = useState("Connecting…");
  useEffect(() => {
    const doc = new Y.Doc();
    let first = true;
    const provider = new YProvider(access.host, access.room, doc, {
      protocol: access.secure ? "wss" : "ws",
      params: async () => ({
        token: first ? ((first = false), access.token) : await refreshToken(),
      }),
    });
    provider.awareness.setLocalStateField("user", { name, color: "#3558f5" });
    const onStatus = ({ status }: { status: string }) =>
      setStatus(
        status === "connected"
          ? "Live"
          : status === "connecting"
            ? "Connecting…"
            : "Offline · reconnecting",
      );
    provider.on("status", onStatus);
    setConnection({ doc, provider });
    return () => {
      provider.off("status", onStatus);
      provider.destroy();
      doc.destroy();
    };
  }, [
    access.host,
    access.room,
    access.secure,
    access.token,
    name,
    refreshToken,
  ]);
  return (
    <div className="mm-live-whiteboard">
      <span className="mm-board-status" role="status">
        {status}
        {access.role === "viewer" ? " · View only" : ""}
      </span>
      {connection && (
        <Board
          doc={connection.doc}
          awareness={connection.provider.awareness}
          readOnly={access.role === "viewer"}
          me={name}
          files={files}
        />
      )}
    </div>
  );
}
