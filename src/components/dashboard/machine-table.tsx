import {
  AlertCircle,
  ExternalLink,
  Loader2,
  Play,
  Plus,
  Square,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import {
  machineStats,
  type Machine,
  type MachineStatus,
} from "~/server/data/machines";

const statusLabel: Record<MachineStatus, string> = {
  running: "Running",
  starting: "Starting",
  stopped: "Stopped",
  error: "Error",
};

function StatusIcon({ status }: { status: MachineStatus }) {
  const className = "size-3.5 shrink-0";
  if (status === "running") return <Play className={className} aria-hidden />;
  if (status === "starting")
    return <Loader2 className={cn(className, "animate-spin")} aria-hidden />;
  if (status === "error")
    return <AlertCircle className={className} aria-hidden />;
  return <Square className={className} aria-hidden />;
}

/** Status + Open/Stop as one Cursor-like control cluster */
function StatusActions({ machine }: { machine: Machine }) {
  const { status } = machine;
  const canOpen = status !== "stopped" && status !== "error";
  const canStop = status === "running";

  return (
    <div
      className={cn(
        "inline-flex h-7 items-stretch overflow-hidden rounded-md border border-border",
        status === "running" && "border-signal/25",
        status === "error" && "border-destructive/30",
      )}
      role="group"
      aria-label={`${statusLabel[status]} controls`}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1.5 px-2 text-[12px]",
          status === "running" && "bg-signal/15 text-signal",
          status === "starting" && "bg-white/[0.06] text-foreground/70",
          status === "stopped" && "bg-white/[0.03] text-muted-foreground",
          status === "error" && "bg-destructive/15 text-destructive",
        )}
      >
        <StatusIcon status={status} />
        {statusLabel[status]}
      </span>

      <button
        type="button"
        disabled={!canOpen}
        title="Open machine"
        aria-label={`Open ${machine.name}`}
        className="inline-flex items-center justify-center border-l border-border px-2 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
      >
        <ExternalLink className="size-3.5" aria-hidden />
      </button>

      <button
        type="button"
        disabled={!canStop}
        title="Stop machine"
        aria-label={`Stop ${machine.name}`}
        className="inline-flex items-center justify-center border-l border-border px-2 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
      >
        <Square className="size-3 fill-current" aria-hidden />
      </button>
    </div>
  );
}

export function DashboardStats({ machines }: { machines: Machine[] }) {
  const stats = machineStats(machines);

  const items = [
    { label: "Running", value: stats.running, icon: Play },
    { label: "Starting", value: stats.starting, icon: Loader2 },
    { label: "Stopped", value: stats.stopped, icon: Square },
    { label: "Active vCPU", value: stats.vcpu, icon: null },
  ] as const;

  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-2.5">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border border-border bg-card px-3.5 py-3"
        >
          <dt className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            {item.icon ? (
              <item.icon className="size-3 opacity-70" aria-hidden />
            ) : null}
            {item.label}
          </dt>
          <dd className="mt-1 text-xl font-medium tracking-tight text-foreground tabular-nums">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function MachineTable({ machines }: { machines: Machine[] }) {
  if (machines.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
        <p className="text-sm font-medium text-foreground">No machines yet</p>
        <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-muted-foreground">
          Spin up a dedicated VM for your next agent session.
        </p>
        <Button
          className="mt-5 h-7 rounded-md bg-primary px-2.5 text-[13px] font-medium text-primary-foreground hover:bg-white"
          size="sm"
          asChild
        >
          <a href="#new" className="inline-flex items-center gap-1.5">
            <Plus className="size-3.5" aria-hidden />
            New machine
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border">
              {["Machine", "Agent", "Location", "Activity", "Status"].map(
                (h) => (
                  <th
                    key={h}
                    className={cn(
                      "px-3.5 py-2.5 text-[12px] font-medium text-muted-foreground",
                      h === "Status" && "text-right",
                    )}
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {machines.map((m, i) => (
              <tr
                key={m.id}
                className={cn(
                  "transition-colors hover:bg-white/[0.03]",
                  i !== machines.length - 1 && "border-b border-border",
                )}
              >
                <td className="px-3.5 py-3">
                  <div className="text-[13px] font-medium text-foreground">
                    {m.name}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                    {m.id}
                  </div>
                </td>
                <td className="px-3.5 py-3">
                  <div className="text-[13px] text-foreground">{m.agent}</div>
                  <div className="mt-0.5 max-w-[220px] truncate text-[12px] text-muted-foreground">
                    {m.task}
                  </div>
                </td>
                <td className="px-3.5 py-3">
                  <div className="font-mono text-[12px] text-muted-foreground">
                    {m.region}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-muted-foreground/80 tabular-nums">
                    {m.cpu} vCPU · {m.memoryGb} GB
                  </div>
                </td>
                <td className="px-3.5 py-3">
                  <div className="text-[13px] text-foreground tabular-nums">
                    {m.uptime}
                  </div>
                  <div className="mt-0.5 text-[12px] text-muted-foreground">
                    {m.lastActive}
                  </div>
                </td>
                <td className="px-3.5 py-3 text-right">
                  <StatusActions machine={m} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
