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
    <div className="relative overflow-hidden rounded-lg border border-border bg-[#141414] text-[#ededed] shadow-[0_0_0_1px_rgb(255_255_255/0.04),0_18px_50px_-28px_rgb(0_0_0/0.55)] dark:bg-card">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-signal/15 to-transparent opacity-50"
      />

      <div className="flex items-center justify-between border-b border-white/[0.08] px-3.5 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="text-[12px] text-white/45">Runtime</span>
          <span className="text-white/20">·</span>
          <span className="font-mono text-[11px] text-white/55">
            vm-7f3a · us-west
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="mm-pulse-dot size-1.5 rounded-full bg-signal" />
          <span className="text-[12px] text-signal">Live</span>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-x-6 border-b border-white/[0.08] px-3.5 py-2 text-[11px] text-white/40">
        <span>Agent / task</span>
        <span className="text-right">Resources</span>
      </div>

      <ul className="divide-y divide-white/[0.06]">
        {rows.map((row) => (
          <li
            key={row.agent}
            className="grid grid-cols-[1fr_auto] items-center gap-x-6 px-3.5 py-3 transition-colors hover:bg-white/[0.03]"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={
                    row.status === "running"
                      ? "mm-pulse-dot size-1.5 shrink-0 rounded-full bg-signal"
                      : "size-1.5 shrink-0 rounded-full bg-white/30"
                  }
                />
                <span className="text-[13px] font-medium text-white/90">
                  {row.agent}
                </span>
                <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-white/50">
                  {row.status}
                </span>
              </div>
              <p className="mt-1 truncate pl-3.5 text-[12px] text-white/40">
                {row.task}
              </p>
            </div>
            <div className="shrink-0 text-right font-mono text-[11px] text-white/40 tabular-nums">
              <div>{row.cpu}</div>
              <div>{row.mem}</div>
            </div>
          </li>
        ))}
      </ul>

      <div className="border-t border-white/[0.08] bg-white/[0.02] px-3.5 py-2.5">
        <p className="text-[12px] text-white/40">
          <span className="text-signal">→</span> provisioned in 1.4s · isolated
          rootfs · persistent workspace
          <span className="mm-cursor ml-0.5 inline-block h-3 w-1.5 translate-y-0.5 bg-white/70 align-middle" />
        </p>
      </div>
    </div>
  );
}
