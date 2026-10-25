"use client";

import { useState } from "react";
import { Lock, Trash2 } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { api } from "~/trpc/react";

const COMMON = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GITHUB_TOKEN", "OPENROUTER_API_KEY", "GEMINI_API_KEY"];

export function ProviderKeysPanel() {
  const utils = api.useUtils();
  const { data, isLoading } = api.secrets.list.useQuery();
  const [name, setName] = useState("ANTHROPIC_API_KEY");
  const [value, setValue] = useState("");
  const keys = data?.keys ?? [];

  const save = api.secrets.set.useMutation({
    onSuccess: () => {
      setValue("");
      void utils.secrets.list.invalidate();
    },
  });
  const remove = api.secrets.delete.useMutation({
    onSuccess: () => void utils.secrets.list.invalidate(),
  });

  return (
    <section className="space-y-4" aria-labelledby="provider-heading">
      <div>
        <h2 id="provider-heading" className="flex items-center gap-2 text-base font-medium tracking-tight">
          <Lock className="size-4" aria-hidden /> Provider keys
        </h2>
        <p className="text-muted-foreground mt-1 max-w-xl text-sm">
          Set once, available on every machine you create as environment variables — so Claude Code, Codex and{" "}
          <code className="font-mono text-[13px]">gh</code> work there without pasting keys. Stored encrypted; this page
          never shows them again.
        </p>
        <p className="mt-2 max-w-xl text-sm text-amber-600 dark:text-amber-400">
          Anyone you add as a member of a project can run commands on its machines, and so can read these keys there.
          Use keys you’d trust them with, or scoped ones.
        </p>
      </div>

      {data && !data.enabled ? (
        <p className="text-muted-foreground text-sm">Provider keys aren’t enabled on this server yet.</p>
      ) : (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({ name, value });
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value.toUpperCase())}
            list="provider-key-names"
            aria-label="Variable name"
            className="font-mono text-xs sm:max-w-[14rem]"
            maxLength={64}
            required
          />
          <datalist id="provider-key-names">
            {COMMON.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <Input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Paste the key"
            aria-label="Key value"
            autoComplete="off"
            className="font-mono text-xs"
            required
          />
          <Button type="submit" disabled={save.isPending || !value}>
            {save.isPending ? "Saving…" : keys.some((k) => k.name === name) ? "Replace" : "Save"}
          </Button>
        </form>
      )}
      {save.error && <p role="alert" className="text-destructive text-sm">{save.error.message}</p>}

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : keys.length === 0 ? (
        <p className="text-muted-foreground text-sm">No provider keys yet.</p>
      ) : (
        <ul className="divide-border border-border divide-y rounded-md border">
          {keys.map((k) => (
            <li key={k.name} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate font-mono text-sm">{k.name}</p>
                <p className="text-muted-foreground font-mono text-[11px]">
                  ••••{k.lastFour} · updated {new Date(k.updatedAt).toLocaleDateString()}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                disabled={remove.isPending}
                onClick={() => remove.mutate({ name: k.name })}
                aria-label={`Delete ${k.name}`}
              >
                <Trash2 className="size-3.5" aria-hidden />
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-muted-foreground text-xs">Changes apply to machines created or restarted after you save.</p>
    </section>
  );
}
