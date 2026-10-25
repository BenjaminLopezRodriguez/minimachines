import { redirect } from "next/navigation";
import { requireBetaAccess, BetaAccessError } from "~/server/data/beta";
import { withAuth } from "@workos-inc/authkit-nextjs";
import type { ReactNode } from "react";
import { signOutAction } from "~/components/dashboard/actions";
import { DashboardFrame } from "./frame";

export async function DashboardShell({ children }: { children: ReactNode }) {
  const { user } = await withAuth();
  if (user) {
    if (!user.emailVerified) redirect("/beta");
    try {
      await requireBetaAccess(user.id);
    } catch (error) {
      if (error instanceof BetaAccessError) redirect("/beta");
      throw error;
    }
  }
  const fromName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
  const display = fromName.length > 0 ? fromName : (user?.email ?? "Account");
  return (
    <DashboardFrame
      display={display}
      email={user?.email}
      signOutAction={signOutAction}
    >
      {children}
    </DashboardFrame>
  );
}
