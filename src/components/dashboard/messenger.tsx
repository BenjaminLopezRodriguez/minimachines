"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
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
  const [messageCount, setMessageCount] = useState(0);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [messageCount]);
  const wantsAvatar = mode === "bot" && messageCount > 0 && !expanded;
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    if (!wantsAvatar) {
      setIdle(false);
      return;
    }
    const hold = setTimeout(() => setIdle(true), 800);
    return () => clearTimeout(hold);
  }, [wantsAvatar]);
  return (
    <div className="mm-app mm-messenger">
      <a href="#messenger-content" className="mm-dashboard-skip">
        Skip to workspace
      </a>
      <header className="mm-messenger-header">
        <div className="mm-messenger-brand">
          <div id="mm-header-leading" className="mm-header-slot" />
          <PageSwitcher
            title="minimachines"
            brand
            activeHref={
              mode === "bot" ? "/dashboard" : "/dashboard?mode=whiteboard"
            }
          />
        </div>
        <div className="mm-mode-dock" data-idle={idle || undefined}>
          <nav
            className="mm-mode-switch"
            aria-label="Workspace mode"
            inert={idle}
          >
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
          {mode === "bot" && (
            <button
              type="button"
              className="mm-mode-avatar"
              aria-label="Bot — show workspace modes"
              title="Bot"
              inert={!idle}
              onClick={() => setExpanded(true)}
            >
              <Image
                src="/avatars/fuzzy.png"
                alt=""
                width={30}
                height={30}
                priority
              />
            </button>
          )}
        </div>
        <div className="mm-messenger-appearance">
          <div id="mm-header-trailing" className="mm-header-slot" />
          <ThemeToggle />
        </div>
      </header>
      <div id="messenger-content" className="mm-messenger-content">
        <section hidden={mode !== "bot"} aria-label="Bot conversations">
          {botContent ?? (
            <BotsWorkspace
              variant="messenger"
              active={mode === "bot"}
              onMessageCount={setMessageCount}
            />
          )}
        </section>
        <section hidden={mode !== "whiteboard"} aria-label="Project whiteboard">
          {whiteboard}
        </section>
      </div>
    </div>
  );
}
