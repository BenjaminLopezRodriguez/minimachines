"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import { api } from "~/trpc/react";
import type { RouterOutputs } from "~/trpc/react";

type Machine = RouterOutputs["machines"]["list"][number];
export function AgentConnection({
  machine,
  provider,
  onMachine,
  onReadyChange,
}: {
  machine?: Machine;
  provider: "claude" | "codex";
  onMachine: (id: string) => void;
  onReadyChange?: (ready: boolean) => void;
}) {
  const utils = api.useUtils();
  const create = api.machines.create.useMutation();
  const restart = api.machines.restart.useMutation();
  const check = api.bots.connection.useMutation();
  const checkConnection = check.mutateAsync;
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [terminal, setTerminal] = useState(false);
  const [accountConnected, setConnected] = useState(false);
  const [installed, setInstalled] = useState<boolean | null>(null);
  const checking = useRef(false);
  const lastFocusCheck = useRef(0);
  const agentName = provider === "claude" ? "Claude Code" : "Codex";
  const login =
    provider === "claude" ? "claude auth login" : "codex login --device-auth";
  const starting = machine?.status === "starting";
  const busy =
    create.isPending || restart.isPending || check.isPending || starting;
  const running = machine?.status === "running";
  const connected = accountConnected && running;
  const machineId = machine?.id;
  useEffect(() => {
    onReadyChange?.(connected);
    return () => onReadyChange?.(false);
  }, [connected, onReadyChange]);
  const checkAccount = useCallback(async () => {
    if (!machineId || !running || checking.current) return;
    checking.current = true;
    lastFocusCheck.current = Date.now();
    setError("");
    try {
      const state = await checkConnection({ machineId, provider });
      setConnected(state.connected);
      setInstalled(state.installed);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Couldn’t check your account. Try again.",
      );
    } finally {
      checking.current = false;
    }
  }, [machineId, running, provider, checkConnection]);
  useEffect(() => {
    void checkAccount();
  }, [checkAccount]);
  useEffect(() => {
    if (!terminal || connected) return;
    const onFocus = () => {
      if (Date.now() - lastFocusCheck.current > 10_000) void checkAccount();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [terminal, connected, checkAccount]);
  async function prepare() {
    setError("");
    try {
      if (machine) {
        await restart.mutateAsync({ id: machine.id });
        await utils.machines.list.invalidate();
      } else {
        const m = await create.mutateAsync({
          templateId: `${provider}-devbox`,
          name: `${agentName} workspace`,
        });
        await utils.machines.list.invalidate();
        onMachine(m.id);
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Couldn’t prepare your workspace. Try again.",
      );
    }
  }
  const step = !machine || !running ? 0 : connected ? 2 : 1;
  return (
    <section
      className="mm-agent-connection mm-mobile-connection"
      aria-label="Agent connection"
      aria-busy={busy}
    >
      <ol className="mm-connection-steps" aria-label="Connection progress">
        {["Workspace", "Sign in", "Ready"].map((label, i) => (
          <li
            key={label}
            aria-current={step === i ? "step" : undefined}
            data-complete={step > i}
          >
            <span aria-hidden="true">
              {step > i ? <Check size={12} /> : i + 1}
            </span>
            {label}
            {i < 2 && <ChevronRight size={12} aria-hidden="true" />}
          </li>
        ))}
      </ol>
      <div className="mm-connection-status" role="status" aria-live="polite">
        <strong>
          {create.isPending || restart.isPending || starting
            ? "Preparing your workspace…"
            : check.isPending
              ? "Checking your account…"
              : connected
                ? `${agentName} is connected`
                : !machine
                  ? "Give your agent a workspace"
                  : !running
                    ? "Your workspace is paused"
                    : "Sign in to your agent"}
        </strong>
        <p>
          {connected
            ? "Your account is ready. Continue below to return to your conversation."
            : !machine
              ? "We’ll choose the setup for you. Your agent account stays in its own VM."
              : !running
                ? "Start it here to pick up where you left off. You may need to sign in again."
                : "Use your existing account. No API key to find or paste."}
        </p>
      </div>
      {!running ? (
        <>
          <button
            className="mm-bot-button"
            type="button"
            disabled={busy}
            onClick={() => void prepare()}
          >
            {create.isPending || restart.isPending || starting
              ? "Preparing…"
              : machine
                ? "Start workspace"
                : "Create workspace"}
          </button>
          <small>
            Starts one VM using your beta compute allowance. Your agent’s
            subscription limits still apply.
          </small>
        </>
      ) : !connected ? (
        <>
          <p className="mm-bot-field-hint">
            Run this in the workspace terminal, then finish sign-in on{" "}
            {agentName === "Codex" ? "ChatGPT" : "Claude"}.
          </p>
          <div className="mm-connection-command">
            <code>{login}</code>
            <button
              type="button"
              className="mm-connection-copy"
              onClick={() => {
                void navigator.clipboard
                  .writeText(login)
                  .then(() => setCopied(true))
                  .catch(() =>
                    setError("Select and copy the command shown here."),
                  );
              }}
              aria-label="Copy sign-in command"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          {machine?.emulatorUrl && (
            <button
              type="button"
              className={
                terminal
                  ? "mm-bot-button mm-bot-button-secondary"
                  : "mm-bot-button"
              }
              onClick={() => setTerminal(!terminal)}
              aria-expanded={terminal}
              aria-controls="agent-sign-in-terminal"
            >
              {terminal ? "Hide sign-in terminal" : "Open sign-in terminal"}
            </button>
          )}
          {terminal && machine?.emulatorUrl && (
            <iframe
              id="agent-sign-in-terminal"
              src={machine.emulatorUrl}
              title="Private agent sign-in terminal"
              className="mm-agent-terminal"
              referrerPolicy="no-referrer"
            />
          )}
          <button
            type="button"
            className={
              terminal
                ? "mm-bot-button"
                : "mm-bot-button mm-bot-button-secondary"
            }
            disabled={busy}
            onClick={() => void checkAccount()}
          >
            {check.isPending ? "Checking…" : "I’ve signed in"}
          </button>
          {installed === false && (
            <details className="mm-connection-help">
              <summary>Install the agent on this workspace</summary>
              <p>
                New agent workspaces include it. For this older workspace, run:
              </p>
              <code>
                npm install --prefix ~/.local -g{" "}
                {provider === "claude"
                  ? "@anthropic-ai/claude-code"
                  : "@openai/codex"}
              </code>
              <p>
                Then run{" "}
                <code>export PATH=&quot;$HOME/.local/bin:$PATH&quot;</code> and
                the sign-in command above.
              </p>
            </details>
          )}
        </>
      ) : (
        <>
          <small>
            Baton decisions will arrive at your verified email with a secure
            reply link.
          </small>
          <details className="mm-connection-help">
            <summary>Account & workspace details</summary>
            <p>
              Sign-in stays in this VM. Replacing it may require signing in
              again.
            </p>
            <p>
              Chat stays focused on conversation. Project work runs in the VM
              terminal using the agent’s native tools and agent-pager skill.
            </p>
            {machine?.emulatorUrl && (
              <a
                href={machine.emulatorUrl}
                target="_blank"
                rel="noreferrer"
                className="mm-bot-button mm-bot-button-secondary"
              >
                Open workspace terminal
              </a>
            )}
            <button
              type="button"
              className="mm-bot-button mm-bot-button-secondary"
              disabled={busy}
              onClick={() => {
                if (!machine) return;
                setError("");
                check.mutate(
                  { machineId: machine.id, provider, disconnect: true },
                  {
                    onSuccess: (state) => {
                      setConnected(state.connected);
                      setInstalled(state.installed);
                      setTerminal(false);
                    },
                    onError: (e) => setError(e.message),
                  },
                );
              }}
            >
              Disconnect {agentName}
            </button>
          </details>
        </>
      )}
      {error && (
        <p role="alert" className="mm-bot-error">
          {error}
        </p>
      )}
    </section>
  );
}
