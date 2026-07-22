import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-border/80 absolute inset-x-0 top-0 z-20 border-b">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link
          href="/"
          className="font-mono text-sm tracking-tight text-foreground"
        >
          minimachines
        </Link>
        <nav className="flex items-center gap-6">
          <a
            href="#how"
            className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline"
          >
            How it works
          </a>
          <a
            href="#features"
            className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline"
          >
            Features
          </a>
          <a
            href="#waitlist"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Waitlist
          </a>
        </nav>
      </div>
    </header>
  );
}
