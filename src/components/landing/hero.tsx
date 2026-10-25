import { ArrowRight, ArrowDown } from "lucide-react";
import Link from "next/link";
import { ProjectStory } from "./project-story";

export function Hero() {
  return (
    <section className="mm-container mm-home-hero" aria-labelledby="hero-title">
      <div className="mm-home-intro">
        <p className="mm-home-context">
          A cloud workspace for the agent you already use.
        </p>
        <h1 id="hero-title">
          A little more room
          <br />
          for your next idea.
        </h1>
        <p className="mm-home-lead">
          Give your coding agent a place to work. Share what it builds. And when
          it needs a hand, the baton brings the question back to you.
        </p>
        <div className="mm-home-actions">
          <Link className="mm-gloss mm-gloss-primary" href="/install">
            Start a project <ArrowRight size={17} aria-hidden="true" />
          </Link>
          <a className="mm-home-tour" href="#how-it-works">
            Take a look around <ArrowDown size={16} aria-hidden="true" />
          </a>
        </div>
        <p className="mm-home-setup-note">
          Set up with the CLI. Bring Codex, Claude Code, or Cursor.
        </p>
      </div>
      <ProjectStory />
    </section>
  );
}
