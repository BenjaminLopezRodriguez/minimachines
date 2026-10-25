"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import type { RouterOutputs } from "~/trpc/react";

type Machine = RouterOutputs["machines"]["list"][number];
export function AgentConnection({
  machine,
  provider,
  onMachine,
}: {
  machine?: Machine;
  provider: "claude" | "codex";
  onMachine: (id: string) => void;
}) {
  const utils = api.useUtils();
  const create = api.machines.create.useMutation();
  const check = api.bots.connection.useMutation();
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [terminal, setTerminal] = useState(false);
  const login =
    provider === "claude" ? "claude auth login" : "codex login --device-auth";
  const busy = create.isPending || check.isPending;
  const connected =
    check.data?.connected &&
    check.variables?.machineId === machine?.id &&
    check.variables?.provider === provider;
  async function prepare() {
    setError("");
    try {
      const m = await create.mutateAsync({
        templateId: `${provider}-devbox`,
        name: provider === "claude" ? "Claude workspace" : "Codex workspace",
      });
      await utils.machines.list.invalidate();
      onMachine(m.id);
      check.reset();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not create a workspace.",
      );
    }
  }
  return (
    <section className="mm-agent-connection" aria-label="Agent connection">
      {!machine ? (
        <>
          <p>
            Connect your account in a private cloud workspace. Your
            subscription’s limits still apply.
          </p>
          <button
            className="mm-bot-button"
            type="button"
            disabled={busy}
            onClick={() => void prepare()}
          >
            {create.isPending
              ? "Preparing workspace…"
              : "Create agent workspace"}
          </button>
          <small>Starts one VM using your beta compute allowance.</small>
        </>
      ) : (
        <>
          <p>
            {connected
              ? "Connected. Your agent is ready."
              : "Sign in once inside your workspace."}
          </p>
          {!connected && (
            <>
              <p className="mm-bot-field-hint">
                Open the terminal and run this command. Finish sign-in on the
                provider’s website; for Codex, enter its device code there.
              </p>
              <code>{login}</code>
              <button
                type="button"
                className="mm-bot-button mm-bot-button-secondary"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(login)
                    .then(() => setCopied(true))
                    .catch(() =>
                      setError("Select and copy the command above."),
                    );
                }}
              >
                {copied ? "Copied" : "Copy command"}
              </button>
            </>
          )}
          {machine.emulatorUrl ? (
            <button
              type="button"
              className="mm-bot-button mm-bot-button-secondary"
              onClick={() => setTerminal(!terminal)}
            >
              {terminal
                ? "Hide terminal"
                : connected
                  ? "Work in terminal"
                  : "Open sign-in terminal"}
            </button>
          ) : (
            <p>Start this machine from Machines to open its terminal.</p>
          )}
          {terminal && machine.emulatorUrl && (
            <iframe
              src={machine.emulatorUrl}
              title="Private agent sign-in terminal"
              className="mm-agent-terminal"
              referrerPolicy="no-referrer"
            />
          )}
          <button
            type="button"
            className="mm-bot-button mm-bot-button-secondary"
            disabled={busy}
            onClick={() => {
              setError("");
              check.mutate(
                { machineId: machine.id, provider, disconnect: !!connected },
                { onError: (e) => setError(e.message) },
              );
            }}
          >
            {check.isPending
              ? "Checking…"
              : connected
                ? "Disconnect account"
                : "Check connection"}
          </button>
          {check.data && !connected && !check.data.installed && (
            <p>
              Install the CLI in this terminal with{" "}
              <code>
                npm install --prefix ~/.local -g{" "}
                {provider === "claude"
                  ? "@anthropic-ai/claude-code"
                  : "@openai/codex"}
              </code>
              , then <code>export PATH=&quot;$HOME/.local/bin:$PATH&quot;</code>
              . New agent workspaces include it.
            </p>
          )}
          {check.data?.installed && !connected && (
            <p>
              Not signed in yet. Complete the terminal sign-in, then check
              again.
            </p>
          )}
        </>
      )}
      {connected && (
        <p className="mm-bot-field-hint">
          Chat here for ideas, or work on your project in the terminal. Tell the
          coding agent to use its agent-pager skill when it needs a decision;
          the email reply hands it back to the waiting agent.
        </p>
      )}
      <small>
        Sign-in stays in this workspace. If it’s replaced, sign in again. Baton
        decisions arrive by email with a secure reply link.
      </small>
      {error && (
        <p role="alert" className="mm-bot-error">
          {error}
        </p>
      )}
    </section>
  );
}
