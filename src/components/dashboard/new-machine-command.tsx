"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command";
import type { Template, TemplateGroup } from "~/server/data/templates";
import { api } from "~/trpc/react";

const groupLabel: Record<TemplateGroup, string> = {
  stacks: "Stacks",
  agents: "Agent boxes",
  general: "General",
};

const groupOrder: TemplateGroup[] = ["stacks", "agents", "general"];

export function NewMachineCommand() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: templates = [] } = api.machines.templates.useQuery(undefined, {
    enabled: open,
  });

  const create = api.machines.create.useMutation({
    onSuccess: () => {
      setOpen(false);
      setError(null);
      router.refresh();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  useEffect(() => {
    const syncHash = () => {
      if (window.location.hash === "#new") {
        setOpen(true);
        history.replaceState(
          null,
          "",
          `${window.location.pathname}${window.location.search}`,
        );
      }
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const byGroup = groupOrder
    .map((group) => ({
      group,
      items: templates.filter((t) => t.group === group),
    }))
    .filter((g) => g.items.length > 0);

  const onSelect = (template: Template) => {
    setError(null);
    create.mutate({ templateId: template.id });
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
      title="New machine"
      description="Search templates tuned for agent workloads"
      showCloseButton={false}
    >
      <CommandInput placeholder="Search templates by stack, agent, or task…" />
      <CommandList>
        <CommandEmpty>No templates match</CommandEmpty>
        {byGroup.map(({ group, items }) => (
          <CommandGroup key={group} heading={groupLabel[group]}>
            {items.map((template) => (
              <CommandItem
                key={template.id}
                value={`${template.name} ${template.summary} ${template.tags.join(" ")} ${template.agents.join(" ")} ${template.stacks.join(" ")}`}
                disabled={create.isPending}
                onSelect={() => onSelect(template)}
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">
                    {template.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {template.summary}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
      {error ? (
        <p className="border-t px-3 py-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </CommandDialog>
  );
}
