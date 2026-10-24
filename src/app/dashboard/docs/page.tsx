import { PageSwitcher } from "~/components/dashboard/page-switcher";
import Link from "next/link";
import { InstallGuide } from "~/components/landing/install-guide";

export default function DashboardDocsPage() {
  return (
    <div className="mm-site mm-dashboard-guide">
      <div className="mm-guide-heading">
        <p className="mm-intro">Get set up</p>
        <h1>
          <PageSwitcher
            title="Setup & docs"
            desktopContent={
              <>
                Your terminal.
                <br />
                <span>Your next machine.</span>
              </>
            }
          />
        </h1>
        <p className="mm-lead">
          Install the CLI and connect your coding agent.
        </p>
        <Link className="mm-text-link" href="/dashboard">
          Back to machines
        </Link>
      </div>
      <InstallGuide />
    </div>
  );
}
