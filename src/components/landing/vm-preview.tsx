"use client";

const rows = [
  {
    agent: "claude",
    task: "refactor auth middleware",
    status: "running",
    cpu: "4 vCPU",
    mem: "16 GB",
  },
  {
    agent: "codex",
    task: "write integration tests",
    status: "running",
    cpu: "8 vCPU",
    mem: "32 GB",
  },
  {
    agent: "grok",
    task: "benchmark cold starts",
    status: "queued",
    cpu: "4 vCPU",
    mem: "16 GB",
  },
] as const;

export function VmPreview() {
  return (
    <div className="border-border bg-surface relative overflow-hidden border">
      <div
        aria-hidden
        className="mm-scan-line pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-signal/10 to-transparent opacity-40"
      />

      <div className="border-border flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
            / runtime
          </span>
          <span className="text-muted-foreground/40">·</span>
          <span className="font-mono text-[11px] text-foreground/70">
            vm-7f3a · us-west
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="mm-pulse-dot size-1.5 rounded-full bg-signal" />
          <span className="font-mono text-[11px] text-signal">live</span>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-x-6 border-b border-border px-4 py-2 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
        <span>agent / task</span>
        <span className="text-right">resources</span>
      </div>

      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li
            key={row.agent}
            className="grid grid-cols-[1fr_auto] items-center gap-x-6 px-4 py-3.5"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <span
                  className={
                    row.status === "running"
                      ? "mm-pulse-dot size-1.5 shrink-0 rounded-full bg-signal"
                      : "size-1.5 shrink-0 rounded-full bg-muted-foreground/50"
                  }
                />
                <span className="font-mono text-sm text-foreground">
                  {row.agent}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {row.status}
                </span>
              </div>
              <p className="mt-1 truncate pl-4 font-mono text-xs text-muted-foreground">
                {row.task}
              </p>
            </div>
            <div className="shrink-0 text-right font-mono text-[11px] text-muted-foreground">
              <div>{row.cpu}</div>
              <div>{row.mem}</div>
            </div>
          </li>
        ))}
      </ul>

      <div className="border-t border-border bg-background/40 px-4 py-3">
        <p className="font-mono text-xs text-muted-foreground">
          <span className="text-signal">→</span> provisioned in 1.4s · isolated
          rootfs · persistent workspace
          <span className="mm-cursor ml-0.5 inline-block h-3 w-1.5 translate-y-0.5 bg-foreground/80 align-middle" />
        </p>
      </div>
    </div>
  );
}
