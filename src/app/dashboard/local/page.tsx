import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { notFound } from "next/navigation";

import { FleetList } from "~/components/dashboard/fleet-list";
import { StatsRibbon } from "~/components/dashboard/machine-table";
import type { Machine, MachineStatus } from "~/server/data/machines";

// Local-only view of real Docker minimachines, rendered through the real
// dashboard components. Reads ~/.minimachine state and the Docker daemon
// directly — this cannot work on Vercel, which has neither.
export const dynamic = "force-dynamic";

const STATE = join(homedir(), ".minimachine");

type Local = {
  machine: Machine;
  ttyPort: string | null;
  result: string;
  files: string[];
};

function read(path: string): string {
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return "";
  }
}

function docker(args: string[]): string {
  try {
    return execFileSync("docker", args, {
      encoding: "utf8",
      timeout: 5000,
    }).trim();
  } catch {
    return "";
  }
}

function toStatus(state: string): MachineStatus {
  if (state === "running") return "running";
  if (state === "exited") return "stopped";
  if (state === "created" || state === "restarting") return "starting";
  return "error";
}

/** First sentence-ish of the prompt, for the sidebar activity label. */
function titleOf(prompt: string): string {
  const flat = prompt.replace(/\s+/g, " ").trim();
  if (!flat) return "idle machine";
  return flat.length > 60 ? `${flat.slice(0, 57)}…` : flat;
}

function loadLocal(): Local[] {
  if (!existsSync(STATE)) return [];

  const meta = new Map<string, { state: string; status: string }>();
  for (const line of docker([
    "ps",
    "-a",
    "--format",
    "{{.Names}}\t{{.State}}\t{{.Status}}",
  ]).split("\n")) {
    const [name, state, status] = line.split("\t");
    if (name)
      meta.set(name, { state: state ?? "unknown", status: status ?? "" });
  }

  return readdirSync(STATE)
    .filter((d) => d.startsWith("mm-"))
    .sort()
    .reverse()
    .map((id) => {
      const d = join(STATE, id);
      const info = meta.get(id) ?? { state: "gone", status: "removed" };
      const prompt = read(join(d, "prompt"));

      // Per-machine allocation from the container's own limits. 0 means the
      // container was created without limits (pre-dates `--cpus`/`--memory`),
      // and is reported as 0 rather than substituted with the host's totals —
      // summing host totals per machine overstates fleet capacity.
      const [nanoCpus = "0", memLimit = "0"] = docker([
        "inspect",
        "-f",
        "{{.HostConfig.NanoCpus}} {{.HostConfig.Memory}}",
        id,
      ]).split(" ");
      const cpu = Math.round((Number(nanoCpus) || 0) / 1e9);
      const memoryGb = Math.round((Number(memLimit) || 0) / 1024 ** 3);
      const files = docker([
        "run",
        "--rm",
        "-v",
        `${id}:/w`,
        "alpine",
        "find",
        "/w",
        "-type",
        "f",
        "-not",
        "-path",
        "*/.*",
      ])
        .split("\n")
        .filter(Boolean)
        .map((f) => f.replace(/^\/w\//, ""));

      const ttyPort = read(join(d, "ttyport")) || null;

      const machine: Machine = {
        id,
        name: id,
        title: titleOf(prompt),
        agent: "claude",
        task: prompt || "—",
        status: toStatus(info.state),
        region: "local-docker",
        cpu,
        memoryGb,
        uptime: info.status || "—",
        lastActive: info.status || "—",
        templateId: "minimachine-local:alpine",
        emulatorUrl: ttyPort ? `http://127.0.0.1:${ttyPort}` : undefined,
      };

      return {
        machine,
        ttyPort,
        result:
          read(join(d, "run.log")).split("\n").filter(Boolean).pop() ?? "",
        files,
      };
    });
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  // Dev-only tool: it drives the local Docker daemon, which does not exist on
  // Vercel. 404 in production rather than shipping a route that always errors.
  if (process.env.NODE_ENV === "production") notFound();

  const { id } = await searchParams;
  const local = loadLocal();
  const machines = local.map((l) => l.machine);
  const selected = local.find((l) => l.machine.id === id) ?? local[0];

  // No shell here — dashboard/layout.tsx already wraps children in
  // DashboardShell, which is also what makes withAuth() legal on this path.
  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-20">
      <StatsRibbon machines={machines} />

      <FleetList machines={machines} />

      {selected && (
        <section className="mm-cursor-panel rounded-lg border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
            <div className="flex items-center gap-2">
              <span className="text-foreground text-sm font-medium">
                Emulator
              </span>
              <span className="text-muted-foreground text-xs">
                ttyd · xterm.js · WebGL2
              </span>
            </div>
            <div className="flex items-center gap-3">
              {local.length > 1 && (
                <div className="flex flex-wrap gap-1">
                  {local.map((l) => (
                    <a
                      key={l.machine.id}
                      href={`?id=${l.machine.id}`}
                      className={`rounded px-2 py-0.5 font-mono text-[11px] ${
                        l.machine.id === selected.machine.id
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {l.machine.id.replace(/^mm-/, "")}
                    </a>
                  ))}
                </div>
              )}
              {selected.ttyPort && (
                <a
                  href={`http://127.0.0.1:${selected.ttyPort}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-foreground text-xs underline"
                >
                  open in tab ↗
                </a>
              )}
            </div>
          </div>

          {selected.result && (
            <p className="text-muted-foreground border-b px-4 py-2 text-sm">
              {selected.result}
            </p>
          )}

          {selected.files.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 border-b px-4 py-2">
              {selected.files.map((f) => (
                <li
                  key={f}
                  className="bg-muted text-muted-foreground rounded px-2 py-0.5 font-mono text-[11px]"
                >
                  {f}
                </li>
              ))}
            </ul>
          )}

          {selected.machine.status === "running" && selected.ttyPort ? (
            <iframe
              src={`http://127.0.0.1:${selected.ttyPort}`}
              className="h-[420px] w-full bg-[#2b2b2b]"
              title={`emulator ${selected.machine.id}`}
            />
          ) : (
            <p className="text-muted-foreground px-4 py-6 text-sm">
              Machine is {selected.machine.status}. Start it with{" "}
              <code className="bg-muted rounded px-1.5 py-0.5">
                ./mm emulator {selected.machine.id}
              </code>{" "}
              then reload.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
