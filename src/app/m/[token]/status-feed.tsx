"use client";

import { useEffect, useState } from "react";
import type { BatonStatus } from "~/server/data/pager";

/** Resume is observable activity, not an assumption made when a reply is saved. */
export function StatusFeed({ token }: { token: string }) {
  const [status, setStatus] = useState<BatonStatus | null>(null);
  const [expired, setExpired] = useState(false);
  const [interrupted, setInterrupted] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let stopped = false,
      inFlight = false,
      done = false;
    const controller = new AbortController();
    async function tick() {
      if (stopped || done || inFlight || document.hidden) return;
      inFlight = true;
      try {
        const res = await fetch(`/api/m/${token}/status`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (stopped) return;
        if (res.status === 404) {
          setExpired(true);
          done = true;
          return;
        }
        if (!res.ok) {
          setInterrupted(true);
          return;
        }
        const next = (await res.json()) as BatonStatus;
        if (stopped) return;
        setStatus(next);
        setInterrupted(false);
        done = next.done;
      } catch {
        if (!stopped) setInterrupted(true);
      } finally {
        inFlight = false;
      }
    }
    const refresh = () => void tick();
    refresh();
    const timer = window.setInterval(refresh, 3000);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      stopped = true;
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [token, retry]);
  if (expired)
    return (
      <p className="mm-baton-lead">
        This status link has expired. Your submitted answer is saved; check your
        workspace for the latest activity.
      </p>
    );
  const events = status?.events ?? [],
    commands = status?.commands ?? [];
  return (
    <section aria-label="Agent activity" className="mm-baton-activity">
      <p className="mm-baton-state" role="status">
        {status?.done
          ? "Your agent finished this task."
          : events.length || commands.length
            ? "Your agent has activity to review."
            : "Waiting for your agent to continue…"}
      </p>
      {interrupted && (
        <div className="mm-baton-retry" role="status">
          <p>Connection interrupted. Your answer is saved.</p>
          <button
            type="button"
            className="mm-bot-button mm-bot-button-secondary"
            onClick={() => setRetry((n) => n + 1)}
          >
            Reconnect
          </button>
        </div>
      )}
      {events.map((event, i) => (
        <article className="mm-baton-update" key={`${event.at}-${i}`}>
          <time dateTime={event.at}>
            {new Date(event.at).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </time>
          <p>{event.text}</p>
        </article>
      ))}
      {!!commands.length && (
        <details className="mm-baton-details">
          <summary>
            Activity details <span>{commands.length}</span>
          </summary>
          <div className="mm-baton-command-log">
            {commands.map((command, i) => (
              <div key={`${command.at}-${i}`}>
                <span>
                  {command.running
                    ? "Running"
                    : command.ok
                      ? "Completed"
                      : "Needs attention"}
                </span>
                <code>{command.cmd}</code>
                {command.tail && <p>{command.tail}</p>}
              </div>
            ))}
          </div>
        </details>
      )}
      {status?.done && status.liveUrl && (
        <a
          href={status.liveUrl}
          target="_blank"
          rel="noreferrer"
          className="mm-bot-button mm-baton-result"
        >
          Open result
        </a>
      )}
    </section>
  );
}
