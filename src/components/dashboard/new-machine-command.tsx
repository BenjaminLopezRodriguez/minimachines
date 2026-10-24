"use client";

import { Check, Loader2, Plus, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import type { Template } from "~/server/data/templates";
import { api } from "~/trpc/react";

export type MachineCreateInput = {
  templateId: string;
  name?: string;
  task?: string;
};

type CreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  templates: Template[];
  loading: boolean;
  templateError?: string;
  createError?: string;
  pending: boolean;
  onRetry: () => void;
  onCreate: (input: MachineCreateInput) => void;
};

function MachineCreateForm({
  templates,
  loading,
  templateError,
  createError,
  pending,
  onRetry,
  onCreate,
}: Omit<CreateDialogProps, "open" | "onOpenChange" | "trigger">) {
  const [templateId, setTemplateId] = useState("node-ts");
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [task, setTask] = useState("");
  const selected =
    templates.find((template) => template.id === templateId) ??
    templates.find((template) => template.status === "ready") ??
    templates[0];
  const term = search.trim().toLowerCase();
  const filtered = templates.filter((template) =>
    [template.name, template.summary, ...template.tags, ...template.agents]
      .join(" ")
      .toLowerCase()
      .includes(term),
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (selected && !pending && !templateError)
          onCreate({
            templateId: selected.id,
            name: name.trim() || undefined,
            task: task.trim() || undefined,
          });
      }}
    >
      <div className="mm-create-body">
        <fieldset disabled={pending} className="mm-template-picker">
          <legend>Choose a template</legend>
          <div className="mm-template-search">
            <Search size={16} aria-hidden="true" />
            <label className="sr-only" htmlFor="template-search">
              Search templates
            </label>
            <input
              id="template-search"
              type="search"
              placeholder="Search runtimes, tools, or agents…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              autoComplete="off"
            />
          </div>
          {loading ? (
            <div className="mm-template-loading" role="status">
              <span />
              <span />
              <span />
              <p>Loading templates…</p>
            </div>
          ) : templateError ? (
            <div className="mm-template-error" role="alert">
              <p>Templates couldn’t load. {templateError}</p>
              <button
                type="button"
                className="mm-dashboard-button mm-dashboard-button-secondary"
                onClick={onRetry}
              >
                Try again
              </button>
            </div>
          ) : (
            <div className="mm-template-options">
              {filtered.length ? (
                filtered.map((template) => (
                  <label className="mm-template-option" key={template.id}>
                    <input
                      type="radio"
                      name="machine-template"
                      value={template.id}
                      checked={selected?.id === template.id}
                      onChange={() => setTemplateId(template.id)}
                    />
                    <span className="mm-template-option-content">
                      <span>
                        <strong>{template.name}</strong>
                        {template.status === "preview" ? (
                          <small>Preview</small>
                        ) : null}
                        {selected?.id === template.id ? (
                          <Check size={16} aria-hidden="true" />
                        ) : null}
                      </span>
                      <span>{template.summary}</span>
                      <small>
                        {template.resources.cpu} vCPU ·{" "}
                        {template.resources.memoryGb} GB memory
                      </small>
                    </span>
                  </label>
                ))
              ) : (
                <div className="mm-template-error">
                  <p>No templates match “{search}”.</p>
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="mm-dashboard-text-link"
                  >
                    Clear search
                  </button>
                </div>
              )}
            </div>
          )}
        </fieldset>
        <fieldset disabled={pending} className="mm-create-fields">
          <legend className="sr-only">Machine details</legend>
          <label htmlFor="machine-name">
            Machine name <span>optional</span>
          </label>
          <input
            id="machine-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Website build"
            maxLength={64}
            autoComplete="off"
          />
          <label htmlFor="machine-task">
            What are you working on? <span>optional</span>
          </label>
          <input
            id="machine-task"
            value={task}
            onChange={(event) => setTask(event.target.value)}
            placeholder="e.g. Test the new checkout flow"
            maxLength={200}
            autoComplete="off"
          />
        </fieldset>
        <div className="mm-create-review">
          <strong>
            {selected ? selected.name : "Choose a template to continue"}
          </strong>
          <span>
            {selected
              ? `${selected.resources.cpu} vCPU · ${selected.resources.memoryGb} GB memory`
              : "Resources appear here once templates load."}
          </span>
          <p>
            Creating starts cloud compute and may incur usage charges. Save your
            work before stopping a machine; workspaces are temporary.
          </p>
        </div>
        {createError ? (
          <p className="mm-create-error" role="alert">
            {createError}
          </p>
        ) : null}
      </div>
      <footer className="mm-create-footer">
        <span role="status">
          {pending
            ? "Preparing your workspace. This can take a moment."
            : "Your agent and files can be added after creation."}
        </span>
        <button
          type="submit"
          className="mm-dashboard-button mm-dashboard-button-primary"
          disabled={!selected || loading || !!templateError || pending}
        >
          {pending ? (
            <>
              <Loader2
                size={16}
                className="mm-button-spinner"
                aria-hidden="true"
              />
              Creating…
            </>
          ) : (
            <>
              <Plus size={16} aria-hidden="true" />
              Create machine
            </>
          )}
        </button>
      </footer>
    </form>
  );
}

export function MachineCreateDialog({
  open,
  onOpenChange,
  trigger,
  ...props
}: CreateDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!props.pending) onOpenChange(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className="mm-app mm-create-dialog"
        showCloseButton={false}
      >
        <header className="mm-create-header">
          <div>
            <DialogTitle>New machine</DialogTitle>
            <DialogDescription>
              Choose a workspace for your next task.
            </DialogDescription>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={props.pending}
            aria-label="Close new machine"
          >
            <X size={19} aria-hidden="true" />
          </button>
        </header>
        {open ? <MachineCreateForm {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}

export function NewMachineCommand() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const submitting = useRef(false);
  const templates = api.machines.templates.useQuery(undefined, {
    enabled: open,
  });
  const create = api.machines.create.useMutation({
    onSuccess: (machine) => {
      setOpen(false);
      window.history.replaceState(null, "", `#${machine.id}`);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
      router.refresh();
    },
    onSettled: () => {
      submitting.current = false;
    },
  });
  useEffect(() => {
    const syncHash = () => {
      if (window.location.hash === "#new") {
        setOpen(true);
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${window.location.search}`,
        );
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (!submitting.current) setOpen((value) => !value);
      }
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("hashchange", syncHash);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);
  return (
    <MachineCreateDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) create.reset();
      }}
      trigger={
        <button
          type="button"
          className="mm-dashboard-button mm-dashboard-button-primary"
        >
          <Plus size={17} aria-hidden="true" />
          New machine
        </button>
      }
      templates={templates.data ?? []}
      loading={templates.isLoading}
      templateError={templates.error?.message}
      createError={create.error?.message}
      pending={create.isPending}
      onRetry={() => {
        void templates.refetch();
      }}
      onCreate={(input) => {
        if (submitting.current) return;
        submitting.current = true;
        create.mutate(input);
      }}
    />
  );
}
