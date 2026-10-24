import type { Machine, MachineStatus } from "~/server/data/machines";

export type FleetFilter = "all" | MachineStatus;
export type FleetSort = "active" | "name";
const statusOrder: Record<MachineStatus, number> = {
  running: 0,
  starting: 1,
  error: 2,
  stopped: 3,
};

export function filterMachines(
  machines: Machine[],
  query: string,
  status: FleetFilter,
  sort: FleetSort,
) {
  const term = query.trim().toLocaleLowerCase();
  return machines
    .filter((machine) => {
      if (status !== "all" && machine.status !== status) return false;
      return (
        !term ||
        [
          machine.name,
          machine.title,
          machine.task,
          machine.id,
          machine.agent,
          machine.region,
        ].some((value) => value.toLocaleLowerCase().includes(term))
      );
    })
    .sort(
      (a, b) =>
        (sort === "active"
          ? statusOrder[a.status] - statusOrder[b.status]
          : 0) || a.name.localeCompare(b.name),
    );
}
