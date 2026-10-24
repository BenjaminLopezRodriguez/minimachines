"use client";

import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Globe,
  GitBranch,
  Lock,
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
            className="border-border text-foreground h-8 shrink-0 gap-1 rounded-md bg-transparent px-2 text-[12px] font-medium hover:bg-white/[0.04]"
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
          "border-border bg-card/60 flex min-w-0 flex-1 items-center gap-2 rounded-md border px-2.5 text-left transition-colors",
          "focus-visible:ring-ring hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:outline-none",
        )}
        aria-label={copied ? "Command copied" : "Copy run command"}
      >
        <code className="text-foreground/90 min-w-0 flex-1 truncate font-mono text-[11px]">
          {command}
        </code>
        {copied ? (
          <Check className="text-signal size-3.5 shrink-0" aria-hidden />
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
          <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
            CPU usage
          </p>
          <p className="text-muted-foreground mt-0.5 text-[13px]">
            {running ? "live" : machine.status} · {machine.cpu} vCPU ·{" "}
            {machine.memoryGb} GB
          </p>
        </div>
        <div className="text-right">
          <p className="text-foreground text-xl font-medium tracking-tight tabular-nums">
            {latest ? `${latest.loadPct}%` : "—"}
          </p>
          <p className="text-muted-foreground text-[11px] tabular-nums">
            {latest
              ? `${latest.memUsedMb}/${latest.memTotalMb} MB`
              : running
                ? "sampling…"
                : "no data"}
          </p>
        </div>
      </div>

      <div className="border-border bg-card/60 w-full border-y">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          className="text-muted-foreground block h-32 w-full"
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
  const [confirm, setConfirm] = useState<"stop" | "restart" | "delete" | null>(
    null,
  );
  const refresh = () => {
    setConfirm(null);
    router.refresh();
  };
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
  const restartable =
    running || machine.status === "stopped" || machine.status === "error";
  const error = stop.error ?? restart.error ?? del.error;
  const act = () => {
    if (busy || !confirm) return;
    if (confirm === "stop") stop.mutate({ id: machine.id });
    else if (confirm === "restart") restart.mutate({ id: machine.id });
    else del.mutate({ id: machine.id });
  };

  return (
    <div className="px-3 pt-3 pb-1">
      <p className="px-1.5 pb-1.5 text-sm font-medium">Machine actions</p>
      <ul className="space-y-0.5">
        {running && machine.emulatorUrl ? (
          <li>
            <a
              href={machine.emulatorUrl}
              target="_blank"
              rel="noreferrer"
              className={actionRow}
            >
              <Terminal size={16} aria-hidden="true" />
              Open console
              <ExternalLink className="ml-auto" size={14} aria-hidden="true" />
            </a>
          </li>
        ) : null}
        {running && machine.appUrl ? (
          <li>
            <a
              href={machine.appUrl}
              target="_blank"
              rel="noreferrer"
              className={actionRow}
            >
              <Globe size={16} aria-hidden="true" />
              Open app
              <ExternalLink className="ml-auto" size={14} aria-hidden="true" />
            </a>
          </li>
        ) : null}
        <li>
          <a href={`/dashboard/git?machine=${encodeURIComponent(machine.id)}`} className={actionRow}>
            <GitBranch size={16} aria-hidden="true" />
            Open Git workspace
          </a>
        </li>
        <li>
          <button
            type="button"
            className={actionRow}
            disabled={busy || !restartable}
            onClick={() => setConfirm("restart")}
          >
            <RotateCcw size={16} aria-hidden="true" />
            {running
              ? "Restart with a fresh workspace"
              : "Start a fresh workspace"}
          </button>
        </li>
        {running ? (
          <li>
            <button
              type="button"
              className={actionRow}
              disabled={busy}
              onClick={() => setConfirm("stop")}
            >
              <Square size={16} aria-hidden="true" />
              Stop machine
            </button>
          </li>
        ) : null}
        <li>
          <button
            type="button"
            className={cn(actionRow, "text-destructive")}
            disabled={busy}
            onClick={() => setConfirm("delete")}
          >
            <Trash2 size={16} aria-hidden="true" />
            Delete machine
          </button>
        </li>
      </ul>
      {confirm ? (
        <div
          className="mm-machine-confirm"
          role="region"
          aria-label="Confirm machine action"
        >
          <h3>
            {confirm === "stop"
              ? "Stop this machine?"
              : confirm === "restart"
                ? "Start with a fresh workspace?"
                : "Delete this machine?"}
          </h3>
          <p>
            {confirm === "restart"
              ? "This creates a new workspace and starts cloud compute. Previous files won’t be restored. Export anything you need before continuing."
              : confirm === "stop"
                ? "Save or export your work first. Files in this temporary workspace may be lost when the machine stops."
                : "This removes the machine and its temporary workspace. Save or export any work you need first."}
          </p>
          <div>
            <button
              type="button"
              className="mm-dashboard-button mm-dashboard-button-secondary"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="mm-dashboard-button mm-dashboard-button-danger"
              disabled={busy}
              onClick={act}
            >
              {busy
                ? "Working…"
                : confirm === "stop"
                  ? "Stop machine"
                  : confirm === "restart"
                    ? "Create fresh workspace"
                    : "Delete machine"}
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="text-destructive px-2.5 pt-2 text-sm" role="alert">
          {error.message}
        </p>
      ) : null}
    </div>
  );
}

function RemotePanel({ machine }: { machine: Machine }) {
  const [cmd, setCmd] = useState("");
  const [saveCheckpoint, setSaveCheckpoint] = useState(false);
  const [repositoryPath, setRepositoryPath] = useState("/workspace");
  const canRun = machine.status === "running";
  const exec = api.machines.exec.useMutation();
  const result = exec.data;

  const run = () => {
    const trimmed = cmd.trim();
    if (!trimmed || !canRun || exec.isPending) return;
    exec.mutate({ id: machine.id, cmd: trimmed, checkpoint: saveCheckpoint ? { path: repositoryPath, label: "Before dashboard command", agent: machine.agent } : undefined });
  };

  return (
    <div className="space-y-2 px-3 pt-3 pb-1">
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
            "border-border bg-card/60 text-foreground/90 flex h-8 min-w-0 flex-1 rounded-md border px-2.5 font-mono text-[12px]",
            "placeholder:text-muted-foreground focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
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

      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={saveCheckpoint} onChange={e => setSaveCheckpoint(e.target.checked)} disabled={!canRun || exec.isPending} />
        Save a checkpoint before running
      </label>
      {saveCheckpoint && <input aria-label="Checkpoint repository path" value={repositoryPath} onChange={e => setRepositoryPath(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-xs" placeholder="/workspace/my-project" disabled={exec.isPending} />}
      {!canRun ? (
        <p className="text-muted-foreground px-0.5 text-[11px]">
          Start the machine to run commands.
        </p>
      ) : (
        <p className="text-muted-foreground px-0.5 text-[11px]">
          Runs as <code className="font-mono">agent</code> under{" "}
          <code className="font-mono">/workspace</code>.
        </p>
      )}

      {exec.error ? (
        <p
          className="border-border bg-card/60 text-destructive rounded-md border px-2.5 py-2 text-[11px]"
          role="alert"
        >
          {exec.error.message}
        </p>
      ) : null}

      {result ? (
        <div className="border-border bg-card/60 rounded-md border">
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
          <p className="border-border text-muted-foreground border-t px-2.5 py-1.5 font-mono text-[11px] tabular-nums">
            exit {result.exitCode} · {result.durationMs}ms
          </p>
          {result.checkpointRef && <a className="mm-dashboard-text-link px-3 py-2 text-xs" href={`/dashboard/git?machine=${encodeURIComponent(machine.id)}`}>View saved checkpoint</a>}
        </div>
      ) : null}
    </div>
  );
}

type ShareItem = {
  slug: string;
  url: string;
  machineId: string | null;
  port: number | null;
  kind: string;
  access: string;
  enabled: boolean;
};

function ShareLinkRow({
  share,
  onRevoke,
  revoking,
}: {
  share: ShareItem;
  onRevoke: () => void;
  revoking: boolean;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(t);
  }, [copied]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(share.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <li className="border-border bg-card/60 flex items-center gap-1.5 rounded-md border px-2.5 py-1.5">
      <button
        type="button"
        onClick={() => void copy()}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        aria-label={copied ? "Link copied" : "Copy share link"}
      >
        <code className="text-foreground/90 min-w-0 flex-1 truncate font-mono text-[11px]">
          {share.url}
        </code>
        {copied ? (
          <Check className="text-signal size-3.5 shrink-0" aria-hidden />
        ) : (
          <Copy className="size-3.5 shrink-0 opacity-50" aria-hidden />
        )}
      </button>
      <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-[10px] uppercase tabular-nums">
        :{share.port}
        {share.access === "gated" ? (
          <Lock className="size-3" aria-label="password protected" />
        ) : null}
      </span>
      <button
        type="button"
        onClick={onRevoke}
        disabled={revoking}
        className="text-destructive shrink-0 disabled:opacity-40"
        aria-label="Revoke share"
      >
        <Trash2 className="size-3.5" aria-hidden />
      </button>
    </li>
  );
}

function SharePanel({ machine }: { machine: Machine }) {
  const running = machine.status === "running";
  const [port, setPort] = useState("3000");
  const [kind, setKind] = useState<"website" | "api">("website");
  const [gated, setGated] = useState(false);
  const [secret, setSecret] = useState("");

  const utils = api.useUtils();
  const list = api.shares.list.useQuery();
  const create = api.shares.create.useMutation({
    onSuccess: () => {
      setSecret("");
      void utils.shares.list.invalidate();
    },
  });
  const revoke = api.shares.revoke.useMutation({
    onSuccess: () => void utils.shares.list.invalidate(),
  });

  const mine = (list.data ?? []).filter(
    (s) => s.machineId === machine.id && s.enabled,
  );

  const submit = () => {
    const p = Number(port);
    if (!running || !p || (gated && !secret.trim())) return;
    create.mutate({
      machineId: machine.id,
      port: p,
      kind,
      access: gated ? "gated" : "public",
      secret: gated ? secret.trim() : undefined,
    });
  };

  return (
    <div className="space-y-3 px-3 pt-3 pb-1">
      {!running ? (
        <p className="text-muted-foreground px-0.5 text-[11px]">
          Start the machine to create share links.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="flex items-stretch gap-1.5">
            <input
              value={port}
              onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              aria-label="Port"
              placeholder="3000"
              className="border-border bg-card/60 text-foreground/90 focus-visible:ring-ring h-8 w-16 rounded-md border px-2.5 font-mono text-[12px] focus-visible:ring-2 focus-visible:outline-none"
            />
            <div
              role="tablist"
              aria-label="Share kind"
              className="border-border bg-card/60 inline-flex h-8 items-center gap-0.5 rounded-md border p-0.5"
            >
              {(["website", "api"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={kind === k}
                  onClick={() => setKind(k)}
                  className={cn(
                    "h-7 rounded-[5px] px-2.5 text-[12px] capitalize transition-colors",
                    kind === k
                      ? "text-foreground bg-white/[0.06]"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {k}
                </button>
              ))}
            </div>
            <Button
              type="button"
              size="sm"
              onClick={submit}
              disabled={create.isPending || (gated && !secret.trim())}
              className="h-8 shrink-0 rounded-md px-3 text-[12px] font-medium"
            >
              {create.isPending ? "Creating…" : "Share"}
            </Button>
          </div>

          <label className="text-muted-foreground flex items-center gap-2 px-0.5 text-[12px]">
            <input
              type="checkbox"
              checked={gated}
              onChange={(e) => setGated(e.target.checked)}
              className="accent-foreground size-3.5"
            />
            Password-protect
          </label>
          {gated ? (
            <input
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              type="password"
              placeholder="share password"
              aria-label="Share password"
              className="border-border bg-card/60 text-foreground/90 focus-visible:ring-ring h-8 w-full rounded-md border px-2.5 text-[12px] focus-visible:ring-2 focus-visible:outline-none"
            />
          ) : null}

          {create.error ? (
            <p className="text-destructive text-[12px]" role="alert">
              {create.error.message}
            </p>
          ) : null}
        </div>
      )}

      {mine.length > 0 ? (
        <ul className="space-y-1">
          {mine.map((s) => (
            <ShareLinkRow
              key={s.slug}
              share={s}
              onRevoke={() => revoke.mutate({ slug: s.slug })}
              revoking={revoke.isPending}
            />
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground px-0.5 text-[11px]">
          No share links yet. Pick the port your app listens on and Share.
        </p>
      )}
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
  const [tab, setTab] = useState<"overview" | "remote" | "share">("overview");
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mm-app mm-cursor-panel mm-machine-drawer border-border max-h-[90vh]">
        {machine ? (
          <>
            <DrawerHeader className="px-4 pt-1 pb-2 text-left">
              <DrawerTitle className="text-sm font-medium tracking-tight">
                {machine.title}
              </DrawerTitle>
              <DrawerDescription className="sr-only">
                {machine.name} · {statusLabel[machine.status]} ·{" "}
                {machine.region}
                {machine.status === "running" || machine.status === "starting"
                  ? ` · ${machine.uptime}`
                  : ""}
              </DrawerDescription>
              <MachineRunCommand machine={machine} />
              <p className="text-muted-foreground mt-1.5 text-[11px]">
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
                className="border-border bg-card/60 inline-flex h-8 items-center gap-0.5 rounded-md border p-0.5"
              >
                {(["overview", "remote", "share"] as const).map((id) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    id={`machine-tab-${id}`}
                    aria-controls={`machine-panel-${id}`}
                    aria-selected={tab === id}
                    tabIndex={tab === id ? 0 : -1}
                    onKeyDown={(event) => {
                      const sections = ["overview", "remote", "share"] as const;
                      const index = sections.indexOf(id);
                      const nextIndex =
                        event.key === "ArrowRight"
                          ? (index + 1) % sections.length
                          : event.key === "ArrowLeft"
                            ? (index + sections.length - 1) % sections.length
                            : event.key === "Home"
                              ? 0
                              : event.key === "End"
                                ? sections.length - 1
                                : null;
                      if (nextIndex === null) return;
                      event.preventDefault();
                      const next = sections[nextIndex]!;
                      setTab(next);
                      document.getElementById(`machine-tab-${next}`)?.focus();
                    }}
                    onClick={() => setTab(id)}
                    className={cn(
                      "h-7 rounded-[5px] px-3 text-[12px] font-medium capitalize transition-colors",
                      tab === id
                        ? "text-foreground bg-white/[0.06]"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {id === "overview"
                      ? "Overview"
                      : id === "remote"
                        ? "Terminal"
                        : "Share links"}
                  </button>
                ))}
              </div>
            </div>

            <div
              id={`machine-panel-${tab}`}
              role="tabpanel"
              aria-labelledby={`machine-tab-${tab}`}
              tabIndex={0}
              className="min-h-0 flex-1 overflow-y-auto pb-2"
            >
              {tab === "overview" ? (
                <>
                  <UsageGraph machine={machine} />
                  <QuickActions
                    machine={machine}
                    onDeleted={() => onOpenChange(false)}
                  />
                </>
              ) : tab === "remote" ? (
                <RemotePanel machine={machine} />
              ) : (
                <SharePanel machine={machine} />
              )}
            </div>

            <DrawerFooter className="pt-1">
              <DrawerClose asChild>
                <Button
                  variant="outline"
                  className="border-border text-muted-foreground hover:text-foreground h-9 w-full rounded-md bg-transparent text-[13px] hover:bg-white/[0.04]"
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
