export type MachineStatus = "running" | "starting" | "stopped" | "error";

export type Machine = {
  id: string;
  name: string;
  /** Short activity label for sidebar, e.g. "Grok working on website". */
  title: string;
  agent: string;
  task: string;
  status: MachineStatus;
  region: string;
  cpu: number;
  memoryGb: number;
  uptime: string;
  lastActive: string;
  templateId?: string;
  dockerfile?: string;
  /**
   * Browser terminal (ttyd) for this machine, when one is reachable.
   * Local dev: `http://127.0.0.1:<port>`. Production: the machine's
   * tunnel/subdomain, e.g. `https://mm-<id>.minimachin.es/emulator`.
   */
  emulatorUrl?: string;
  /** WorkOS user id (or API key owner). */
  ownerUserId?: string;
};

/** Seed fleet used when `.data/machines.json` does not exist yet. */
export const seedMachines: Machine[] = [];

/** @deprecated Prefer listMachines() from machine-store — kept for static imports. */
export const machines = seedMachines;

export function machineStats(list: Machine[]) {
  const running = list.filter((m) => m.status === "running").length;
  const starting = list.filter((m) => m.status === "starting").length;
  const stopped = list.filter((m) => m.status === "stopped").length;
  const vcpu = list
    .filter((m) => m.status === "running" || m.status === "starting")
    .reduce((sum, m) => sum + m.cpu, 0);
  return { total: list.length, running, starting, stopped, vcpu };
}
