import { describe, it, expect, afterEach } from "bun:test";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { runGit, gitHeadSha, isGitRepo } from "../src/shared/shell/git";

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

describe("shared/shell/git", () => {
  it("isGitRepo is true inside a repo, false outside", () => {
    const repo = makeGitRepo(); dirs.push(repo);
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), "phasedev-plain-")); dirs.push(plain);
    expect(isGitRepo(repo)).toBe(true);
    expect(isGitRepo(plain)).toBe(false);
  });

  it("gitHeadSha returns a 40-hex SHA after a commit, null with no commits or no repo", () => {
    const repo = makeGitRepo(); dirs.push(repo);
    expect(gitHeadSha(repo)).toBeNull();
    fs.writeFileSync(path.join(repo, "a.txt"), "x");
    const sha = gitCommitAll(repo, "init");
    expect(gitHeadSha(repo)).toBe(sha);
    expect(gitHeadSha(repo)).toMatch(/^[0-9a-f]{40}$/);
  });

  it("runGit reports failure with a reason on a bad revision", () => {
    const repo = makeGitRepo(); dirs.push(repo);
    fs.writeFileSync(path.join(repo, "a.txt"), "x");
    gitCommitAll(repo, "init");
    const res = runGit(repo, ["diff", "--name-status", "0".repeat(40), "HEAD"]);
    expect(res.ok).toBe(false);
    expect(res.failureReason).toBeTruthy();
  });
});
