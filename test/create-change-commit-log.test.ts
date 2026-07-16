import { describe, it, expect, afterEach } from "bun:test";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createChange } from "../src/features/phase-control/create-change";
import { readCommitLog } from "../src/entities/change/flow-state";
import { buildChangePaths } from "../src/entities/change/paths";

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

describe("create-change commit-log start", () => {
  it("records start = HEAD in a git repo", () => {
    const repo = makeGitRepo(); dirs.push(repo);
    fs.writeFileSync(path.join(repo, "a.txt"), "x");
    const head = gitCommitAll(repo, "init");
    const res = createChange(repo, "My Change");
    expect(res.ok).toBe(true);
    expect(readCommitLog(buildChangePaths(res.changeDir!).statePath)?.start).toBe(head);
  });

  it("writes no commit-log in a non-git project", () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), "phasedev-plain-")); dirs.push(plain);
    const res = createChange(plain, "My Change");
    expect(res.ok).toBe(true);
    expect(readCommitLog(buildChangePaths(res.changeDir!).statePath)).toBeNull();
  });

  it("records start = HEAD in a git repo for --quick changes too", () => {
    const repo = makeGitRepo(); dirs.push(repo);
    fs.writeFileSync(path.join(repo, "a.txt"), "x");
    const head = gitCommitAll(repo, "init");
    const res = createChange(repo, "My Quick Change", undefined, true);
    expect(res.ok).toBe(true);
    expect(readCommitLog(buildChangePaths(res.changeDir!).statePath)?.start).toBe(head);
  });
});
