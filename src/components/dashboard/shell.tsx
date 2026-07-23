import { KeyRound, LogOut, Plus } from "lucide-react";
import Link from "next/link";
import { withAuth } from "@workos-inc/authkit-nextjs";
import type { ReactNode } from "react";

import { signOutAction } from "~/components/dashboard/actions";
import { Button } from "~/components/ui/button";

export async function DashboardShell({
  children,
}: {
  children: ReactNode;
}) {
  const { user } = await withAuth();
  const fromName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
  const display =
    fromName.length > 0 ? fromName : (user?.email ?? "Account");

  return (
    <div className="mm-app flex min-h-screen font-sans text-foreground">
      <aside className="mm-cursor-panel hidden w-56 shrink-0 flex-col border-r md:flex">
        <div className="flex h-12 items-center px-4">
          <Link
            href="/dashboard"
            className="text-sm font-medium tracking-tight text-foreground"
          >
            minimachines
          </Link>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 px-2 pb-3" aria-label="Actions">
          <p className="px-2.5 pb-1.5 pt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Tools
          </p>
          <Button
            asChild
            variant="ghost"
            className="h-9 w-full justify-start gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-foreground hover:bg-white/[0.04]"
          >
            <Link href="/dashboard#new">
              <Plus className="size-3.5 opacity-70" aria-hidden />
              New machine
            </Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            className="h-9 w-full justify-start gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-foreground hover:bg-white/[0.04]"
          >
            <Link href="/dashboard/settings">
              <KeyRound className="size-3.5 opacity-70" aria-hidden />
              API keys
            </Link>
          </Button>
          <form action={signOutAction}>
            <button
              type="submit"
              className="inline-flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
            >
              <LogOut className="size-3.5 opacity-70" aria-hidden />
              Sign out
            </button>
          </form>
        </nav>

        <div className="mt-auto space-y-1 border-t border-border p-3">
          <div className="min-w-0 px-1">
            <p className="truncate text-[13px] text-foreground">{display}</p>
            {user?.email && display !== user.email ? (
              <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                {user.email}
              </p>
            ) : null}
          </div>
        </div>
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col bg-background">
        <div className="flex-1 px-4 py-4 md:px-6 md:py-6">{children}</div>
      </div>
    </div>
  );
}
