"use client";

import { ArrowRight, Check, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { agentSetups, installers, isMachineId } from "~/lib/onboarding";
import { MobileDisclosure } from "~/components/mobile-disclosure";
import { CommandBlock } from "./command-block";

export function InstallGuide() {
  const [step, setStep] = useState<string | null>("install-cli");
  useEffect(() => {
    const sync = () => {
      const id = window.location.hash.slice(1);
      if (["install-cli", "sign-in", "agent", "first-machine"].includes(id))
        setStep(id);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const [manager, setManager] = useState<keyof typeof installers>("npm");
  const [agent, setAgent] =
    useState<(typeof agentSetups)[number]["id"]>("codex");
  const [machineId, setMachineId] = useState("");
  const selectedAgent = agentSetups.find((item) => item.id === agent)!;
  const id = machineId.trim();
  const validId = isMachineId(id);
  const commandId = validId ? id : "MACHINE_ID";

  return (
    <div className="mm-install-layout">
      <aside className="mm-install-aside">
        <nav aria-label="On this page">
          <a href="#install-cli">Install the CLI</a>
          <a href="#sign-in">Sign in</a>
          <a href="#agent">Connect your agent</a>
          <a href="#first-machine">Run your first command</a>
        </nav>
        <p>Already set up?</p>
        <Link className="mm-text-link" href="/docs">
          Command reference <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </aside>
      <div className="mm-install-steps">
        <section
          id="install-cli"
          className="mm-install-step"
          aria-labelledby="install-heading"
        >
          <MobileDisclosure
            title="1. Install the CLI"
            open={step === "install-cli"}
            onOpenChange={(open) => setStep(open ? "install-cli" : null)}
          >
            <div className="mm-step-heading">
              <span aria-hidden="true">1</span>
              <h2 id="install-heading">Install the CLI</h2>
            </div>
            <div className="mm-step-content">
              <p>
                You’ll need <strong>Node.js 20 or newer</strong>. Check with{" "}
                <code>node --version</code>, then install using your package
                manager.
              </p>
              <fieldset className="mm-segmented">
                <legend className="sr-only">Package manager</legend>
                {(["npm", "pnpm"] as const).map((value) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="package-manager"
                      value={value}
                      checked={manager === value}
                      onChange={() => setManager(value)}
                    />
                    <span>{value}</span>
                  </label>
                ))}
              </fieldset>
              <CommandBlock
                command={installers[manager]}
                label={`${manager} install command`}
              />
              <p className="mm-note">
                <Check size={15} aria-hidden="true" />
                When installation finishes, the <code>mm</code> command is
                available in your terminal.
              </p>
              <details className="mm-inline-help">
                <summary>Prefer to run without a global install?</summary>
                <p>
                  Use <code>npx --yes @minimachines/cli@latest</code> in place
                  of <code>mm</code> for each command. For example:
                </p>
                <CommandBlock
                  command="npx --yes @minimachines/cli@latest login"
                  label="run login without installing globally"
                />
              </details>
            </div>
          </MobileDisclosure>
        </section>
        <section
          id="sign-in"
          className="mm-install-step"
          aria-labelledby="login-heading"
        >
          <MobileDisclosure
            title="2. Sign in"
            open={step === "sign-in"}
            onOpenChange={(open) => setStep(open ? "sign-in" : null)}
          >
            <div className="mm-step-heading">
              <span aria-hidden="true">2</span>
              <h2 id="login-heading">Sign in once</h2>
            </div>
            <div className="mm-step-content">
              <p>
                Run this command. Your browser opens so you can sign in and
                approve access for the CLI.
              </p>
              <CommandBlock command="mm login" label="login command" />
              <p>
                Return to your terminal after approval. The CLI saves your
                credential on this computer.
              </p>
              <p className="mm-note">
                Need an account?{" "}
                <a href="/sign-up">
                  Create one <ExternalLink size={13} aria-hidden="true" />
                </a>
              </p>
              <details className="mm-inline-help">
                <summary>Browser didn’t open?</summary>
                <p>
                  Run <code>mm login --no-open</code> and open the URL printed
                  in your terminal. If you have an API key set in{" "}
                  <code>MINIMACHINE_API_KEY</code>, it takes priority over the
                  saved login.
                </p>
              </details>
            </div>
          </MobileDisclosure>
        </section>
        <section
          id="agent"
          className="mm-install-step"
          aria-labelledby="agent-heading"
        >
          <MobileDisclosure
            title="3. Connect your agent"
            open={step === "agent"}
            onOpenChange={(open) => setStep(open ? "agent" : null)}
          >
            <div className="mm-step-heading">
              <span aria-hidden="true">3</span>
              <h2 id="agent-heading">Bring your agent</h2>
            </div>
            <div className="mm-step-content">
              <p>
                Add the skill so your agent knows how to use Mini Machines. You
                can also use the CLI directly and skip this step.
              </p>
              <fieldset className="mm-segmented">
                <legend className="sr-only">Coding agent</legend>
                {agentSetups.map((item) => (
                  <label key={item.id}>
                    <input
                      type="radio"
                      name="coding-agent"
                      value={item.id}
                      checked={agent === item.id}
                      onChange={() => setAgent(item.id)}
                    />
                    <span>{item.name}</span>
                  </label>
                ))}
              </fieldset>
              <CommandBlock
                command={`mm skill install --agent ${agent}`}
                label={`${selectedAgent.name} skill install command`}
              />
              <p className="mm-file-location">
                Writes to <code>{selectedAgent.location}</code>
              </p>
              <p>
                <strong>Restart your agent session</strong> to load the skill.
                Ask it to run a build or test on Mini Machines when you’re ready
                to use cloud compute.
              </p>
            </div>
          </MobileDisclosure>
        </section>
        <section
          id="first-machine"
          className="mm-install-step"
          aria-labelledby="machine-heading"
        >
          <MobileDisclosure
            title="4. Run your first command"
            open={step === "first-machine"}
            onOpenChange={(open) => setStep(open ? "first-machine" : null)}
          >
            <div className="mm-step-heading">
              <span aria-hidden="true">4</span>
              <h2 id="machine-heading">Run your first command</h2>
            </div>
            <div className="mm-step-content">
              <p>Create a machine using the Node.js / TypeScript template.</p>
              <div className="mm-callout">
                <strong>This starts cloud compute.</strong>
                <p>
                  Creating a machine may incur usage charges. Check your account
                  before running this command, and stop the machine when you
                  finish.
                </p>
              </div>
              <CommandBlock
                command="mm create node-ts"
                label="create machine command"
              />
              <p>
                The command prints a machine ID and an app URL. Paste the ID
                below to personalize the next commands. This page doesn’t
                connect to your machine.
              </p>
              <label className="mm-field-label" htmlFor="machine-id">
                Your machine ID
              </label>
              <input
                className="mm-machine-input"
                id="machine-id"
                value={machineId}
                onChange={(event) => setMachineId(event.target.value)}
                placeholder="Starts with vm_"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-describedby="machine-id-hint"
                aria-invalid={id.length > 0 && !validId ? true : undefined}
              />
              <p id="machine-id-hint" className="mm-field-hint">
                {id.length > 0 && !validId
                  ? "Use the ID printed by mm create: vm_ followed by letters, numbers, underscores, or hyphens."
                  : "Copy the ID exactly as it appears in your terminal."}
              </p>
              <h3>Check the runtime</h3>
              <CommandBlock
                command={`mm exec ${commandId} 'node --version'`}
                label="runtime check command"
                disabled={!validId}
              />
              <p>
                You should see the Node.js version installed on the machine. To
                open its browser console:
              </p>
              <CommandBlock
                command={`mm run ${commandId}`}
                label="open console command"
                disabled={!validId}
              />
              <h3>Finish up</h3>
              <p>
                Workspaces are temporary. Commit, push, or download anything you
                need before stopping the machine.
              </p>
              <CommandBlock
                command={`mm stop ${commandId}`}
                label="stop machine command"
                disabled={!validId}
              />
              <p className="mm-note">
                Ready for more?{" "}
                <Link href="/docs">
                  Read the command reference{" "}
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </p>
            </div>
          </MobileDisclosure>
        </section>
      </div>
    </div>
  );
}
