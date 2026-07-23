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

export function MachineDetailDrawer({
  machine,
  open,
  onOpenChange,
}: {
  machine: Machine | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
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

            <div className="min-h-0 flex-1 overflow-y-auto pb-2">
              <UsageGraph machine={machine} />
              <QuickActions machine={machine} />
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
