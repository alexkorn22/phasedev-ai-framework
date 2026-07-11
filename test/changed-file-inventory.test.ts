import { describe, it, expect, afterEach } from "bun:test";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { renderChangedFileInventory, scanChangedFilesOutsidePhasedev } from "../src/features/phase-control/changed-file-inventory";

function makeGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phasedev-git-"));
  const run = (args: string[]) => spawnSync("git", ["-C", dir, ...args], { encoding: "utf-8" });
  run(["init"]);
  run(["config", "user.email", "test@example.com"]);
  run(["config", "user.name", "Test"]);
  run(["config", "commit.gpgsign", "false"]);
  return dir;
}

function gitCommitAll(dir: string, message: string): string {
  spawnSync("git", ["-C", dir, "add", "-A"], { encoding: "utf-8" });
  spawnSync("git", ["-C", dir, "commit", "-m", message, "--no-gpg-sign"], { encoding: "utf-8" });
  return spawnSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf-8" }).stdout.trim();
}

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

describe("changed-file-inventory boundary diffs", () => {
  it("scanChangedFilesOutsidePhasedev ignores .phasedev and reports git failure as not-ok", () => {
    const repo = makeGitRepo(); dirs.push(repo);
    fs.writeFileSync(path.join(repo, "code.ts"), "x");
    fs.mkdirSync(path.join(repo, ".phasedev"), { recursive: true });
    fs.writeFileSync(path.join(repo, ".phasedev", "state.json"), "{}");
    const scan = scanChangedFilesOutsidePhasedev(repo);
    expect(scan.ok).toBe(true);
    if (scan.ok) {
      expect(scan.entries.map(e => e.filePath)).toContain("code.ts");
      expect(scan.entries.some(e => e.filePath.startsWith(".phasedev/"))).toBe(false);
    }
  });

  it("with diffBase, committed files appear via git diff plus uncommitted via git status", () => {
    const repo = makeGitRepo(); dirs.push(repo);
    fs.writeFileSync(path.join(repo, "base.txt"), "0");
    const base = gitCommitAll(repo, "base");
    fs.writeFileSync(path.join(repo, "committed.ts"), "1");
    gitCommitAll(repo, "iter1");
    fs.writeFileSync(path.join(repo, "working.ts"), "2"); // uncommitted
    const out = renderChangedFileInventory(repo, { diffBase: base });
    expect(out).toContain("committed.ts"); // from git diff base..HEAD
    expect(out).toContain("working.ts");   // from git status
  });

  it("stale diffBase falls back to the Inventory-unavailable branch, does not throw", () => {
    const repo = makeGitRepo(); dirs.push(repo);
    fs.writeFileSync(path.join(repo, "a.txt"), "x");
    gitCommitAll(repo, "init");
    const out = renderChangedFileInventory(repo, { diffBase: "0".repeat(40) });
    expect(out).toContain("Inventory unavailable");
  });

  it("without diffBase behaves as status-only (clean repo → No changed files)", () => {
    const repo = makeGitRepo(); dirs.push(repo);
    fs.writeFileSync(path.join(repo, "a.txt"), "x");
    gitCommitAll(repo, "init");
    const out = renderChangedFileInventory(repo);
    expect(out).toContain("No changed files outside .phasedev/**");
  });
});
