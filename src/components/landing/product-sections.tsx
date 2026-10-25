import {
  ArrowRight,
  ArrowUpRight,
  FolderOpen,
  Link2,
  MessageCircle,
} from "lucide-react";
import Link from "next/link";
import { CommandBlock } from "./command-block";
import { installers } from "~/lib/onboarding";

export function ProductSections() {
  return (
    <>
      <section
        className="mm-container mm-home-how"
        id="how-it-works"
        aria-labelledby="how-title"
      >
        <div className="mm-home-section-intro">
          <h2 id="how-title">
            Bring the idea.
            <br />
            Give it somewhere to go.
          </h2>
          <p>
            A real computer in the cloud, familiar tools, and a simple way to
            stay part of the work.
          </p>
        </div>
        <ol className="mm-home-steps">
          <li>
            <span className="mm-home-step-icon">
              <FolderOpen size={23} strokeWidth={1.5} aria-hidden="true" />
            </span>
            <div>
              <h3>Make a little space.</h3>
              <p>
                Create a machine and add the files your project needs. Your
                agent gets a shell and the tools to build, run, and test.
              </p>
              <Link href="/install#first-machine">
                Set up your workspace{" "}
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </div>
          </li>
          <li>
            <span className="mm-home-step-icon">
              <MessageCircle size={23} strokeWidth={1.5} aria-hidden="true" />
            </span>
            <div>
              <h3>A question, when it matters.</h3>
              <p>
                The baton gives your agent a way to ask for direction. Set up
                email or push notifications, then answer from your phone.
              </p>
              <Link href="/docs">
                Meet the baton <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </div>
          </li>
          <li>
            <span className="mm-home-step-icon">
              <Link2 size={23} strokeWidth={1.5} aria-hidden="true" />
            </span>
            <div>
              <h3>Bring someone into the loop.</h3>
              <p>
                Open the app your agent builds through a share link. Review it
                together, talk through the next change, and keep your files.
              </p>
              <Link href="/docs">
                Explore sharing <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </div>
          </li>
        </ol>
      </section>
      <section className="mm-home-start-band" aria-labelledby="start-title">
        <div className="mm-container mm-home-start">
          <div>
            <h2 id="start-title">
              Start small.
              <br />
              See where it takes you.
            </h2>
            <p>
              One install gets you the CLI. Then sign in, connect your agent,
              and create your first workspace.
            </p>
            <Link className="mm-home-inline-link" href="/install">
              The whole setup, step by step{" "}
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </div>
          <div className="mm-home-install">
            <span>Ready when you are.</span>
            <CommandBlock
              command={installers.npm}
              label="CLI installation command"
            />
            <p>Node.js 20+ · macOS, Linux, or Windows</p>
            <p>
              Installing is separate from starting compute. Creating a machine
              may incur usage charges.
            </p>
          </div>
        </div>
      </section>
      <section className="mm-container mm-home-faq" aria-labelledby="faq-title">
        <div>
          <h2 id="faq-title">
            A few things
            <br />
            you might be wondering.
          </h2>
          <p>Keep your familiar workflow. Get a little more room to use it.</p>
        </div>
        <div className="mm-faq-list">
          <details>
            <summary>Do I need a different coding agent?</summary>
            <p>
              No. The minimachines skill works with Codex, Claude Code, and
              Cursor. Bring your own supported agent account and follow the
              install guide to connect it.
            </p>
          </details>
          <details>
            <summary>Can I answer from my phone?</summary>
            <p>
              Yes. Configure the baton with email or push notifications and open
              the reply page on your phone. Delivery needs to be set up for your
              account; SMS isn’t part of the current baton notification path.
            </p>
          </details>
          <details>
            <summary>What happens to my files?</summary>
            <p>
              Machines are temporary workspaces. Commit, push, or download
              changes before stopping or restarting a machine. A stopped machine
              is not a backup.
            </p>
          </details>
          <details>
            <summary>Where do I start?</summary>
            <p>
              Install the CLI, sign in to minimachines, and add the skill to
              your agent. The guide walks through creating a machine and running
              your first command.
            </p>
            <Link href="/install">
              Open the install guide <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </details>
        </div>
      </section>
      <section className="mm-container mm-home-final">
        <div>
          <h2>
            What have you been
            <br />
            meaning to make?
          </h2>
          <p>Give it a little room.</p>
        </div>
        <Link className="mm-gloss mm-gloss-primary" href="/early-access">
          Join the beta <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </section>
    </>
  );
}
