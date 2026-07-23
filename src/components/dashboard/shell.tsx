import Link from "next/link";
import { signOut, withAuth } from "@workos-inc/authkit-nextjs";
import type { ReactNode } from "react";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

const nav = [
  { href: "/dashboard", label: "Machines", current: true },
] as const;

export async function DashboardShell({
  children,
}: {
  children: ReactNode;
}) {
  const { user } = await withAuth({ ensureSignedIn: true });
  const display =
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.email ||
    "Account";

  return (
    <div className="mm-cursor flex min-h-screen font-sans text-foreground">
      <aside className="mm-cursor-panel hidden w-56 shrink-0 flex-col border-r md:flex">
        <div className="flex h-12 items-center px-4">
          <Link
            href="/dashboard"
            className="text-sm font-medium tracking-tight text-foreground"
          >
            minimachines
          </Link>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 px-2 pb-3" aria-label="Dashboard">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.current ? "page" : undefined}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                item.current
                  ? "mm-cursor-inset font-medium text-foreground"
                  : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="space-y-2 border-t border-border p-3">
          <div className="min-w-0 px-1">
            <p className="truncate text-[13px] text-foreground">{display}</p>
            {user.email && display !== user.email ? (
              <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                {user.email}
              </p>
            ) : null}
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ returnTo: "/" });
            }}
          >
            <button
              type="submit"
              className="w-full rounded-md px-2.5 py-1.5 text-left text-[13px] text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col bg-background">
        <header className="flex h-12 items-center justify-between border-b border-border px-4 md:px-6">
          <div className="flex items-center gap-3 md:hidden">
            <Link
              href="/dashboard"
              className="text-sm font-medium tracking-tight text-foreground"
            >
              minimachines
            </Link>
          </div>
          <p className="hidden text-[13px] text-muted-foreground md:block">
            Machines
          </p>
          <div className="flex items-center gap-2">
            <span className="hidden max-w-[9rem] truncate text-[13px] text-muted-foreground sm:inline md:hidden">
              {display}
            </span>
            <form
              className="md:hidden"
              action={async () => {
                "use server";
                await signOut({ returnTo: "/" });
              }}
            >
              <button
                type="submit"
                className="rounded-md px-2 py-1.5 text-[13px] text-muted-foreground hover:text-foreground"
              >
                Sign out
              </button>
            </form>
            <Button
              asChild
              size="sm"
              className="h-7 rounded-md bg-primary px-2.5 text-[13px] font-medium text-primary-foreground hover:bg-white"
            >
              <Link href="/dashboard#new">New machine</Link>
            </Button>
          </div>
        </header>
        <div className="flex-1 px-4 py-6 md:px-6 md:py-8">{children}</div>
      </div>
    </div>
  );
}
