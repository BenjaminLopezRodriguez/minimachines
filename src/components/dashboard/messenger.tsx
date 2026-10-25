"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "~/components/theme-toggle";
import { BotsWorkspace } from "~/components/bots/workspace";
import { PageSwitcher } from "./page-switcher";

export function MessengerDashboard({
  mode,
  whiteboard,
  basePath = "/dashboard",
  botContent,
}: {
  mode: "bot" | "whiteboard";
  whiteboard?: ReactNode;
  basePath?: string;
  botContent?: ReactNode;
}) {
  return (
    <div className="mm-app mm-messenger">
      <a href="#messenger-content" className="mm-dashboard-skip">
        Skip to workspace
      </a>
      <header className="mm-messenger-header">
        <div className="mm-messenger-brand">
          <PageSwitcher
            title="minimachines"
            brand
            activeHref={
              mode === "bot" ? "/dashboard" : "/dashboard?mode=whiteboard"
            }
          />
        </div>
        <nav className="mm-mode-switch" aria-label="Workspace mode">
          <Link
            href={basePath}
            aria-current={mode === "bot" ? "page" : undefined}
            prefetch={false}
          >
            Bot
          </Link>
          <Link
            href={`${basePath}?mode=whiteboard`}
            aria-current={mode === "whiteboard" ? "page" : undefined}
            prefetch={false}
          >
            Whiteboard
          </Link>
        </nav>
        <div className="mm-messenger-appearance">
          <ThemeToggle />
        </div>
      </header>
      <div id="messenger-content" className="mm-messenger-content">
        <section hidden={mode !== "bot"} aria-label="Bot conversations">
          {botContent ?? <BotsWorkspace />}
        </section>
        <section hidden={mode !== "whiteboard"} aria-label="Project whiteboard">
          {whiteboard}
        </section>
      </div>
    </div>
  );
}
