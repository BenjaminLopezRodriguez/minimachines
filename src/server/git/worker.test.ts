import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { GitRequest, GitStatus, GitDiff, Checkpoint } from "../../lib/git";
import { gitWorker } from "./worker";

// Deliberately uses real Git in the sandbox, including its real staging area.
function fixture() {
  const root = mkdtempSync("/workspace/mm-git-test-");
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  git("init", "-b", "main");
  git("config", "user.name", "Test Agent");
  git("config", "user.email", "test@example.com");
  const write = (name: string, content: string | Buffer) =>
    writeFileSync(join(root, name), content);
  write("tracked.txt", "original\n");
  write(".gitignore", "ignored.txt\n");
  git("add", ".");
  git("commit", "-m", "Initial commit");
  function run<T = { message: string }>(
    input: Partial<GitRequest> & Pick<GitRequest, "action">,
  ): T {
    const response = JSON.parse(
      execFileSync(
        "python3",
        ["-c", gitWorker, JSON.stringify({ path: root, ...input })],
        { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
      ),
    ) as { ok: boolean; data: T; error?: string };
    if (!response.ok) throw new Error(response.error);
    return response.data;
  }
  return {
    root,
    git,
    write,
    run,
    close: () => rmSync(root, { recursive: true, force: true }),
  };
}

void test("checkpoint preserves HEAD and index, restores tracked and untracked files, and keeps a recovery snapshot", () => {
  const f = fixture();
  try {
    f.write("tracked.txt", "staged\n");
    f.git("add", "tracked.txt");
    f.write("tracked.txt", "working\n");
    f.write("new file.txt", "untracked\n");
    f.write("ignored.txt", "private\n");
    const beforeHead = f.git("rev-parse", "HEAD"),
      beforeIndex = f.git("write-tree");
    const cp = f.run<Checkpoint>({
      action: "checkpoint",
      message: "Before edits",
      agent: "codex",
    });
    assert.equal(f.git("rev-parse", "HEAD"), beforeHead);
    assert.equal(f.git("write-tree"), beforeIndex);
    assert.equal(
      f.git("ls-tree", "-r", "--name-only", cp.ref).includes("ignored.txt"),
      false,
    );
    f.write("tracked.txt", "later\n");
    f.write("new file.txt", "changed untracked\n");
    f.write("later.txt", "recover me\n");
    f.run({ action: "restore", ref: cp.ref });
    assert.equal(
      readFileSync(join(f.root, "tracked.txt"), "utf8"),
      "working\n",
    );
    assert.equal(
      readFileSync(join(f.root, "new file.txt"), "utf8"),
      "untracked\n",
    );
    assert.equal(f.git("show", ":tracked.txt"), "staged");
    assert.equal(f.git("write-tree"), beforeIndex);
    assert.equal(f.git("rev-parse", "HEAD"), beforeHead);
    assert.equal(
      readFileSync(join(f.root, "ignored.txt"), "utf8"),
      "private\n",
    );
    const status = f.run<GitStatus>({ action: "status" });
    assert.equal(
      status.files?.some((file) => file.path === "later.txt"),
      false,
    );
    assert.equal(status.checkpoints?.length, 2);
    const recovery = status.checkpoints?.find((c) => c.ref !== cp.ref);
    assert.equal(f.git("show", `${recovery!.ref}:later.txt`), "recover me");
  } finally {
    f.close();
  }
});

void test("native stash round-trip preserves staged changes and untracked files, and apply retains the stash", () => {
  const f = fixture();
  try {
    f.write("tracked.txt", "staged change\n");
    f.git("add", "tracked.txt");
    f.write("extra.txt", "new\n");
    f.run({ action: "stash", message: "Put aside" });
    let status = f.run<GitStatus>({ action: "status" });
    assert.equal(status.files?.length, 0);
    assert.equal(status.stashes?.length, 1);
    const sha = status.stashes[0]!.sha;
    assert.match(
      f.run<GitDiff>({ action: "stashDiff", ref: sha }).text,
      /extra.txt/,
    );
    f.run({ action: "applyStash", ref: sha });
    assert.equal(f.git("show", ":tracked.txt"), "staged change");
    assert.equal(readFileSync(join(f.root, "extra.txt"), "utf8"), "new\n");
    status = f.run<GitStatus>({ action: "status" });
    assert.equal(status.stashes?.length, 1);
    f.run({ action: "dropStash", ref: sha });
    assert.equal(f.run<GitStatus>({ action: "status" }).stashes?.length, 0);
    assert.ok(
      f
        .git(
          "for-each-ref",
          "--format=%(objectname)",
          "refs/minimachines/dropped-stashes/",
        )
        .includes(sha),
    );
    assert.throws(
      () => f.run({ action: "applyStash", ref: sha }),
      /no longer exists/,
    );
  } finally {
    f.close();
  }
});

void test("file changes handle renamed paths, literal pathspecs, binary files and split staging", () => {
  const f = fixture();
  try {
    f.git("mv", "tracked.txt", "renamed file.txt");
    f.write(":(glob)*.txt", "literal\n");
    f.write("binary.bin", Buffer.from([0, 1, 2, 3]));
    const status = f.run<GitStatus>({ action: "status" });
    assert.equal(
      status.files?.find((file) => file.path === "renamed file.txt")
        ?.originalPath,
      "tracked.txt",
    );
    f.run({ action: "stage", file: ":(glob)*.txt" });
    assert.match(f.git("diff", "--cached", "--name-only"), /glob/);
    assert.match(
      f.run<GitDiff>({ action: "diff", file: "binary.bin", layer: "untracked" })
        .text,
      /Binary/,
    );
    f.run({ action: "unstage", file: ":(glob)*.txt" });
    assert.equal(
      f.git("diff", "--cached", "--name-only").includes("glob"),
      false,
    );
  } finally {
    f.close();
  }
});

void test("rejects workspace escapes, unsafe references and restore after HEAD changes", () => {
  const f = fixture();
  try {
    assert.throws(
      () => f.run({ action: "status", path: "/tmp" }),
      /inside \/workspace/,
    );
    assert.throws(
      () => f.run({ action: "stage", file: "../outside" }),
      /Invalid/,
    );
    assert.throws(() => f.run({ action: "restore", ref: "HEAD" }), /Invalid/);
    const cp = f.run<Checkpoint>({ action: "checkpoint" });
    f.write("tracked.txt", "new commit\n");
    f.git("add", ".");
    f.git("commit", "-m", "Advance HEAD");
    assert.throws(
      () => f.run({ action: "restore", ref: cp.ref }),
      /HEAD has changed/,
    );
    mkdirSync(join(f.root, "nested"));
    symlinkSync("/tmp", join(f.root, "escape"));
    assert.throws(
      () => f.run({ action: "status", path: join(f.root, "escape") }),
      /inside \/workspace/,
    );
  } finally {
    f.close();
  }
});

void test("initial repository supports checkpoint, stage, unstage, first commit and branch switching", () => {
  const root = mkdtempSync("/workspace/mm-git-test-");
  try {
    const run = (action: string, extra: Record<string, string> = {}) =>
      JSON.parse(
        execFileSync(
          "python3",
          ["-c", gitWorker, JSON.stringify({ path: root, action, ...extra })],
          { encoding: "utf8" },
        ),
      ) as { ok: boolean; data: GitStatus; error?: string };
    assert.equal(run("status").data.initialized, false);
    assert.equal(run("init").data.initialized, true);
    writeFileSync(join(root, "a.txt"), "hello\n");
    assert.equal(run("checkpoint").ok, true);
    assert.equal(run("stage", { file: "a.txt" }).ok, true);
    assert.equal(run("unstage", { file: "a.txt" }).ok, true);
    assert.equal(run("stage", { file: "a.txt" }).ok, true);
    execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: root,
    });
    assert.equal(run("commit", { message: "Initial commit" }).ok, true);
    assert.equal(run("branch", { message: "feature/test" }).ok, true);
    assert.equal(run("switch", { message: "main" }).ok, true);
    assert.equal(run("status").data.branch, "main");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
