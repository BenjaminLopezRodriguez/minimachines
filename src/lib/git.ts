import { z } from "zod";

export const gitRequestSchema = z.object({
  path: z.string().min(1).max(512).default("/workspace"),
  action: z.enum([
    "discover",
    "status",
    "init",
    "clone",
    "remote",
    "diff",
    "stage",
    "unstage",
    "commit",
    "checkpoint",
    "checkpointDiff",
    "restore",
    "stash",
    "stashDiff",
    "applyStash",
    "dropStash",
    "branch",
    "switch",
    "fetch",
    "pull",
    "push",
  ]),
  url: z.string().max(2000).optional(),
  file: z.string().min(1).max(1024).optional(),
  layer: z.enum(["staged", "working", "untracked"]).optional(),
  ref: z.string().min(1).max(256).optional(),
  message: z.string().max(500).optional(),
  agent: z.string().max(64).optional(),
});
export type GitRequest = z.infer<typeof gitRequestSchema>;
export type GitFile = {
  path: string;
  originalPath?: string | null;
  index: string;
  worktree: string;
  conflict: boolean;
};
export type Checkpoint = {
  ref: string;
  sha: string;
  label: string;
  agent: string;
  createdAt: string;
  baseHead: string;
  indexTree: string;
};
export type GitStash = {
  sha: string;
  ref: string;
  createdAt: string;
  message: string;
};
export type GitStatus = {
  initialized: boolean;
  path: string;
  branch?: string;
  head?: string;
  upstream?: string | null;
  files?: GitFile[];
  filesTruncated?: boolean;
  checkpoints?: Checkpoint[];
  stashes?: GitStash[];
  history?: {
    sha: string;
    createdAt: string;
    author: string;
    message: string;
  }[];
  remotes?: { name: string; url: string }[];
  branches?: string[];
};
export type GitDiff = { text: string; truncated: boolean };
