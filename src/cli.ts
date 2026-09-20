#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

const HELP = `gitmop - find and delete stale local git branches

Usage: gitmop <command> [options]

Commands:
  list    Show stale branches: merged into the base branch, or remote branch gone
  clean   Delete the branches that "list" shows
  old     Show branches with no commit in the last N days

Options:
  --base <name>   Base branch (default: origin/HEAD, then main, then master)
  --days <n>      Age limit for "old", in days (default: 30)
  -h, --help      Show this help
  -v, --version   Show the version

"list" and "clean" run "git fetch --prune" first, so deleted remote branches
show as gone. "clean" never deletes the current branch or the base branch.
Each deleted branch prints its last commit hash, so "git branch <name> <hash>"
restores it.`;

type Branch = { name: string; current: boolean; merged: boolean; gone: boolean; date: number };

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function findBase(): string {
  try {
    return git("symbolic-ref", "--short", "refs/remotes/origin/HEAD");
  } catch {}
  for (const name of ["main", "master"]) {
    try {
      git("rev-parse", "--verify", "--quiet", `refs/heads/${name}`);
      return name;
    } catch {}
  }
  throw new Error("Cannot find the base branch. Use --base <name>.");
}

function fetchPrune(): void {
  try {
    git("fetch", "--prune", "--quiet");
  } catch {
    console.error("gitmop: fetch failed, gone branches may be missing from this list.");
  }
}

function loadBranches(base: string): Branch[] {
  const merged = new Set(git("branch", "--merged", base, "--format=%(refname:short)").split("\n"));
  const format = "%(refname:short)\t%(HEAD)\t%(upstream:track)\t%(committerdate:unix)";
  return git("for-each-ref", "refs/heads", `--format=${format}`)
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name, head, track, date] = line.split("\t");
      return { name, current: head === "*", merged: merged.has(name), gone: track === "[gone]", date: Number(date) };
    });
}

const reason = (b: Branch): string => (b.merged ? "merged" : "gone");

function main(): void {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      base: { type: "string" },
      days: { type: "string", default: "30" },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
  });
  const command = positionals[0];
  if (values.version) {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    console.log(pkg.version);
    return;
  }
  if (values.help || !command) {
    console.log(HELP);
    return;
  }
  if (!["list", "clean", "old"].includes(command)) {
    throw new Error(`Unknown command "${command}". Run "gitmop --help".`);
  }
  const days = Number(values.days);
  if (!Number.isInteger(days) || days < 0) throw new Error("--days must be a whole number.");

  if (command !== "old") fetchPrune();
  const base = values.base ?? findBase();
  const baseName = base.replace(/^origin\//, "");
  const branches = loadBranches(base).filter((b) => !b.current && b.name !== baseName);

  if (command === "old") {
    const cutoff = Date.now() / 1000 - days * 86400;
    const found = branches.filter((b) => b.date < cutoff).sort((a, b) => a.date - b.date);
    if (found.length === 0) console.log(`No branches older than ${days} days.`);
    for (const b of found) console.log(`${b.name}\t${new Date(b.date * 1000).toISOString().slice(0, 10)}`);
    return;
  }

  const found = branches.filter((b) => b.merged || b.gone);
  if (found.length === 0) console.log("No stale branches.");
  for (const b of found) {
    if (command === "list") {
      console.log(`${b.name}\t${reason(b)}`);
    } else {
      const hash = git("rev-parse", "--short", b.name);
      git("branch", b.merged ? "-d" : "-D", b.name);
      console.log(`Deleted ${b.name} (${reason(b)}, was ${hash})`);
    }
  }
}

try {
  main();
} catch (err) {
  const e = err as { stderr?: string; message: string };
  console.error(`gitmop: ${(e.stderr || e.message).trim()}`);
  process.exit(1);
}
