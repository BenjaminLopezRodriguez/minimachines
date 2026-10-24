"use client";

import { PageSwitcher } from "./page-switcher";
import { MobileDisclosure } from "~/components/mobile-disclosure";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "~/components/ui/dialog";

import {
  Archive,
  Check,
  ChevronRight,
  ChevronLeft,
  MoreHorizontal,
  FileDiff,
  GitBranch,
  GitCommitHorizontal,
  History,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { GitFile, GitRequest } from "~/lib/git";
import { api } from "~/trpc/react";

type View = "changes" | "checkpoints" | "stashes" | "history";
type Selection = {
  file?: string;
  layer?: "staged" | "working" | "untracked";
  ref?: string;
  kind: "file" | "checkpoint" | "stash";
  title: string;
};

function ChangedFile({
  file,
  layer,
  selected,
  onSelect,
  onStage,
  busy,
}: {
  file: GitFile;
  layer: "staged" | "working" | "untracked";
  selected: boolean;
  onSelect: () => void;
  onStage: () => void;
  busy: boolean;
}) {
  const status = file.conflict
    ? "!"
    : layer === "untracked"
      ? "U"
      : layer === "staged"
        ? file.index
        : file.worktree;
  return (
    <li className="mm-git-file" data-selected={selected}>
      <button className="mm-git-file-open" onClick={onSelect}>
        <span className="mm-git-file-status" data-kind={status}>
          {status}
        </span>
        <span>{file.path}</span>
      </button>
      <button
        className="mm-git-icon-button"
        onClick={onStage}
        disabled={busy || file.conflict}
        aria-label={`${layer === "staged" ? "Unstage" : "Stage"} ${file.path}`}
        title={layer === "staged" ? "Unstage file" : "Stage file"}
      >
        {layer === "staged" ? "−" : <Plus size={15} />}
      </button>
    </li>
  );
}

export function GitWorkspace({ initialMachine }: { initialMachine?: string }) {
  const machines = api.machines.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const [machineId, setMachineId] = useState(initialMachine ?? "");
  const [path, setPath] = useState("/workspace");
  const [pathDraft, setPathDraft] = useState("/workspace");
  const [repoOptions, setRepoOptions] = useState(false);
  const repoChosen = useRef(new Set<string>());
  const backRef = useRef<HTMLButtonElement>(null);
  const selectionSource = useRef<HTMLButtonElement | null>(null);
  const openSelection = (next: Selection) => {
    selectionSource.current =
      document.activeElement instanceof HTMLButtonElement
        ? document.activeElement
        : null;
    setSelection(next);
  };
  const [view, setView] = useState<View>("changes");
  const [selection, setSelection] = useState<Selection | null>(null);
  useEffect(() => {
    if (selection && window.matchMedia("(max-width: 700px)").matches) {
      backRef.current?.focus({ preventScroll: true });
      backRef.current?.scrollIntoView({ block: "start" });
    }
  }, [selection]);
  const [message, setMessage] = useState("");
  const [checkpointName, setCheckpointName] = useState("");
  const [agent, setAgent] = useState("manual");
  const [branchName, setBranchName] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState<{
    action: GitRequest["action"];
    ref?: string;
    label: string;
    explanation: string;
  } | null>(null);
  useEffect(() => {
    if (!machineId && machines.data?.length)
      setMachineId(
        machines.data.find((m) => m.status === "running")?.id ??
          machines.data[0]!.id,
      );
  }, [machineId, machines.data]);
  const machine = machines.data?.find((m) => m.id === machineId);
  const enabled = machine?.status === "running";
  const repos = api.git.discover.useQuery(
    { id: machineId },
    { enabled, refetchOnWindowFocus: false },
  );
  const status = api.git.status.useQuery(
    { id: machineId, path },
    {
      enabled,
      refetchOnWindowFocus: false,
      refetchInterval: enabled ? 20000 : false,
    },
  );
  const diff = api.git.diff.useQuery(
    {
      id: machineId,
      path,
      file: selection?.file,
      ref: selection?.ref,
      layer: selection?.layer,
      kind: selection?.kind ?? "file",
    },
    { enabled: enabled && !!selection, refetchOnWindowFocus: false },
  );
  const action = api.git.action.useMutation({
    onSuccess: async (result) => {
      setNotice(result?.message ?? "Saved successfully.");
      setConfirm(null);
      await Promise.all([status.refetch(), repos.refetch()]);
      if (selection) await diff.refetch();
    },
    onError: async () => {
      await status.refetch();
      if (selection) await diff.refetch();
    },
  });
  const busy = action.isPending;
  const run = async (input: Omit<GitRequest, "path">) => {
    setNotice("");
    try {
      await action.mutateAsync({ id: machineId, path, ...input });
      return true;
    } catch {
      return false;
    }
  };
  const chooseRepo = (next: string) => {
    repoChosen.current.add(machineId);
    setRepoOptions(false);
    setPath(next);
    setPathDraft(next);
    setSelection(null);
    setNotice("");
    setConfirm(null);
    action.reset();
  };
  const data = status.data;
  useEffect(() => {
    if (
      machineId &&
      !repoChosen.current.has(machineId) &&
      path === "/workspace" &&
      data?.initialized === false &&
      repos.data?.length === 1
    ) {
      repoChosen.current.add(machineId);
      setPath(repos.data[0]!);
      setPathDraft(repos.data[0]!);
    }
  }, [machineId, path, data?.initialized, repos.data]);
  const files = data?.files ?? [];
  const staged = files.filter((f) => f.index !== " " && f.index !== "?");
  const unstaged = files.filter((f) => f.worktree !== " " || f.index === "?");
  const counts = {
    changes: files.length,
    checkpoints: data?.checkpoints?.length ?? 0,
    stashes: data?.stashes?.length ?? 0,
    history: data?.history?.length ?? 0,
  };
  const refresh = async () => {
    await status.refetch();
    if (selection) await diff.refetch();
  };

  return (
    <section className="mm-git-workspace" data-detail={!!selection}>
      <div className="mm-dashboard-heading">
        <div>
          <div className="mm-product-eyebrow">
            <GitBranch size={16} /> Code & recovery
          </div>
          <h1>
            <PageSwitcher title="Git workspace" />
          </h1>
          <p>Review the work. Keep a checkpoint. Move forward.</p>
        </div>
        <button
          className="mm-dashboard-button mm-dashboard-button-secondary"
          onClick={() => void refresh()}
          disabled={!enabled || status.isFetching || busy}
        >
          <RefreshCw size={15} />
          {status.isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {machines.isPending ? (
        <div className="mm-git-loading" role="status">
          Loading your machines…
        </div>
      ) : machines.error ? (
        <p role="alert" className="mm-git-error">
          {machines.error.message}
        </p>
      ) : !machines.data?.length ? (
        <div className="mm-git-empty">
          <GitBranch size={30} />
          <h2>Your code starts with a machine</h2>
          <p>
            Create a machine, then initialize a repository or choose one you
            already cloned.
          </p>
          <Link className="mm-dashboard-button" href="/dashboard">
            Go to machines <ChevronRight size={16} />
          </Link>
        </div>
      ) : (
        <>
          <MobileDisclosure
            title={
              data?.initialized
                ? (path.split("/").filter(Boolean).pop() ?? path)
                : "Choose repository"
            }
            description={machine?.name ?? "Select a machine"}
            open={repoOptions}
            onOpenChange={setRepoOptions}
          >
            <div className="mm-git-repo-picker">
              <label>
                Machine
                <select
                  aria-label="Git machine"
                  value={machineId}
                  onChange={(e) => {
                    setMachineId(e.target.value);
                    chooseRepo("/workspace");
                  }}
                  disabled={busy}
                >
                  {machines.data.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} · {m.status}
                    </option>
                  ))}
                </select>
              </label>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  chooseRepo(pathDraft);
                }}
              >
                <label>
                  Repository path
                  <input
                    aria-label="Repository path"
                    value={pathDraft}
                    onChange={(e) => setPathDraft(e.target.value)}
                    placeholder="/workspace/my-project"
                    list="mm-git-repos"
                    disabled={busy}
                    spellCheck={false}
                  />
                </label>
                <datalist id="mm-git-repos">
                  {repos.data?.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
                <button
                  className="mm-dashboard-button mm-dashboard-button-secondary"
                  disabled={busy || !enabled || !pathDraft.trim()}
                >
                  Open
                </button>
              </form>
            </div>
            {!!repos.data?.length && (
              <div
                className="mm-git-repo-shortcuts"
                aria-label="Detected repositories"
              >
                {repos.data.map((p) => (
                  <button
                    key={p}
                    onClick={() => chooseRepo(p)}
                    aria-pressed={path === p}
                    disabled={busy}
                  >
                    <GitBranch size={13} />
                    {p.replace("/workspace/", "")}
                  </button>
                ))}
              </div>
            )}
          </MobileDisclosure>
          {!enabled ? (
            <div className="mm-git-empty">
              <h2>Start this machine to use Git</h2>
              <p>
                Repository files and checkpoints live in the machine’s
                workspace.
              </p>
              <Link href="/dashboard" className="mm-dashboard-text-link">
                Manage machines <ChevronRight size={15} />
              </Link>
            </div>
          ) : status.isPending ? (
            <div className="mm-git-loading" role="status">
              <span />
              <span />
              <p>Reading repository…</p>
            </div>
          ) : status.error ? (
            <div className="mm-git-empty">
              <h2>Couldn’t open this repository</h2>
              <p role="alert">{status.error.message}</p>
              <button
                className="mm-dashboard-button mm-dashboard-button-secondary"
                onClick={() => void status.refetch()}
              >
                Try again
              </button>
            </div>
          ) : !data?.initialized ? (
            <div className="mm-git-empty">
              <GitBranch size={30} />
              <h2>A fresh place for your code</h2>
              <p>
                No Git repository at <code>{path}</code>. Initialize one here,
                or clone into this directory if it is empty.
              </p>
              <button
                className="mm-dashboard-button"
                disabled={busy}
                onClick={() => void run({ action: "init" })}
              >
                {busy ? "Working…" : "Initialize repository"}
              </button>
              <form
                className="mm-git-clone"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run({ action: "clone", url: remoteUrl });
                }}
              >
                <label htmlFor="clone-url">
                  Or clone an existing repository
                </label>
                <input
                  id="clone-url"
                  type="text"
                  value={remoteUrl}
                  onChange={(e) => setRemoteUrl(e.target.value)}
                  placeholder="https://github.com/you/project.git"
                />
                <button
                  className="mm-dashboard-button mm-dashboard-button-secondary"
                  disabled={busy || !remoteUrl.trim()}
                >
                  Clone repository
                </button>
              </form>
            </div>
          ) : (
            <>
              <div className="mm-git-toolbar">
                <div className="mm-git-branch">
                  <GitBranch size={16} />
                  <label className="sr-only" htmlFor="git-branch">
                    Current branch
                  </label>
                  <select
                    id="git-branch"
                    value={data.branch}
                    disabled={busy || !data.branches?.length}
                    onChange={(e) =>
                      void run({ action: "switch", message: e.target.value })
                    }
                  >
                    {!data.branches?.length && <option>{data.branch}</option>}
                    {data.branches?.map((b) => (
                      <option key={b}>{b}</option>
                    ))}
                    {data.branch === "Detached HEAD" && (
                      <option>Detached HEAD</option>
                    )}
                  </select>
                  <code>
                    {data.head ? data.head.slice(0, 7) : "No commits yet"}
                  </code>
                </div>
                <div className="mm-git-mobile-actions">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        aria-label="Repository actions"
                        className="mm-icon-control"
                      >
                        <MoreHorizontal size={20} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        disabled={busy || status.isFetching}
                        onSelect={() => void refresh()}
                      >
                        Refresh repository
                      </DropdownMenuItem>
                      {(["fetch", "pull", "push"] as const).map((a) => (
                        <DropdownMenuItem
                          key={a}
                          disabled={busy || !data.remotes?.length}
                          onSelect={() => void run({ action: a })}
                        >
                          {a.charAt(0).toUpperCase() + a.slice(1)}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="mm-git-sync">
                  <span>{data.upstream ?? "No upstream"}</span>
                  {(["fetch", "pull", "push"] as const).map((a) => (
                    <button
                      key={a}
                      className="mm-dashboard-button mm-dashboard-button-secondary"
                      disabled={busy || !data.remotes?.length}
                      onClick={() => void run({ action: a })}
                    >
                      {a.charAt(0).toUpperCase() + a.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mm-git-tabs" aria-label="Repository views">
                {(
                  [
                    { id: "changes", label: "Changes", icon: FileDiff },
                    {
                      id: "checkpoints",
                      label: "Checkpoints",
                      icon: ShieldCheck,
                    },
                    { id: "stashes", label: "Stashes", icon: Archive },
                    { id: "history", label: "History", icon: History },
                  ] as const
                ).map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    aria-pressed={view === id}
                    onClick={() => {
                      setView(id);
                      setSelection(null);
                      setConfirm(null);
                    }}
                  >
                    <Icon size={16} />
                    {label}
                    <span>{counts[id]}</span>
                  </button>
                ))}
              </div>
              <div className="mm-git-split" data-detail={!!selection}>
                <div className="mm-git-list-pane">
                  {view === "changes" && (
                    <>
                      <MobileDisclosure
                        title={`Commit ${staged.length} staged ${staged.length === 1 ? "file" : "files"}`}
                      >
                        <form
                          className="mm-git-compose"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void run({ action: "commit", message }).then(
                              (ok) => {
                                if (ok) setMessage("");
                              },
                            );
                          }}
                        >
                          <label htmlFor="git-commit-message">
                            Commit staged changes
                          </label>
                          <textarea
                            id="git-commit-message"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="What changed, and why?"
                            maxLength={500}
                            rows={2}
                          />
                          <button
                            className="mm-dashboard-button"
                            disabled={
                              busy ||
                              !staged.length ||
                              !message.trim() ||
                              files.some((f) => f.conflict)
                            }
                          >
                            <GitCommitHorizontal size={15} />
                            {busy ? "Working…" : "Commit staged"}
                          </button>
                        </form>
                      </MobileDisclosure>
                      {(
                        [
                          {
                            title: "Staged changes",
                            list: staged,
                            layer: "staged",
                          },
                          {
                            title: "Working changes",
                            list: unstaged,
                            layer: "working",
                          },
                        ] as const
                      ).map((group) => (
                        <div key={group.title} className="mm-git-file-group">
                          <h2>
                            {group.title}
                            <span>{group.list.length}</span>
                          </h2>
                          {group.list.length ? (
                            <ul>
                              {group.list.map((file) => {
                                const layer =
                                  file.index === "?"
                                    ? "untracked"
                                    : group.layer;
                                return (
                                  <ChangedFile
                                    key={file.path}
                                    file={file}
                                    layer={layer}
                                    busy={busy}
                                    selected={
                                      selection?.file === file.path &&
                                      selection.layer === layer
                                    }
                                    onSelect={() =>
                                      openSelection({
                                        file: file.path,
                                        layer,
                                        kind: "file",
                                        title: file.path,
                                      })
                                    }
                                    onStage={() =>
                                      void run({
                                        action:
                                          layer === "staged"
                                            ? "unstage"
                                            : "stage",
                                        file: file.path,
                                      })
                                    }
                                  />
                                );
                              })}
                            </ul>
                          ) : (
                            <p className="mm-git-hint">
                              {group.layer === "staged"
                                ? "Stage files with + to include them in your commit."
                                : "Working tree is clean."}
                            </p>
                          )}
                        </div>
                      ))}
                      {data.filesTruncated && (
                        <p className="mm-git-hint">
                          Showing the first 2,000 files. Use the machine console
                          for the full list.
                        </p>
                      )}
                    </>
                  )}
                  {view === "checkpoints" && (
                    <>
                      <MobileDisclosure title={"Create checkpoint"}>
                        <form
                          className="mm-git-compose"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void run({
                              action: "checkpoint",
                              message: checkpointName || "Agent checkpoint",
                              agent,
                            }).then((ok) => {
                              if (ok) setCheckpointName("");
                            });
                          }}
                        >
                          <label htmlFor="checkpoint-label">
                            Save a recovery point
                          </label>
                          <input
                            id="checkpoint-label"
                            value={checkpointName}
                            onChange={(e) => setCheckpointName(e.target.value)}
                            maxLength={120}
                            placeholder="Before the next agent run"
                          />
                          <label htmlFor="checkpoint-agent">Created for</label>
                          <select
                            id="checkpoint-agent"
                            value={agent}
                            onChange={(e) => setAgent(e.target.value)}
                          >
                            {[
                              "manual",
                              "codex",
                              "claude",
                              "cursor",
                              "other",
                            ].map((a) => (
                              <option key={a} value={a}>
                                {a === "manual" ? "Manual checkpoint" : a}
                              </option>
                            ))}
                          </select>
                          <button
                            className="mm-dashboard-button"
                            disabled={busy || files.some((f) => f.conflict)}
                          >
                            <ShieldCheck size={15} />
                            {busy ? "Saving…" : "Create checkpoint"}
                          </button>
                          <p>
                            Captures tracked and untracked files, preserving
                            your branch and staging area.
                          </p>
                        </form>
                      </MobileDisclosure>
                      <ul className="mm-git-timeline">
                        {data.checkpoints?.map((cp) => (
                          <li key={cp.ref}>
                            <button
                              className="mm-git-timeline-open"
                              data-selected={selection?.ref === cp.ref}
                              onClick={() =>
                                openSelection({
                                  ref: cp.ref,
                                  kind: "checkpoint",
                                  title: cp.label,
                                })
                              }
                            >
                              <ShieldCheck size={15} />
                              <span>
                                <strong>{cp.label}</strong>
                                <small>
                                  {cp.agent} ·{" "}
                                  <time dateTime={cp.createdAt}>
                                    {new Date(cp.createdAt).toLocaleString()}
                                  </time>
                                </small>
                              </span>
                            </button>
                            <button
                              className="mm-git-text-button"
                              disabled={busy}
                              onClick={() =>
                                setConfirm({
                                  action: "restore",
                                  ref: cp.ref,
                                  label: "Restore checkpoint",
                                  explanation: `Restore “${cp.label}”? Current files and staging will first be saved in a recovery checkpoint. Conversation history stays unchanged.`,
                                })
                              }
                            >
                              <RotateCcw size={13} />
                              Restore
                            </button>
                          </li>
                        ))}
                      </ul>
                      {!data.checkpoints?.length && (
                        <div className="mm-git-list-empty">
                          <ShieldCheck size={22} />
                          <h2>Room to experiment</h2>
                          <p>
                            Save your first checkpoint before asking an agent to
                            change your code.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                  {view === "stashes" && (
                    <>
                      <MobileDisclosure title={"Stash current changes"}>
                        <form
                          className="mm-git-compose"
                          onSubmit={(e) => {
                            e.preventDefault();
                            setConfirm({
                              action: "stash",
                              label: "Stash changes",
                              explanation:
                                "Save staged, working and untracked files to a Git stash, then clean the working tree? A recovery checkpoint is saved first. Ignored files stay in place.",
                            });
                          }}
                        >
                          <label htmlFor="stash-label">Put work aside</label>
                          <input
                            id="stash-label"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            maxLength={200}
                            placeholder="Work in progress"
                          />
                          <button
                            className="mm-dashboard-button"
                            disabled={busy || !files.length || !data.head}
                          >
                            <Archive size={15} />
                            Stash changes
                          </button>
                          <p>
                            Apply a stash later without removing it from the
                            list.
                          </p>
                        </form>
                      </MobileDisclosure>
                      <ul className="mm-git-timeline">
                        {data.stashes?.map((stash) => (
                          <li key={stash.sha}>
                            <button
                              className="mm-git-timeline-open"
                              data-selected={selection?.ref === stash.sha}
                              onClick={() =>
                                openSelection({
                                  ref: stash.sha,
                                  kind: "stash",
                                  title: stash.message,
                                })
                              }
                            >
                              <Archive size={15} />
                              <span>
                                <strong>{stash.message}</strong>
                                <small>
                                  {stash.ref} ·{" "}
                                  {new Date(stash.createdAt).toLocaleString()}
                                </small>
                              </span>
                            </button>
                            <div className="mm-git-row-actions">
                              <button
                                className="mm-git-text-button"
                                disabled={busy}
                                onClick={() =>
                                  setConfirm({
                                    action: "applyStash",
                                    ref: stash.sha,
                                    label: "Apply stash",
                                    explanation:
                                      "Apply this stash, including its staged changes? Your current work is checkpointed first. If Git reports a conflict, resolve it in the machine console.",
                                  })
                                }
                              >
                                Apply
                              </button>
                              <button
                                className="mm-git-text-button"
                                disabled={busy}
                                onClick={() =>
                                  setConfirm({
                                    action: "dropStash",
                                    ref: stash.sha,
                                    label: "Drop stash",
                                    explanation:
                                      "Remove this stash from the list? A recovery reference will retain its contents in this repository.",
                                  })
                                }
                              >
                                Drop
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                      {!data.stashes?.length && (
                        <div className="mm-git-list-empty">
                          <Archive size={22} />
                          <h2>No work set aside</h2>
                          <p>
                            Stash unfinished changes to get a clean working
                            tree.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                  {view === "history" && (
                    <>
                      <MobileDisclosure title={"Create a branch"}>
                        <form
                          className="mm-git-compose"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void run({
                              action: "branch",
                              message: branchName,
                            }).then((ok) => {
                              if (ok) setBranchName("");
                            });
                          }}
                        >
                          <label htmlFor="branch-name">Start a branch</label>
                          <input
                            id="branch-name"
                            value={branchName}
                            onChange={(e) => setBranchName(e.target.value)}
                            placeholder="feature/my-next-idea"
                            maxLength={120}
                          />
                          <button
                            className="mm-dashboard-button mm-dashboard-button-secondary"
                            disabled={
                              busy ||
                              !data.head ||
                              !branchName.trim() ||
                              !!files.length
                            }
                          >
                            <GitBranch size={15} />
                            Create & switch
                          </button>
                          <p>
                            Commit or stash changes before switching branches.
                          </p>
                        </form>
                      </MobileDisclosure>
                      <ul className="mm-git-history">
                        {data.history?.map((commit) => (
                          <li key={commit.sha}>
                            <GitCommitHorizontal size={15} />
                            <div>
                              <strong>{commit.message}</strong>
                              <p>
                                {commit.author} ·{" "}
                                {new Date(commit.createdAt).toLocaleString()}
                              </p>
                              <code>{commit.sha.slice(0, 7)}</code>
                            </div>
                          </li>
                        ))}
                      </ul>
                      {!data.history?.length && (
                        <p className="mm-git-hint">
                          Your first commit will appear here.
                        </p>
                      )}
                    </>
                  )}
                </div>
                <div className="mm-git-preview-pane">
                  <button
                    ref={backRef}
                    className="mm-git-back"
                    onClick={() => {
                      setSelection(null);
                      requestAnimationFrame(() =>
                        selectionSource.current?.focus({ preventScroll: true }),
                      );
                    }}
                  >
                    <ChevronLeft size={18} />
                    Back to {view}
                  </button>
                  <header>
                    <FileDiff size={15} />
                    <span>{selection?.title ?? "Change preview"}</span>
                    {selection?.layer && <small>{selection.layer}</small>}
                  </header>
                  {selection && selection.kind !== "file" && (
                    <div className="mm-git-detail-actions">
                      <button
                        className="mm-dashboard-button"
                        disabled={busy}
                        onClick={() =>
                          setConfirm({
                            action:
                              selection.kind === "checkpoint"
                                ? "restore"
                                : "applyStash",
                            ref: selection.ref,
                            label:
                              selection.kind === "checkpoint"
                                ? "Restore checkpoint"
                                : "Apply stash",
                            explanation:
                              "Your current files and staging will first be saved in a recovery checkpoint. Continue?",
                          })
                        }
                      >
                        {selection.kind === "checkpoint"
                          ? "Restore checkpoint"
                          : "Apply stash"}
                      </button>
                      {selection.kind === "stash" && (
                        <button
                          className="mm-dashboard-button mm-dashboard-button-secondary"
                          disabled={busy}
                          onClick={() =>
                            setConfirm({
                              action: "dropStash",
                              ref: selection.ref,
                              label: "Drop stash",
                              explanation:
                                "Remove this stash from the list? A recovery reference retains its contents.",
                            })
                          }
                        >
                          Drop stash
                        </button>
                      )}
                    </div>
                  )}
                  {!selection ? (
                    <div className="mm-git-preview-empty">
                      <FileDiff size={30} />
                      <h2>The details belong here</h2>
                      <p>
                        Select a file, checkpoint or stash to inspect its
                        changes.
                      </p>
                      <span>
                        <ShieldCheck size={14} /> Checkpoints leave your Git
                        history untouched
                      </span>
                    </div>
                  ) : diff.isPending ? (
                    <p className="mm-git-hint" role="status">
                      Loading diff…
                    </p>
                  ) : diff.error ? (
                    <p className="mm-git-error" role="alert">
                      {diff.error.message}
                    </p>
                  ) : (
                    <>
                      <pre
                        className="mm-git-diff"
                        tabIndex={0}
                        aria-label={`Diff for ${selection.title}`}
                      >
                        {diff.data?.text
                          ? diff.data.text.split("\n").map((line, i) => (
                              <span
                                key={i}
                                data-line={
                                  line.startsWith("+")
                                    ? "added"
                                    : line.startsWith("-")
                                      ? "removed"
                                      : line.startsWith("@@")
                                        ? "hunk"
                                        : "context"
                                }
                              >
                                {line}
                                {"\n"}
                              </span>
                            ))
                          : "No changes to show."}
                      </pre>
                      {diff.data?.truncated && (
                        <p className="mm-git-hint">
                          Preview limited to 250 KB. View the full diff in the
                          machine console.
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
              <MobileDisclosure title="Repository settings & recovery">
                {!!data.remotes?.length ? (
                  <div className="mm-git-remotes">
                    <GitBranch size={14} />
                    {data.remotes.map((remote) => (
                      <span key={remote.name}>
                        <strong>{remote.name}</strong>
                        <code>{remote.url}</code>
                      </span>
                    ))}
                  </div>
                ) : (
                  <form
                    className="mm-git-connect"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run({ action: "remote", url: remoteUrl });
                    }}
                  >
                    <label htmlFor="origin-url">Connect origin</label>
                    <input
                      id="origin-url"
                      value={remoteUrl}
                      onChange={(e) => setRemoteUrl(e.target.value)}
                      placeholder="https://github.com/you/project.git"
                    />
                    <button
                      className="mm-dashboard-button mm-dashboard-button-secondary"
                      disabled={busy || !remoteUrl.trim()}
                    >
                      Add remote
                    </button>
                  </form>
                )}
                <p className="mm-git-footnote">
                  Checkpoints and stashes live in this temporary machine. Push
                  commits to your remote before stopping or restarting it.
                </p>
              </MobileDisclosure>
            </>
          )}
          {confirm && (
            <Dialog
              open
              onOpenChange={(open) => {
                if (!open && !busy) setConfirm(null);
              }}
            >
              <DialogContent className="mm-git-confirm">
                <DialogTitle>{confirm.label}</DialogTitle>
                <DialogDescription>{confirm.explanation}</DialogDescription>
                <div>
                  <button
                    className="mm-dashboard-button mm-dashboard-button-secondary"
                    disabled={busy}
                    onClick={() => setConfirm(null)}
                  >
                    Cancel
                  </button>
                  <button
                    className="mm-dashboard-button"
                    disabled={busy}
                    onClick={() =>
                      void run({
                        action: confirm.action,
                        ref: confirm.ref,
                        message,
                      })
                    }
                  >
                    {busy ? "Working…" : confirm.label}
                  </button>
                </div>
              </DialogContent>
            </Dialog>
          )}
          {action.error && (
            <p className="mm-git-error" role="alert">
              {action.error.message}
            </p>
          )}
          {notice && (
            <p className="mm-git-notice" role="status">
              <Check size={15} />
              {notice}
            </p>
          )}
        </>
      )}
    </section>
  );
}
