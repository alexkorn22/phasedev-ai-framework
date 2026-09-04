import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { spawnSync } from "child_process";
import { quickAdvance } from "../src/features/phase-control/quick-advance";
import { DEFAULT_CONFIG } from "../src/entities/config/config";
import { recordCommitLogStart } from "../src/entities/change/flow-state";

function makeGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pd-quick-prot-"));
  const env = { ...process.env, GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.com", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.com" };
  const run = (args: string[]) => spawnSync("git", ["-C", dir, ...args], { encoding: "utf-8", env });
  run(["init"]);
  run(["config", "user.email", "test@example.com"]);
  run(["config", "user.name", "Test"]);
  run(["config", "commit.gpgsign", "false"]);
  return dir;
}

function gitCommitAll(dir: string, message: string): string {
  const env = { ...process.env, GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.com", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.com" };
  spawnSync("git", ["-C", dir, "add", "-A"], { encoding: "utf-8", env });
  spawnSync("git", ["-C", dir, "commit", "-m", message, "--no-gpg-sign"], { encoding: "utf-8", env });
  return spawnSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf-8", env }).stdout.trim();
}

describe("quickAdvance protectedPaths enforcement", () => {
  it("blocks advancing out of quick_implementation when protected paths are touched without marker", () => {
    const repo = makeGitRepo();
    fs.writeFileSync(path.join(repo, "package.json"), "{}");
    const baselineHead = gitCommitAll(repo, "initial commit");

    const changeDir = path.join(repo, ".phasedev", "changes", "q1");
    fs.mkdirSync(changeDir, { recursive: true });
    const statePath = path.join(changeDir, "state.json");
    fs.writeFileSync(
      statePath,
      JSON.stringify({ activePhase: "quick_implementation", activeIteration: null, repairCycleCount: 0, flowMode: "quick" }, null, 2)
    );
    recordCommitLogStart(statePath, baselineHead);

    const worklogPath = path.join(changeDir, "worklog.md");
    fs.writeFileSync(worklogPath, "# Worklog\n\n## Task\nTask\n\n## Plan\nPlan\n");

    // Modify a protected file
    const githubDir = path.join(repo, ".github", "workflows");
    fs.mkdirSync(githubDir, { recursive: true });
    fs.writeFileSync(path.join(githubDir, "ci.yml"), "name: CI");
    gitCommitAll(repo, "modify ci");

    const config = {
      ...DEFAULT_CONFIG,
      requireIterationCommit: true,
      protectedPaths: [".github/**"]
    };

    const state = { activePhase: "quick_implementation" as const, activeIteration: null, repairCycleCount: 0, flowMode: "quick" as const };
    const blocked = quickAdvance(repo, config, state, "q1");
    expect(blocked.ok).toBe(false);
    expect(blocked.message).toContain("Protected paths violated");

    // Now add [allows-protected-paths] to worklog.md
    fs.writeFileSync(worklogPath, "# Worklog\n\n## Task\nTask\n\n## Plan [allows-protected-paths]\nAllow CI edit\n");
    const allowed = quickAdvance(repo, config, state, "q1");
    expect(allowed.ok).toBe(true);
    expect(allowed.newState?.activePhase).toBe("quick_validation");
  });
});
