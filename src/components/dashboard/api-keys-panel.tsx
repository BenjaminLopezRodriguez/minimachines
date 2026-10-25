"use client";

import { PageSwitcher } from "./page-switcher";
import { useEffect, useState } from "react";
import { Copy, KeyRound, Plug, Trash2 } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { api } from "~/trpc/react";

/** MCP config for each client; `key` is the real secret right after creating one, else a placeholder. */
const CLIENTS: { id: string; label: string; where: string; snippet: (key: string, base: string) => string }[] = [
  {
    id: "claude",
    label: "Claude Code",
    where: "Run in your terminal",
    snippet: (key, BASE) =>
      `claude mcp add minimachine --env MINIMACHINE_API_KEY=${key} --env MINIMACHINE_BASE_URL=${BASE} -- npx -y -p minimachine minimachine-mcp`,
  },
  {
    id: "cursor",
    label: "Cursor / VS Code",
    where: "~/.cursor/mcp.json or .vscode/mcp.json",
    snippet: (key, BASE) =>
      JSON.stringify(
        {
          mcpServers: {
            minimachine: {
              command: "npx",
              args: ["-y", "-p", "minimachine", "minimachine-mcp"],
              env: { MINIMACHINE_API_KEY: key, MINIMACHINE_BASE_URL: BASE },
            },
          },
        },
        null,
        2,
      ),
  },
  {
    id: "codex",
    label: "Codex",
    where: "~/.codex/config.toml",
    snippet: (key, BASE) =>
      `[mcp_servers.minimachine]\ncommand = "npx"\nargs = ["-y", "-p", "minimachine", "minimachine-mcp"]\nenv = { MINIMACHINE_API_KEY = "${key}", MINIMACHINE_BASE_URL = "${BASE}" }`,
  },
];

const ago = (iso: string | null) => {
  if (!iso) return "never used";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 2) return "used just now";
  if (mins < 60) return `used ${mins}m ago`;
  if (mins < 48 * 60) return `used ${Math.round(mins / 60)}h ago`;
  return `used ${Math.round(mins / 1440)}d ago`;
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      <Copy className="size-3.5" aria-hidden />
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

export function ApiKeysPanel() {
  const utils = api.useUtils();
  const { data: all = [], isLoading } = api.apiKeys.list.useQuery();
  const [label, setLabel] = useState("");
  const [revealed, setRevealed] = useState<{ secret: string; label: string } | null>(null);
  const [client, setClient] = useState("claude");
  // Set after mount so the server render and hydration agree.
  const [base, setBase] = useState("https://www.minimachin.es");
  useEffect(() => setBase(window.location.origin), []);

  // Machines mint their own keys (label agent:<id>) and revoke them on stop.
  const keys = all.filter((k) => !k.label.startsWith("agent:"));
  const machineKeys = all.length - keys.length;

  const create = api.apiKeys.create.useMutation({
    onSuccess: (result, vars) => {
      setRevealed({ secret: result.secret, label: vars?.label ?? "key" });
      setLabel("");
      void utils.apiKeys.list.invalidate();
    },
  });
  const revoke = api.apiKeys.revoke.useMutation({
    onSuccess: () => void utils.apiKeys.list.invalidate(),
  });

  const chosen = CLIENTS.find((c) => c.id === client) ?? CLIENTS[0]!;
  const snippet = chosen.snippet(revealed?.secret ?? "mm_…", base);

  return (
    <div className="space-y-10">
      <section className="space-y-6">
        <div>
          <h1 className="text-lg font-medium tracking-tight">
            <PageSwitcher title="Keys & MCP" />
          </h1>
          <p className="text-muted-foreground mt-1 max-w-xl text-sm">
            <code className="font-mono text-[13px]">mm_</code> keys let the CLI, the{" "}
            <code className="font-mono text-[13px]">minimachine</code> SDK and MCP act as you. Each secret
            is shown once — create one per tool so you can revoke them separately.
          </p>
        </div>

        {revealed ? (
          <div className="border-border space-y-2 rounded-md border bg-white/[0.02] p-4" role="status">
            <p className="text-sm font-medium">Copy “{revealed.label}” now</p>
            <p className="text-muted-foreground text-xs">It won’t be shown again. The MCP setup below already has it filled in.</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <code className="border-border bg-background flex-1 rounded-md border px-3 py-2 font-mono text-xs break-all">
                {revealed.secret}
              </code>
              <CopyButton text={revealed.secret} />
            </div>
            <Button type="button" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setRevealed(null)}>
              Done
            </Button>
          </div>
        ) : null}

        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate({ label: label.trim() || undefined });
          }}
        >
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="What's it for? e.g. laptop CLI"
            aria-label="Key label"
            className="sm:max-w-xs"
            maxLength={64}
          />
          <Button type="submit" disabled={create.isPending}>
            <KeyRound className="size-3.5" aria-hidden />
            {create.isPending ? "Creating…" : "Create key"}
          </Button>
        </form>
        {create.error && <p role="alert" className="text-destructive text-sm">{create.error.message}</p>}

        <div className="space-y-2">
          <h2 className="text-sm font-medium">Your keys</h2>
          {isLoading ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : keys.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No keys yet. <code className="font-mono text-[12px]">mm login</code> makes one for the CLI, or create one above.
            </p>
          ) : (
            <ul className="divide-border border-border divide-y rounded-md border">
              {keys.map((key) => (
                <li key={key.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{key.label}</p>
                    <p className="text-muted-foreground font-mono text-[11px]">
                      mm_{key.keyPrefix}… · created {new Date(key.createdAt).toLocaleDateString()} · {ago(key.lastUsedAt)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate({ id: key.id })}
                    aria-label={`Revoke ${key.label}`}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {machineKeys > 0 && (
            <p className="text-muted-foreground text-xs">
              Plus {machineKeys} machine key{machineKeys === 1 ? "" : "s"}, made and revoked automatically by your running machines.
            </p>
          )}
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="mcp-heading">
        <div>
          <h2 id="mcp-heading" className="flex items-center gap-2 text-base font-medium tracking-tight">
            <Plug className="size-4" aria-hidden /> Connect MCP
          </h2>
          <p className="text-muted-foreground mt-1 max-w-xl text-sm">
            Give your coding agent tools to create machines, run commands and share apps. Pick your client, make a key
            for it, and paste the config.
          </p>
        </div>
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="MCP client">
          {CLIENTS.map((c) => (
            <Button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={c.id === client}
              variant={c.id === client ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setClient(c.id)}
            >
              {c.label}
            </Button>
          ))}
        </div>
        <div className="border-border space-y-2 rounded-md border p-4" role="tabpanel">
          <div className="flex items-center justify-between gap-2">
            <p className="text-muted-foreground text-xs">{chosen.where}</p>
            <div className="flex gap-2">
              {!revealed && (
                <Button
                  type="button"
                  size="sm"
                  disabled={create.isPending}
                  onClick={() => create.mutate({ label: `mcp: ${chosen.label}` })}
                >
                  <KeyRound className="size-3.5" aria-hidden />
                  Create a key for {chosen.label}
                </Button>
              )}
              <CopyButton text={snippet} />
            </div>
          </div>
          <pre className="bg-background overflow-x-auto rounded-md p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-all">
            {snippet}
          </pre>
        </div>
      </section>
    </div>
  );
}
