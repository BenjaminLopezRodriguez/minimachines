import { BrandMark } from "~/components/brand-mark";
import { ThemeToggle } from "~/components/theme-toggle";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

export function SiteHeader({ active }: { active?: "install" | "docs" }) {
  return (
    <>
      <a className="mm-skip" href="#main-content">
        Skip to content
      </a>
      <header className="mm-site-header">
        <div className="mm-container mm-header-inner">
          <Link
            href="/"
            className="mm-wordmark"
            aria-label="Mini Machines home"
          >
            <BrandMark className="mm-brand-mark" />
            minimachines
          </Link>
          <nav aria-label="Main navigation">
            <ThemeToggle />
            <Link
              href="/install"
              aria-current={active === "install" ? "page" : undefined}
            >
              Install
            </Link>
            <Link
              href="/docs"
              aria-current={active === "docs" ? "page" : undefined}
            >
              Docs
            </Link>
            <Link
              href="/dashboard"
              prefetch={false}
              className="mm-header-dashboard"
            >
              Dashboard <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </nav>
        </div>
      </header>
    </>
  );
}
