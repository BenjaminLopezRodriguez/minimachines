"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { MachineDetailDrawer } from "~/components/dashboard/machine-detail-drawer";
import { cn } from "~/lib/utils";
import { type Machine, type MachineStatus } from "~/server/data/machines";

const statusDot: Record<MachineStatus, string> = {
  running: "bg-signal",
  starting: "bg-foreground/50 animate-pulse",
  stopped: "bg-muted-foreground/40",
  error: "bg-destructive",
};

const statusLabel: Record<MachineStatus, string> = {
  running: "Running",
  starting: "Starting",
  stopped: "Stopped",
  error: "Error",
};

/** Main-canvas fleet list — unbound; opens machine detail drawer. */
export function FleetList({ machines }: { machines: Machine[] }) {
  const [selected, setSelected] = useState<Machine | null>(null);
  const open = selected !== null;

  useEffect(() => {
    const id = window.location.hash.replace(/^#/, "");
    if (!id || id === "new") return;
    const match = machines.find((m) => m.id === id);
    if (match) setSelected(match);
  }, [machines]);

  if (machines.length === 0) {
    return (
      <div className="px-0.5 py-10 text-center">
        <p className="text-foreground text-sm font-medium">No machines yet</p>
        <p className="text-muted-foreground mx-auto mt-1.5 max-w-sm text-[13px]">
          Spin up a dedicated VM for your next agent session. Press{" "}
          <kbd className="border-border rounded border px-1 font-mono text-[11px]">
            ⌘K
          </kbd>{" "}
          or use New machine.
        </p>
        <Link
          href="/install"
          className="text-signal mt-4 inline-flex min-h-11 items-center rounded-md px-3 text-sm underline underline-offset-4 focus-visible:outline-2"
        >
          Set up the CLI and your agent
        </Link>
      </div>
    );
  }

  return (
    <>
      <ul className="space-y-0.5">
        {machines.map((m) => (
          <li key={m.id} id={m.id}>
            <button
              type="button"
              title={m.title}
              onClick={() => {
                setSelected(m);
                window.history.replaceState(null, "", `#${m.id}`);
              }}
              className="group flex w-full items-start gap-3 rounded-md px-1.5 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
            >
              <span
                className={cn(
                  "mt-1.5 size-1.5 shrink-0 rounded-full",
                  statusDot[m.status],
                )}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="text-foreground block truncate text-[13px] leading-snug font-medium">
                  {m.title}
                </span>
                <span className="text-muted-foreground mt-0.5 block truncate text-[12px]">
                  {m.name} · {statusLabel[m.status]}
                  {m.status === "running" || m.status === "starting"
                    ? ` · ${m.uptime}`
                    : null}
                </span>
              </span>
              <span className="text-muted-foreground/80 shrink-0 pt-0.5 font-mono text-[11px]">
                {m.region}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <MachineDetailDrawer
        machine={selected}
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            setSelected(null);
            if (window.location.hash.replace(/^#/, "") !== "new") {
              window.history.replaceState(null, "", "/dashboard");
            }
          }
        }}
      />
    </>
  );
}
