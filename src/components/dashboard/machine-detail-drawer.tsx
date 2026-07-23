"use client";

import {
  Activity,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  RotateCcw,
  Square,
  Terminal,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "~/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "~/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { cn } from "~/lib/utils";
import type { Machine, MachineStatus } from "~/server/data/machines";
import { api } from "~/trpc/react";

const statusLabel: Record<MachineStatus, string> = {
  running: "Running",
  starting: "Starting",
  stopped: "Stopped",
  error: "Error",
};

const packageManagers = [
  { id: "pnpm", label: "pnpm" },
  { id: "npm", label: "npm" },
  { id: "bun", label: "bun" },
  { id: "yarn", label: "yarn" },
  { id: "agent", label: "agent" },
] as const;

type PackageManager = (typeof packageManagers)[number]["id"];

function runCommand(pm: PackageManager, machineId: string): string {
  switch (pm) {
    case "pnpm":
      return `pnpm dlx @minimachines/cli run ${machineId}`;
    case "npm":
      return `npx @minimachines/cli run ${machineId}`;
    case "bun":
      return `bunx @minimachines/cli run ${machineId}`;
    case "yarn":
      return `yarn dlx @minimachines/cli run ${machineId}`;
    case "agent":
      return `pnpm dlx @minimachines/cli agent run ${machineId}`;
  }
}

function MachineRunCommand({ machine }: { machine: Machine }) {
  const [pm, setPm] = useState<PackageManager>("pnpm");
  const [copied, setCopied] = useState(false);
  const command = runCommand(pm, machine.id);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(t);
  }, [copied]);

  const copy = async (nextPm: PackageManager = pm) => {
    const text = runCommand(nextPm, machine.id);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const selectPm = (next: PackageManager) => {
    setPm(next);
    void copy(next);
  };

  return (
    <div className="mt-2 flex min-w-0 items-stretch gap-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 gap-1 rounded-md border-border bg-transparent px-2 text-[12px] font-medium text-foreground hover:bg-white/[0.04]"
            aria-label={`Package manager: ${pm}. Opens menu; selecting copies the run command.`}
          >
            {pm}
            <ChevronDown className="size-3 opacity-60" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[9rem]">
          {packageManagers.map((option) => (
            <DropdownMenuItem
              key={option.id}
              className="justify-between gap-3 text-[12px]"
              onSelect={() => selectPm(option.id)}
            >
              <span>{option.label}</span>
              <span className="text-muted-foreground">copy</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <button
        type="button"
        onClick={() => void copy()}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-card/60 px-2.5 text-left transition-colors",
          "hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
        aria-label={copied ? "Command copied" : "Copy run command"}
      >
        <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/90">
          {command}
        </code>
        {copied ? (
          <Check className="size-3.5 shrink-0 text-signal" aria-hidden />
        ) : (
          <Copy className="size-3.5 shrink-0 opacity-50" aria-hidden />
        )}
      </button>
    </div>
  );
}

function UsageGraph({ machine }: { machine: Machine }) {
  const w = 320;
  const h = 120;
  const pad = 4;
  const running = machine.status === "running";

  // Poll a live sample from inside the sandbox while the machine runs.
  const stats = api.machines.stats.useQuery(
    { id: machine.id },
    {
      enabled: running,
      refetchInterval: running ? 4000 : false,
      refetchOnWindowFocus: false,
    },
  );

  // Accumulate a rolling window of CPU-load samples for the line.
  const [samples, setSamples] = useState<number[]>([]);
  useEffect(() => {
    const pct = stats.data?.loadPct;
    if (pct !== undefined) setSamples((s) => [...s, pct].slice(-40));
  }, [stats.data]);
  // Reset history when switching to a different machine.
  useEffect(() => setSamples([]), [machine.id]);

  const latest = stats.data;
  const y = (pct: number) => pad + (1 - pct / 100) * (h - pad * 2);
  const points =
    samples.length >= 2
      ? samples
          .map((p, i) => `${(i / (samples.length - 1)) * w},${y(p)}`)
          .join(" ")
      : null;

  return (
    <div className="space-y-3 pt-1">
      <div className="flex items-baseline justify-between gap-3 px-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            CPU usage
          </p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {running ? "live" : machine.status} · {machine.cpu} vCPU ·{" "}
            {machine.memoryGb} GB
          </p>
        </div>
        <div className="text-right">
          <p className="text-xl font-medium tabular-nums tracking-tight text-foreground">
            {latest ? `${latest.loadPct}%` : "—"}
          </p>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {latest
              ? `${latest.memUsedMb}/${latest.memTotalMb} MB`
              : running
                ? "sampling…"
                : "no data"}
          </p>
        </div>
      </div>

      <div className="w-full border-y border-border bg-card/60">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          className="block h-32 w-full text-muted-foreground"
          role="img"
          aria-label="CPU load over time"
        >
          {[25, 50, 75].map((gl) => (
            <line
              key={gl}
              x1={0}
              x2={w}
              y1={y(gl)}
              y2={y(gl)}
              stroke="currentColor"
              strokeOpacity="0.08"
              className="text-foreground"
            />
          ))}
          {points ? (
            <polyline
              points={points}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeOpacity={0.85}
              className="text-foreground"
            />
          ) : (
            <text
              x={w / 2}
              y={h / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-muted-foreground text-[11px]"
            >
              {running ? "sampling…" : "Metrics unavailable"}
            </text>
          )}
        </svg>
      </div>
    </div>
  );
}

const actionRow = cn(
  "inline-flex h-10 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] font-medium text-foreground transition-colors",
  "hover:bg-white/[0.04] disabled:pointer-events-none disabled:opacity-35",
);

function QuickActions({
  machine,
  onDeleted,
}: {
  machine: Machine;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const stop = api.machines.stop.useMutation({ onSuccess: refresh });
  const restart = api.machines.restart.useMutation({ onSuccess: refresh });
  const del = api.machines.delete.useMutation({
    onSuccess: () => {
      refresh();
      onDeleted();
    },
  });
  const busy = stop.isPending || restart.isPending || del.isPending;

  const running = machine.status === "running";
  const stopped = machine.status === "stopped" || machine.status === "error";
  const err = stop.error ?? restart.error ?? del.error;

  return (
    <div className="px-3 pb-1 pt-3">
      <p className="px-1.5 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Quick actions
      </p>
      <ul className="space-y-0.5">
        {running && machine.emulatorUrl && (
          <li>
            <a
              href={machine.emulatorUrl}
              target="_blank"
              rel="noreferrer"
              className={actionRow}
            >
              <Terminal className="size-3.5 shrink-0 opacity-70" aria-hidden />
              Open console
              <ExternalLink
                className="ml-auto size-3 shrink-0 opacity-40"
                aria-hidden
              />
            </a>
          </li>
        )}

        {/* Restart = terminate the sandbox and provision a fresh one. */}
        <li>
          <button
            type="button"
            disabled={busy || (!running && !stopped)}
            onClick={() => restart.mutate({ id: machine.id })}
            className={actionRow}
          >
            <RotateCcw className="size-3.5 shrink-0 opacity-70" aria-hidden />
            {restart.isPending ? "Restarting…" : "Restart"}
          </button>
        </li>

        {/* Stop a running machine; Start (re-provision) a stopped one. */}
        <li>
          <button
            type="button"
            disabled={busy || (!running && !stopped)}
            onClick={() =>
              running
                ? stop.mutate({ id: machine.id })
                : restart.mutate({ id: machine.id })
            }
            className={actionRow}
          >
            {running ? (
              <Square className="size-3.5 shrink-0 opacity-70" aria-hidden />
            ) : (
              <Activity className="size-3.5 shrink-0 opacity-70" aria-hidden />
            )}
            {running
              ? stop.isPending
                ? "Stopping…"
                : "Stop"
              : restart.isPending
                ? "Starting…"
                : "Start"}
          </button>
        </li>

        {/* Delete needs a second click to confirm (destructive). */}
        <li>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              confirmDelete
                ? del.mutate({ id: machine.id })
                : setConfirmDelete(true)
            }
            className={cn(actionRow, "text-destructive")}
          >
            <Trash2 className="size-3.5 shrink-0 opacity-70" aria-hidden />
            {del.isPending
              ? "Deleting…"
              : confirmDelete
                ? "Confirm delete?"
                : "Delete"}
          </button>
        </li>
      </ul>

      {err && (
        <p className="px-2.5 pt-1 text-[12px] text-destructive" role="alert">
          {err.message}
        </p>
      )}
    </div>
  );
}

function RemotePanel({ machine }: { machine: Machine }) {
  const [cmd, setCmd] = useState("");
  const canRun = machine.status === "running";
  const exec = api.machines.exec.useMutation();
  const result = exec.data;

  const run = () => {
    const trimmed = cmd.trim();
    if (!trimmed || !canRun || exec.isPending) return;
    exec.mutate({ id: machine.id, cmd: trimmed });
  };

  return (
    <div className="space-y-2 px-3 pb-1 pt-3">
      <div className="flex min-w-0 items-stretch gap-1.5">
        <input
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              run();
            }
          }}
          disabled={!canRun}
          placeholder="ls -la"
          aria-label="Shell command"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className={cn(
            "flex h-8 min-w-0 flex-1 rounded-md border border-border bg-card/60 px-2.5 font-mono text-[12px] text-foreground/90",
            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        />
        <Button
          type="button"
          size="sm"
          onClick={run}
          disabled={!canRun || exec.isPending || !cmd.trim()}
          className="h-8 shrink-0 rounded-md px-3 text-[12px] font-medium"
        >
          {exec.isPending ? "Running…" : "Run"}
        </Button>
      </div>

      {!canRun ? (
        <p className="px-0.5 text-[11px] text-muted-foreground">
          Start the machine to run commands.
        </p>
      ) : (
        <p className="px-0.5 text-[11px] text-muted-foreground">
          Runs as <code className="font-mono">agent</code> under{" "}
          <code className="font-mono">/workspace</code>.
        </p>
      )}

      {exec.error ? (
        <p
          className="rounded-md border border-border bg-card/60 px-2.5 py-2 text-[11px] text-destructive"
          role="alert"
        >
          {exec.error.message}
        </p>
      ) : null}

      {result ? (
        <div className="rounded-md border border-border bg-card/60">
          <pre className="max-h-56 overflow-auto px-2.5 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
            {result.stdout ? (
              <span className="text-foreground/90">{result.stdout}</span>
            ) : null}
            {result.stderr ? (
              <span className="text-destructive">{result.stderr}</span>
            ) : null}
            {!result.stdout && !result.stderr ? (
              <span className="text-muted-foreground">(no output)</span>
            ) : null}
          </pre>
          <p className="border-t border-border px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground tabular-nums">
            exit {result.exitCode} · {result.durationMs}ms
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function MachineDetailDrawer({
  machine,
  open,
  onOpenChange,
}: {
  machine: Machine | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [tab, setTab] = useState<"overview" | "remote">("overview");
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mm-app mm-cursor-panel max-h-[90vh] border-border">
        {machine ? (
          <>
            <DrawerHeader className="px-4 pb-2 pt-1 text-left">
              <DrawerTitle className="text-sm font-medium tracking-tight">
                {machine.title}
              </DrawerTitle>
              <DrawerDescription className="sr-only">
                {machine.name} · {statusLabel[machine.status]} · {machine.region}
                {machine.status === "running" || machine.status === "starting"
                  ? ` · ${machine.uptime}`
                  : ""}
              </DrawerDescription>
              <MachineRunCommand machine={machine} />
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {statusLabel[machine.status]} · {machine.region}
                {machine.status === "running" || machine.status === "starting"
                  ? ` · ${machine.uptime}`
                  : null}
              </p>
            </DrawerHeader>

            <div className="px-3 pt-1">
              <div
                role="tablist"
                aria-label="Machine detail sections"
                className="inline-flex h-8 items-center gap-0.5 rounded-md border border-border bg-card/60 p-0.5"
              >
                {(["overview", "remote"] as const).map((id) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    onClick={() => setTab(id)}
                    className={cn(
                      "h-7 rounded-[5px] px-3 text-[12px] font-medium capitalize transition-colors",
                      tab === id
                        ? "bg-white/[0.06] text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {id}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pb-2">
              {tab === "overview" ? (
                <>
                  <UsageGraph machine={machine} />
                  <QuickActions
                    machine={machine}
                    onDeleted={() => onOpenChange(false)}
                  />
                </>
              ) : (
                <RemotePanel machine={machine} />
              )}
            </div>

            <DrawerFooter className="pt-1">
              <DrawerClose asChild>
                <Button
                  variant="outline"
                  className="h-9 w-full rounded-md border-border bg-transparent text-[13px] text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                >
                  Close
                </Button>
              </DrawerClose>
            </DrawerFooter>
          </>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}
