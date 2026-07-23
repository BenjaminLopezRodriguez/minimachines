"use client";

import { useState } from "react";
import { Copy, KeyRound, Trash2 } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { api } from "~/trpc/react";

export function ApiKeysPanel() {
  const utils = api.useUtils();
  const { data: keys = [], isLoading } = api.apiKeys.list.useQuery();
  const [label, setLabel] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const create = api.apiKeys.create.useMutation({
    onSuccess: (result) => {
      setRevealed(result.secret);
      setLabel("");
      void utils.apiKeys.list.invalidate();
    },
  });

  const revoke = api.apiKeys.revoke.useMutation({
    onSuccess: () => {
      void utils.apiKeys.list.invalidate();
    },
  });

  async function copySecret() {
    if (!revealed) return;
    await navigator.clipboard.writeText(revealed);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-medium tracking-tight">API keys</h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          Authenticate the{" "}
          <code className="font-mono text-[13px]">minimachine</code> SDK and MCP
          against this account. Secrets are shown once.
        </p>
      </div>

      {revealed ? (
        <div className="space-y-2 rounded-md border border-border bg-white/[0.02] p-4">
          <p className="text-sm font-medium">Copy your key now</p>
          <p className="text-xs text-muted-foreground">
            It will not be shown again.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <code className="flex-1 break-all rounded-md border border-border bg-background px-3 py-2 font-mono text-xs">
              {revealed}
            </code>
            <Button type="button" variant="outline" onClick={() => void copySecret()}>
              <Copy className="size-3.5" aria-hidden />
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="h-8 px-2 text-xs"
            onClick={() => setRevealed(null)}
          >
            Dismiss
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
          placeholder="Label (optional)"
          className="sm:max-w-xs"
          maxLength={64}
        />
        <Button type="submit" disabled={create.isPending}>
          <KeyRound className="size-3.5" aria-hidden />
          {create.isPending ? "Creating…" : "Create key"}
        </Button>
      </form>

      <div className="space-y-2">
        <h2 className="text-sm font-medium">Active keys</h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No keys yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {keys.map((key) => (
              <li
                key={key.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm">{key.label}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    mm_{key.keyPrefix}…
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate({ id: key.id })}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-md border border-border p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Agent setup</p>
        <pre className="mt-2 overflow-x-auto font-mono text-[12px] leading-relaxed">
{`export MINIMACHINE_API_KEY=mm_…
export MINIMACHINE_BASE_URL=http://localhost:3000
npx minimachine-mcp`}
        </pre>
      </div>
    </div>
  );
}
