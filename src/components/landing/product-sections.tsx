import {
  ArrowRight,
  ArrowUpRight,
  Terminal,
  Upload,
  Play,
  Square,
} from "lucide-react";
import Link from "next/link";

export function ProductSections() {
  return (
    <>
      <section id="how-it-works" className="mm-workflow-section">
        <div className="mm-container">
          <div className="mm-section-heading">
            <h2>
              From your terminal.
              <br />
              To a machine of its own.
            </h2>
            <p>
              Create a workspace, send it a task, and keep the output. A short
              loop you can drive yourself or hand to your agent.
            </p>
          </div>
          <ol className="mm-workflow">
            {[
              {
                icon: Terminal,
                title: "Create",
                command: "mm create node-ts",
                body: "Choose a template. Get a machine ID and app URL.",
              },
              {
                icon: Upload,
                title: "Add your work",
                command: "mm put",
                body: "Send the files your task needs into /workspace.",
              },
              {
                icon: Play,
                title: "Run it",
                command: "mm exec",
                body: "Install, build, and test. Read the output in your terminal.",
              },
              {
                icon: Square,
                title: "Wrap up",
                command: "mm stop",
                body: "Export your changes, then stop the machine.",
              },
            ].map(({ icon: Icon, ...step }) => (
              <li key={step.title}>
                <Icon size={22} strokeWidth={1.6} aria-hidden="true" />
                <h3>{step.title}</h3>
                <code>{step.command}</code>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
          <Link className="mm-text-link" href="/install#first-machine">
            Try your first machine <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>
      <section className="mm-container mm-details-section">
        <div>
          <h2>
            Your workflow,
            <br />
            with more room.
          </h2>
          <p className="mm-body-copy">
            Keep the agent you know. Move the compute to a dedicated cloud
            workspace.
          </p>
          <Link className="mm-text-link" href="/install#agent">
            Connect your agent <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <dl className="mm-detail-list">
          <div>
            <dt>A real shell</dt>
            <dd>
              Run the tools your project uses. Commands stream their output back
              to your terminal.
            </dd>
          </div>
          <div>
            <dt>A link to what you build</dt>
            <dd>
              Serve your app on port 3000 and open the machine’s app URL to
              review it in a browser.
            </dd>
          </div>
          <div>
            <dt>A workspace for the task</dt>
            <dd>
              Machines are temporary. Commit, push, or download the work you
              need before stopping.
            </dd>
          </div>
        </dl>
      </section>
      <section className="mm-container mm-faq-section">
        <h2>A few things to know.</h2>
        <div className="mm-faq-list">
          <details>
            <summary>Do I need to change coding agents?</summary>
            <p>
              No. Install the Mini Machines skill for Codex, Claude Code, or
              Cursor. It teaches your agent how to create a machine, transfer
              files, and run commands.
            </p>
          </details>
          <details>
            <summary>What do I need to get started?</summary>
            <p>
              Node.js 20 or newer, npm or pnpm, and a Mini Machines account. The
              install guide walks through browser sign-in and a first command.
            </p>
          </details>
          <details>
            <summary>
              Is installing the CLI the same as creating a machine?
            </summary>
            <p>
              No. Installing the CLI and adding the skill do not provision
              compute. Running a create command starts a cloud machine and may
              incur usage charges. Check your account before creating one.
            </p>
          </details>
          <details>
            <summary>Will my files survive a machine stopping?</summary>
            <p>
              Treat the workspace as temporary. Export or push changes while the
              machine is running. A stopped machine is not a backup.
            </p>
          </details>
        </div>
      </section>
      <section className="mm-container mm-final-cta">
        <div>
          <p>Make some room.</p>
          <h2>
            Your next build
            <br />
            can happen here.
          </h2>
        </div>
        <Link className="mm-gloss mm-gloss-primary" href="/install">
          Install Mini Machines <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </section>
    </>
  );
}
