import { Button } from "~/components/ui/button";
import {
  DashboardStats,
  MachineTable,
} from "~/components/dashboard/machine-table";
import { machines } from "~/server/data/machines";

export default function DashboardPage() {
  const running = machines.filter((m) => m.status === "running").length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-medium tracking-tight text-foreground">
            Machines
          </h1>
          <p className="text-[13px] text-muted-foreground">
            <span className="tabular-nums text-foreground/90">{running}</span>{" "}
            running · dedicated VMs for your agents
          </p>
        </div>
        <Button
          id="new"
          size="sm"
          className="h-7 self-start rounded-md bg-primary px-2.5 text-[13px] font-medium text-primary-foreground hover:bg-white sm:self-auto"
        >
          New machine
        </Button>
      </div>

      <DashboardStats machines={machines} />

      <section aria-labelledby="fleet-heading" className="space-y-2.5">
        <div className="flex items-baseline justify-between gap-4 px-0.5">
          <h2
            id="fleet-heading"
            className="text-[13px] font-medium text-foreground"
          >
            Fleet
          </h2>
          <p className="text-[12px] text-muted-foreground tabular-nums">
            {machines.length} total
          </p>
        </div>
        <MachineTable machines={machines} />
      </section>
    </div>
  );
}
