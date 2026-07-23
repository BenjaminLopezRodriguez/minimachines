export type MachineStatus = "running" | "starting" | "stopped" | "error";

export type Machine = {
  id: string;
  name: string;
  agent: string;
  task: string;
  status: MachineStatus;
  region: string;
  cpu: number;
  memoryGb: number;
  uptime: string;
  lastActive: string;
};

/** Placeholder fleet until the real provisioner exists. */
export const machines: Machine[] = [
  {
    id: "vm_7f3a2c",
    name: "vm-7f3a",
    agent: "claude",
    task: "refactor auth middleware",
    status: "running",
    region: "us-west-2",
    cpu: 4,
    memoryGb: 16,
    uptime: "2h 14m",
    lastActive: "just now",
  },
  {
    id: "vm_91b0e4",
    name: "vm-91b0",
    agent: "codex",
    task: "write integration tests",
    status: "running",
    region: "us-west-2",
    cpu: 8,
    memoryGb: 32,
    uptime: "47m",
    lastActive: "1m ago",
  },
  {
    id: "vm_c3d812",
    name: "vm-c3d8",
    agent: "grok",
    task: "benchmark cold starts",
    status: "starting",
    region: "us-east-1",
    cpu: 4,
    memoryGb: 16,
    uptime: "—",
    lastActive: "just now",
  },
  {
    id: "vm_a01fe9",
    name: "vm-a01f",
    agent: "cursor",
    task: "idle workspace",
    status: "stopped",
    region: "eu-west-1",
    cpu: 2,
    memoryGb: 8,
    uptime: "—",
    lastActive: "3h ago",
  },
];

export function machineStats(list: Machine[]) {
  const running = list.filter((m) => m.status === "running").length;
  const starting = list.filter((m) => m.status === "starting").length;
  const stopped = list.filter((m) => m.status === "stopped").length;
  const vcpu = list
    .filter((m) => m.status === "running" || m.status === "starting")
    .reduce((sum, m) => sum + m.cpu, 0);
  return { total: list.length, running, starting, stopped, vcpu };
}
