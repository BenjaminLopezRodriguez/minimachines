import type { Metadata } from "next";
import { InstallGuide } from "~/components/landing/install-guide";
import { SiteHeader } from "~/components/landing/site-header";
import { SiteFooter } from "~/components/landing/site-footer";

export const metadata: Metadata = {
  title: "Install",
  description:
    "Install the Mini Machines CLI, connect your coding agent, and run your first command in a cloud workspace.",
};
export default function InstallPage() {
  return (
    <div className="mm-site">
      <SiteHeader active="install" />
      <main id="main-content" className="mm-container mm-guide-page">
        <div className="mm-guide-heading">
          <p className="mm-intro">The setup guide</p>
          <h1>
            A little setup.
            <br />
            <span>A lot more room.</span>
          </h1>
          <p className="mm-lead">
            From your terminal to your first cloud command. Install the CLI,
            connect your account, and bring your agent.
          </p>
        </div>
        <InstallGuide />
      </main>
      <SiteFooter />
    </div>
  );
}
