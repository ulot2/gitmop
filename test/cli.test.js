import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

// Builds a repo with a fake remote and four branches:
// feat-merged (merged into main), feat-gone (remote branch deleted),
// feat-active (unmerged, recent), feat-old (unmerged, 100 days old).
function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), "gitmop-"));
  const remote = join(root, "remote.git");
  const work = join(root, "work");
  execFileSync("git", ["init", "--bare", "-b", "main", remote]);
  execFileSync("git", ["init", "-b", "main", work]);
  const git = (...args) => execFileSync("git", args, { cwd: work, encoding: "utf8" }).trim();
  const commit = (msg, env = {}) => {
    writeFileSync(join(work, msg), msg);
    git("add", ".");
    execFileSync("git", ["commit", "-q", "-m", msg], { cwd: work, env: { ...process.env, ...env } });
  };
  git("config", "user.name", "test");
  git("config", "user.email", "test@example.com");
  commit("first");
  git("remote", "add", "origin", remote);
  git("push", "-q", "-u", "origin", "main");
  git("remote", "set-head", "origin", "main");

  git("checkout", "-q", "-b", "feat-merged");
  commit("merged-work");
  git("checkout", "-q", "main");
  git("merge", "-q", "feat-merged");
  git("push", "-q", "origin", "main");

  git("checkout", "-q", "-b", "feat-gone");
  commit("gone-work");
  git("push", "-q", "-u", "origin", "feat-gone");
  git("push", "-q", "origin", "--delete", "feat-gone");

  git("checkout", "-q", "-b", "feat-active", "main");
  commit("active-work");

  git("checkout", "-q", "-b", "feat-old", "main");
  const old = new Date(Date.now() - 100 * 86400 * 1000).toISOString();
  commit("old-work", { GIT_AUTHOR_DATE: old, GIT_COMMITTER_DATE: old });

  git("checkout", "-q", "main");
  return { work, git };
}

const run = (cwd, ...args) => execFileSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8" }).trim();

test("list shows merged and gone branches only", () => {
  const { work } = makeRepo();
  assert.equal(run(work, "list"), "feat-gone\tgone\nfeat-merged\tmerged");
});

test("clean deletes them and keeps the rest", () => {
  const { work, git } = makeRepo();
  const out = run(work, "clean");
  assert.match(out, /^Deleted feat-gone \(gone, was [0-9a-f]+\)$/m);
  assert.match(out, /^Deleted feat-merged \(merged, was [0-9a-f]+\)$/m);
  assert.equal(git("branch", "--format=%(refname:short)"), "feat-active\nfeat-old\nmain");
  assert.equal(run(work, "list"), "No stale branches.");
});

test("old shows branches older than --days", () => {
  const { work } = makeRepo();
  assert.match(run(work, "old", "--days", "50"), /^feat-old\t\d{4}-\d{2}-\d{2}$/);
  assert.equal(run(work, "old", "--days", "200"), "No branches older than 200 days.");
});

test("bad input exits with a message", () => {
  const { work } = makeRepo();
  for (const args of [["nope"], ["old", "--days", "x"], ["--bogus"]]) {
    assert.throws(() => run(work, ...args), (e) => e.status === 1 && /^gitmop: /.test(e.stderr));
  }
});
