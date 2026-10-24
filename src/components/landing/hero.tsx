import {
  ArrowRight,
  ArrowDown,
  Terminal,
  Folder,
  FileCode2,
} from "lucide-react";
import Link from "next/link";
import { CommandBlock } from "./command-block";
import { installers } from "~/lib/onboarding";

export function Hero() {
  return (
    <section className="mm-container mm-hero" aria-labelledby="hero-title">
      <div className="mm-hero-copy">
        <p className="mm-intro">
          <span aria-hidden="true" />
          Cloud workspaces for coding agents
        </p>
        <h1 id="hero-title">
          Small machine.
          <br />
          <span>Big headroom.</span>
        </h1>
        <p className="mm-lead">
          Give your agent a workspace of its own. Run builds, tests, and long
          jobs in the cloud. Keep your laptop for everything else.
        </p>
        <div className="mm-actions">
          <Link className="mm-gloss mm-gloss-primary" href="/install">
            Get started <ArrowRight size={17} aria-hidden="true" />
          </Link>
          <Link className="mm-gloss mm-gloss-secondary" href="/docs">
            Read the docs
          </Link>
        </div>
        <p className="mm-prerequisite">
          Node.js 20+ · macOS, Linux, or Windows
        </p>
      </div>
      <div className="mm-workbench">
        <div className="mm-workbench-chrome">
          <span>
            <Terminal size={15} aria-hidden="true" /> Your terminal
          </span>
          <span>CLI setup</span>
        </div>
        <div className="mm-workbench-body">
          <p className="mm-terminal-heading">A little more room to build.</p>
          <p className="mm-terminal-description">
            Start with the CLI. Your agent comes with you.
          </p>
          <CommandBlock command={installers.npm} label="CLI install command" />
          <div className="mm-terminal-next">
            <span>Then connect</span>
            <code>mm login</code>
            <code>mm skill install --agent codex</code>
          </div>
          <Link href="/install">
            Walk through setup <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
        <div className="mm-workspace-strip">
          <Folder size={16} aria-hidden="true" />
          <span>/workspace</span>
          <span>
            <FileCode2 size={14} aria-hidden="true" /> Your files. Your tools.
          </span>
        </div>
      </div>
      <a href="#how-it-works" className="mm-hero-bottom">
        <span>
          You bring the agent.
          <br />
          <strong>We give it somewhere to work.</strong>
        </span>
        <ArrowDown size={22} aria-hidden="true" />
      </a>
    </section>
  );
}
