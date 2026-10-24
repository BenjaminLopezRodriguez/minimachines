import { withAuth } from "@workos-inc/authkit-nextjs";
import { FleetList } from "~/components/dashboard/fleet-list";
import { NewMachineCommand } from "~/components/dashboard/new-machine-command";
import { DashboardOverview } from "~/components/dashboard/overview";
import { listMachines } from "~/server/data/machine-store";

export default async function DashboardPage() {
  const { user } = await withAuth();
  const machines = user?.id ? await listMachines({ ownerUserId: user.id }) : [];
  return (
    <DashboardOverview createAction={<NewMachineCommand />}>
      <FleetList machines={machines} />
    </DashboardOverview>
  );
}
