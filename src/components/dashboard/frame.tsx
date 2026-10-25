"use client";

import { usePathname } from "next/navigation";
import { BrandMark } from "~/components/brand-mark";
import { ThemeToggle } from "~/components/theme-toggle";
import { ArrowUpRight, LogOut } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { DashboardNavigation } from "./navigation";

export function DashboardFrame({
  children,
  display,
  email,
  signOutAction,
  navigationPath,
}: {
  children: ReactNode;
  display: string;
  email?: string | null;
  signOutAction?: () => Promise<void>;
  navigationPath?: string;
}) {
  const pathname = usePathname();
  if (pathname === "/dashboard") return <>{children}</>;
  return (
    <div className="mm-app mm-dashboard-shell">
      <a href="#dashboard-content" className="mm-dashboard-skip">
        Skip to workspace
      </a>
      <aside className="mm-dashboard-sidebar">
        <div className="mm-dashboard-brand-row">
          <Link href="/" className="mm-dashboard-brand">
            <BrandMark className="mm-brand-mark" />
            minimachines
          </Link>
          <ThemeToggle />
        </div>
        <p className="mm-workspace-label">Your workspace</p>
        <DashboardNavigation activePath={navigationPath} />
        <div className="mm-sidebar-help">
          <p>Bring your coding agent.</p>
          <span>Install the CLI and connect your tools.</span>
          <Link href="/install">
            Install guide <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </div>
        <div className="mm-dashboard-account">
          <span className="mm-account-avatar" aria-hidden="true">
            {display.charAt(0).toUpperCase()}
          </span>
          <div>
            <p>{display}</p>
            <span>{email ?? "Personal workspace"}</span>
          </div>
          {signOutAction ? (
            <form action={signOutAction}>
              <button type="submit" aria-label="Sign out" title="Sign out">
                <LogOut size={17} aria-hidden="true" />
              </button>
            </form>
          ) : null}
        </div>
      </aside>
      <div className="mm-dashboard-canvas">
        <header className="mm-workspace-header">
          <span>Workspace</span>
          <span aria-hidden="true">/</span>
          <span>Mini Machines</span>
          <Link href="/docs">
            Help & reference <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </header>
        <main id="dashboard-content" className="mm-dashboard-content">
          {children}
        </main>
      </div>
    </div>
  );
}
