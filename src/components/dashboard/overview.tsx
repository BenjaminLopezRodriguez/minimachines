import { ArrowRight, Terminal } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export function DashboardOverview({
  children,
  createAction,
}: {
  children: ReactNode;
  createAction: ReactNode;
}) {
  return (
    <div className="mm-dashboard-overview">
      <div className="mm-dashboard-heading">
        <div>
          <h1>Machines</h1>
          <p>A workspace for every build, test, and agent session.</p>
        </div>
        {createAction}
      </div>
      {children}
      <section className="mm-dashboard-setup">
        <Terminal size={21} aria-hidden="true" />
        <div>
          <h2>Work from your terminal.</h2>
          <p>Connect your coding agent and drive your machines with the CLI.</p>
        </div>
        <Link href="/install">
          Set up the CLI <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
}
