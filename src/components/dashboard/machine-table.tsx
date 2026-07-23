import { Loader2, Play, Square } from "lucide-react";

import { cn } from "~/lib/utils";
import { machineStats, type Machine } from "~/server/data/machines";

/** Separate status labels (not a bound ribbon bar). */
export function StatsRibbon({
  machines,
  className,
}: {
  machines: Machine[];
  className?: string;
}) {
  const stats = machineStats(machines);

  const items = [
    { label: "Running", value: stats.running, icon: Play },
    { label: "Starting", value: stats.starting, icon: Loader2 },
    { label: "Stopped", value: stats.stopped, icon: Square },
    { label: "vCPU", value: stats.vcpu, icon: null },
  ] as const;

  return (
    <dl
      className={cn("flex flex-wrap items-center gap-2", className)}
      aria-label="Fleet status"
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1"
        >
          <dt className="flex items-center gap-1 text-[11px] text-muted-foreground">
            {item.icon ? (
              <item.icon
                className={cn(
                  "size-3 opacity-70",
                  item.label === "Starting" && "animate-spin",
                )}
                aria-hidden
              />
            ) : null}
            <span>{item.label}</span>
          </dt>
          <dd className="text-[12px] font-medium tabular-nums text-foreground">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
