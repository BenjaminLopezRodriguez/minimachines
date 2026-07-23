import { withAuth } from "@workos-inc/authkit-nextjs";

import { signOutAction } from "~/components/dashboard/actions";
import { FleetList } from "~/components/dashboard/fleet-list";
import { StatsRibbon } from "~/components/dashboard/machine-table";
import { MobileFleetDrawer } from "~/components/dashboard/mobile-fleet-drawer";
import { NewMachineCommand } from "~/components/dashboard/new-machine-command";
import { listMachines } from "~/server/data/machine-store";

export default async function DashboardPage() {
  // Gate lives in middleware (middlewareAuth). Read-only withAuth here —
  // never ensureSignedIn in an RSC (cookie write → 500).
  const { user } = await withAuth();
  const fromName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
  const display =
    fromName.length > 0 ? fromName : (user?.email ?? "Account");
  const machines = user?.id
    ? await listMachines({ ownerUserId: user.id })
    : [];

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-20">
      <StatsRibbon machines={machines} />

      <FleetList machines={machines} />

      <NewMachineCommand />

      <MobileFleetDrawer
        display={display}
        email={user?.email}
        signOutAction={signOutAction}
      />
    </div>
  );
}
