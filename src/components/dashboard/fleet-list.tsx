"use client";

import {
  ArrowRight,
  ChevronRight,
  Globe,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Server,
  Terminal,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { MachineDetailDrawer } from "~/components/dashboard/machine-detail-drawer";
import {
  filterMachines,
  type FleetFilter,
  type FleetSort,
} from "~/lib/dashboard-machines";
import type { Machine, MachineStatus } from "~/server/data/machines";

const statusLabel: Record<MachineStatus, string> = {
  running: "Running",
  starting: "Starting",
  stopped: "Stopped",
  error: "Needs attention",
};
const filters: { value: FleetFilter; label: string }[] = [
  { value: "all", label: "All machines" },
  { value: "running", label: "Running" },
  { value: "starting", label: "Starting" },
  { value: "stopped", label: "Stopped" },
  { value: "error", label: "Needs attention" },
];

export function MachineList({
  machines,
  onSelectMachine,
  refreshAction,
}: {
  machines: Machine[];
  onSelectMachine: (id: string) => void;
  refreshAction?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<FleetFilter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sort, setSort] = useState<FleetSort>("active");
  const visible = filterMachines(machines, query, status, sort);
  const active = machines.filter(
    (m) => m.status === "running" || m.status === "starting",
  ).length;
  const errors = machines.filter((m) => m.status === "error").length;
  const clear = () => {
    setQuery("");
    setStatus("all");
  };

  if (machines.length === 0)
    return (
      <section className="mm-fleet-empty">
        <div className="mm-empty-machine" aria-hidden="true">
          <Server size={30} strokeWidth={1.3} />
          <span />
        </div>
        <h2>Your first machine starts here.</h2>
        <p>
          Choose a runtime, give it a name, and get a cloud workspace for the
          task ahead.
        </p>
        <Link
          href="#new"
          className="mm-dashboard-button mm-dashboard-button-primary"
        >
          Create your first machine <ArrowRight size={16} aria-hidden="true" />
        </Link>
        <Link href="/install" className="mm-dashboard-text-link">
          Prefer your terminal? Set up the CLI
        </Link>
        <p className="mm-empty-footnote">
          Machines are temporary. Export your work before stopping them.
        </p>
      </section>
    );

  return (
    <section
      className="mm-fleet"
      aria-label="Your machines"
      data-filters-open={filtersOpen}
    >
      <div className="mm-fleet-summary">
        <p>
          <strong>{machines.length}</strong>{" "}
          {machines.length === 1 ? "machine" : "machines"}
          <span aria-hidden="true">·</span>
          <strong>{active}</strong> active
          {errors ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="mm-attention-count">
                {errors} {errors === 1 ? "needs" : "need"} attention
              </span>
            </>
          ) : null}
        </p>
        {refreshAction}
      </div>
      <div className="mm-fleet-toolbar">
        <div className="mm-machine-search">
          <Search size={17} aria-hidden="true" />
          <label className="sr-only" htmlFor="machine-search">
            Search machines
          </label>
          <input
            id="machine-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, task, or agent…"
            autoComplete="off"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              <X size={16} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <button
          className="mm-fleet-filter-trigger mm-icon-control"
          aria-label={`Filter and sort machines${status !== "all" ? ": filters active" : ""}`}
          aria-expanded={filtersOpen}
          aria-controls="fleet-filter-options"
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <SlidersHorizontal size={19} />
          <span>{status !== "all" ? "1" : ""}</span>
        </button>
        <label className="mm-fleet-sort">
          Sort by
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as FleetSort)}
          >
            <option value="active">Active first</option>
            <option value="name">Name A–Z</option>
          </select>
        </label>
      </div>
      <div
        id="fleet-filter-options"
        className="mm-fleet-filters"
        role="group"
        aria-label="Filter by machine status"
      >
        {filters.map((filter) => (
          <button
            key={filter.value}
            type="button"
            aria-pressed={status === filter.value}
            onClick={() => setStatus(filter.value)}
          >
            {filter.label}
            <span>
              {filter.value === "all"
                ? machines.length
                : machines.filter((m) => m.status === filter.value).length}
            </span>
          </button>
        ))}
      </div>
      <p className="sr-only" role="status">
        {visible.length} of {machines.length} machines shown
      </p>
      {visible.length ? (
        <div className="mm-machine-table">
          <div className="mm-machine-table-heading" aria-hidden="true">
            <span>Machine</span>
            <span>Resources</span>
            <span>Status</span>
            <span>Open</span>
          </div>
          <ul>
            {visible.map((machine) => (
              <li key={machine.id} className="mm-machine-row">
                <button
                  type="button"
                  className="mm-machine-name"
                  onClick={() => onSelectMachine(machine.id)}
                  aria-label={`View details for ${machine.name}`}
                >
                  <Server size={20} strokeWidth={1.6} aria-hidden="true" />
                  <span>
                    <strong>{machine.name}</strong>
                    <span>{machine.task || machine.title}</span>
                    <small>
                      {machine.agent === "any"
                        ? "General workspace"
                        : machine.agent}{" "}
                      · {machine.region}
                    </small>
                  </span>
                  <ChevronRight size={15} aria-hidden="true" />
                </button>
                <p className="mm-machine-resources">
                  <span>{machine.cpu} vCPU</span>
                  <span>{machine.memoryGb} GB memory</span>
                </p>
                <div className="mm-machine-status">
                  <span
                    className="mm-status-label"
                    data-status={machine.status}
                  >
                    <span aria-hidden="true" />
                    {statusLabel[machine.status]}
                  </span>
                  <small>
                    {machine.status === "running"
                      ? `Up ${machine.uptime}`
                      : machine.status === "starting"
                        ? "Preparing workspace"
                        : machine.status === "error"
                          ? "Open details to recover"
                          : "Workspace stopped"}
                  </small>
                </div>
                <div className="mm-machine-open">
                  {machine.status === "running" && machine.emulatorUrl ? (
                    <a
                      href={machine.emulatorUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open console for ${machine.name}`}
                    >
                      <Terminal size={16} aria-hidden="true" />
                      <span>Console</span>
                    </a>
                  ) : null}
                  {machine.status === "running" && machine.appUrl ? (
                    <a
                      href={machine.appUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open app for ${machine.name}`}
                    >
                      <Globe size={16} aria-hidden="true" />
                      <span>App</span>
                    </a>
                  ) : null}
                  {machine.status !== "running" ||
                  (!machine.emulatorUrl && !machine.appUrl) ? (
                    <button
                      type="button"
                      onClick={() => onSelectMachine(machine.id)}
                    >
                      Details <ChevronRight size={14} aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="mm-no-machines">
          <Search size={24} aria-hidden="true" />
          <h2>No machines match these filters.</h2>
          <p>Try another name, task, or machine status.</p>
          <button
            type="button"
            className="mm-dashboard-button mm-dashboard-button-secondary"
            onClick={clear}
          >
            Clear filters
          </button>
        </div>
      )}
    </section>
  );
}

export function FleetList({ machines }: { machines: Machine[] }) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    machines.find((machine) => machine.id === selectedId) ?? null;
  useEffect(() => {
    const sync = () => {
      const id = window.location.hash.slice(1);
      if (id && id !== "new") setSelectedId(id);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const select = (id: string) => {
    setSelectedId(id);
    window.history.replaceState(null, "", `#${id}`);
  };
  return (
    <>
      <MachineList
        machines={machines}
        onSelectMachine={select}
        refreshAction={
          <button
            type="button"
            className="mm-refresh-fleet"
            onClick={() => startTransition(() => router.refresh())}
            disabled={refreshing}
          >
            <RefreshCw size={15} aria-hidden="true" />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        }
      />
      <MachineDetailDrawer
        key={selected?.id ?? "closed"}
        machine={selected}
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null);
            window.history.replaceState(
              null,
              "",
              `${window.location.pathname}${window.location.search}`,
            );
          }
        }}
      />
    </>
  );
}
