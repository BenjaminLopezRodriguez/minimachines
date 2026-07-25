"use client";

import { useEffect, useState } from "react";

import type { BatonStatus } from "~/server/data/pager";

const row: React.CSSProperties = {
  padding: "10px 12px",
  background: "#f4f4f5",
  borderRadius: 8,
  whiteSpace: "pre-wrap",
  marginBottom: 8,
};

const label: React.CSSProperties = {
  opacity: 0.6,
  textTransform: "uppercase",
  fontSize: 11,
  letterSpacing: 0.4,
};

/**
 * What the agent did with your answer. Polls the token-scoped status feed
 * until the agent reports it landed, then hands over the live URL.
 */
export function StatusFeed({ token }: { token: string }) {
  const [status, setStatus] = useState<BatonStatus | null>(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    let stop = false;
    async function tick() {
      try {
        const res = await fetch(`/api/m/${token}/status`, { cache: "no-store" });
        if (res.status === 404) {
          setExpired(true);
          return true;
        }
        if (!res.ok) return false;
        const next = (await res.json()) as BatonStatus;
        if (!stop) setStatus(next);
        return next.done;
      } catch {
        // Phone went through a tunnel; the next tick retries.
        return false;
      }
    }
    void tick();
    // ponytail: 3s poll, no socket. Swap for SSE if the feed gets chatty.
    const id = setInterval(() => {
      void tick().then((done) => {
        if (done) clearInterval(id);
      });
    }, 3000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [token]);

  if (expired) {
    return <p style={{ opacity: 0.6 }}>This link has expired.</p>;
  }

  const events = status?.events ?? [];
  const commands = status?.commands ?? [];

  return (
    <>
      {events.length === 0 && commands.length === 0 ? (
        <p style={{ opacity: 0.6 }}>Working… no update yet.</p>
      ) : null}

      {events.map((e, i) => (
        <div key={`${e.at}-${i}`} style={row}>
          <p style={{ ...label, margin: "0 0 4px" }}>
            {e.kind} · {new Date(e.at).toLocaleTimeString()}
          </p>
          {e.text}
        </div>
      ))}

      {commands.length > 0 ? (
        <div style={{ marginTop: events.length ? 16 : 0 }}>
          <p style={{ ...label, margin: "0 0 8px" }}>Running on the machine</p>
          <div
            style={{
              background: "#18181b",
              color: "#e4e4e7",
              borderRadius: 8,
              padding: "10px 12px",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 12,
              lineHeight: 1.5,
              overflowX: "auto",
            }}
          >
            {commands.map((c, i) => (
              <div key={`${c.at}-${i}`} style={{ marginBottom: 6 }}>
                <div style={{ whiteSpace: "pre", opacity: c.running ? 1 : 0.85 }}>
                  <span
                    style={{
                      color: c.running ? "#fbbf24" : c.ok ? "#4ade80" : "#f87171",
                    }}
                  >
                    {c.running ? "•" : c.ok ? "✓" : "✗"}
                  </span>{" "}
                  {c.cmd}
                </div>
                {c.tail ? (
                  <div
                    style={{
                      whiteSpace: "pre-wrap",
                      opacity: 0.5,
                      paddingLeft: 14,
                    }}
                  >
                    {c.tail}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {status?.done && status.liveUrl ? (
        <a
          href={status.liveUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "block",
            marginTop: 16,
            padding: 14,
            fontSize: 16,
            fontWeight: 600,
            textAlign: "center",
            textDecoration: "none",
            color: "#fff",
            background: "#111",
            borderRadius: 8,
          }}
        >
          Open live site
        </a>
      ) : null}
    </>
  );
}
