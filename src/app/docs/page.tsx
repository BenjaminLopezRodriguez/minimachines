import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { commandReference } from "~/lib/onboarding";
import { SiteHeader } from "~/components/landing/site-header";
import { SiteFooter } from "~/components/landing/site-footer";
import { CommandBlock } from "~/components/landing/command-block";

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "Mini Machines CLI commands, workspace basics, and troubleshooting.",
};
export default function DocsPage() {
  return (
    <div className="mm-site">
      <SiteHeader active="docs" />
      <main id="main-content" className="mm-container mm-docs-page">
        <div className="mm-guide-heading">
          <p className="mm-intro">Documentation</p>
          <h1>
            Less setup.
            <br />
            <span>More doing.</span>
          </h1>
          <p className="mm-lead">
            The essentials for driving a cloud workspace from your terminal.
          </p>
          <Link className="mm-gloss mm-gloss-primary" href="/install">
            Start with the install guide{" "}
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
        <section
          className="mm-docs-section"
          aria-labelledby="reference-heading"
        >
          <h2 id="reference-heading">Command reference</h2>
          <p>
            Use <code>mm</code> or <code>minimachines</code>. Replace{" "}
            <code>MACHINE_ID</code> with the ID printed when you create a
            machine. Commands run on your computer unless they are inside{" "}
            <code>mm exec</code>.
          </p>
          <dl className="mm-command-reference">
            {commandReference.map(([command, description]) => (
              <div key={command}>
                <dt>
                  <code>{command}</code>
                </dt>
                <dd>{description}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="mm-docs-section">
          <h2>Workspace basics</h2>
          <div className="mm-prose">
            <h3>Files live in /workspace</h3>
            <p>
              Upload paths are relative to the workspace. For example,{" "}
              <code>app/index.html</code> becomes{" "}
              <code>/workspace/app/index.html</code>. Run commands from your
              project directory with{" "}
              <code>
                {"mm exec MACHINE_ID 'cd /workspace/app && npm run build'"}
              </code>
              .
            </p>
            <h3>App URL and console are different</h3>
            <p>
              The app URL points to port 3000. Start your app on{" "}
              <code>0.0.0.0:3000</code> before opening it. <code>mm run</code>{" "}
              opens the machine’s browser console instead.
            </p>
            <h3>Export before stopping</h3>
            <p>
              A machine is temporary compute, not durable storage. Push changes
              to your repository or download them before stopping. Keep
              credentials out of uploaded archives.
            </p>
          </div>
        </section>
        <section className="mm-docs-section">
          <h2>When something gets in the way</h2>
          <div className="mm-faq-list">
            <details>
              <summary>“mm: command not found”</summary>
              <p>
                Open a new terminal after installing. Check that your global
                package bin directory is on your PATH. You can also run the CLI
                without a global install:
              </p>
              <CommandBlock
                command="npx --yes @minimachines/cli@latest login"
                label="npx login command"
              />
            </details>
            <details>
              <summary>The CLI doesn’t recognize a command</summary>
              <p>Update to the latest CLI, then retry:</p>
              <CommandBlock
                command="npm install --global @minimachines/cli@latest"
                label="CLI update command"
              />
            </details>
            <details>
              <summary>
                Login opens the wrong account, or an API request is unauthorized
              </summary>
              <p>
                Run <code>mm whoami</code> to see the credential source and API
                host. This shows local configuration; it doesn’t validate the
                key. <code>MINIMACHINE_API_KEY</code> overrides saved
                credentials. Check that environment variable, then run{" "}
                <code>mm login</code> again if needed. Use{" "}
                <code>https://www.minimachin.es</code> as the API host.
              </p>
            </details>
            <details>
              <summary>My app URL isn’t loading</summary>
              <p>
                Check the server logs on the machine. Make sure the server is
                running, listening on <code>0.0.0.0</code>, and using port{" "}
                <code>3000</code>. Creating a machine doesn’t start your
                application automatically.
              </p>
            </details>
            <details>
              <summary>My agent doesn’t see the skill</summary>
              <p>
                Restart the agent session after installing. Check the file path
                shown in the <Link href="/install#agent">agent setup step</Link>
                . For another agent, use{" "}
                <code>mm skill install --dir PATH</code> to write the skill to
                its instructions directory.
              </p>
            </details>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
