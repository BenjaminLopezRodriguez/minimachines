export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p className="font-mono text-xs text-muted-foreground">
          © {new Date().getFullYear()} minimachines
        </p>
        <p className="text-xs text-muted-foreground">
          Dedicated VMs for agentic software development.
        </p>
      </div>
    </footer>
  );
}
