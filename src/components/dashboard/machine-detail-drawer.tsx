"use client";

import {
  Activity,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  HeartPulse,
  RotateCcw,
  Square,
  Terminal,
} from "lucide-react";
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

  return (
    <div className="space-y-3 pt-1">
      <div className="flex items-baseline justify-between gap-3 px-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            CPU usage
          </p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Last hour · {machine.cpu} vCPU · {machine.memoryGb} GB
          </p>
        </div>
        <div className="text-right">
          <p className="text-xl font-medium tabular-nums tracking-tight text-foreground">
            —
          </p>
          <p className="text-[11px] text-muted-foreground">no data</p>
        </div>
      </div>

      <div className="w-full border-y border-border bg-card/60">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          className="block h-32 w-full text-muted-foreground"
          role="img"
          aria-label="CPU usage unavailable"
        >
          {[25, 50, 75].map((y) => (
            <line
              key={y}
              x1={0}
              x2={w}
              y1={pad + (1 - y / 100) * (h - pad * 2)}
              y2={pad + (1 - y / 100) * (h - pad * 2)}
              stroke="currentColor"
              strokeOpacity="0.08"
              className="text-foreground"
            />
          ))}
          <text
            x={w / 2}
            y={h / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-muted-foreground text-[11px]"
          >
            Metrics unavailable
          </text>
        </svg>
      </div>
    </div>
  );
}

function QuickActions({ machine }: { machine: Machine }) {
  const canRun = machine.status === "running";
  const canStop = machine.status === "running";
  const canStart =
    machine.status === "stopped" || machine.status === "error";

  const actions = [
    {
      id: "health",
      label: "Check health",
      icon: HeartPulse,
      disabled: machine.status === "starting",
    },
    {
      id: "open",
      label: "Open machine",
      icon: ExternalLink,
      disabled: !canRun,
    },
    {
      id: "console",
      label: "Open console",
      icon: Terminal,
      disabled: !canRun || !machine.emulatorUrl,
      // Browser terminal for this machine, when one is reachable.
      href: canRun ? machine.emulatorUrl : undefined,
    },
    {
      id: "restart",
      label: "Restart",
      icon: RotateCcw,
      disabled: !canRun,
    },
    {
      id: "stop",
      label: canStart ? "Start" : "Stop",
      icon: canStart ? Activity : Square,
      disabled: !(canStop || canStart),
    },
  ] as const;

  return (
    <div className="px-3 pb-1 pt-3">
      <p className="px-1.5 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Quick actions
      </p>
      <ul className="space-y-0.5">
        {actions.map((action) => {
          const cls = cn(
            "inline-flex h-10 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] font-medium text-foreground transition-colors",
            "hover:bg-white/[0.04] disabled:pointer-events-none disabled:opacity-35",
          );
          const href = "href" in action ? action.href : undefined;
          return (
            <li key={action.id}>
              {href && !action.disabled ? (
                <a href={href} target="_blank" rel="noreferrer" className={cls}>
                  <action.icon
                    className="size-3.5 shrink-0 opacity-70"
                    aria-hidden
                  />
                  {action.label}
                  <ExternalLink
                    className="ml-auto size-3 shrink-0 opacity-40"
                    aria-hidden
                  />
                </a>
              ) : (
                <button type="button" disabled={action.disabled} className={cls}>
                  <action.icon
                    className="size-3.5 shrink-0 opacity-70"
                    aria-hidden
                  />
                  {action.label}
                </button>
              )}
            </li>
          );
        })}
      </ul>
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
                  <QuickActions machine={machine} />
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
