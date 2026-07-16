import { describe, it, expect, afterEach } from "bun:test";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { renderIterationValidation, renderFinalValidation } from "../src/features/phase-control/get-phase-prompt";
import { buildChangePaths } from "../src/entities/change/paths";
import { recordCommitLogStart, recordIterationBoundary } from "../src/entities/change/flow-state";
import { DEFAULT_CONFIG } from "../src/entities/config/config";
import { Prompt } from "../src/entities/phase/types";

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

const ITERATION_PLAN = `# Implementation Plan

## Iteration 2: Second Iteration [~]

### Goal

Second iteration goal.
`;

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

describe("get-phase-prompt wires commit-log diff base into validation inventories", () => {
  it("renderIterationValidation includes a file committed after the recorded iteration boundary", () => {
    const repo = makeGitRepo(); dirs.push(repo);
    const changeDir = path.join(repo, ".phasedev", "changes", "sample-change");
    fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });
    fs.writeFileSync(path.join(changeDir, "iteration_plan.md"), ITERATION_PLAN, "utf-8");

    fs.writeFileSync(path.join(repo, "base.txt"), "0");
    const iteration1Sha = gitCommitAll(repo, "iteration 1 boundary");

    const paths = buildChangePaths(changeDir);
    recordIterationBoundary(paths.statePath, 1, iteration1Sha);

    fs.writeFileSync(path.join(repo, "iteration2.ts"), "iteration 2 work");
    gitCommitAll(repo, "iteration 2 committed");

    const result = renderIterationValidation(repo, DEFAULT_CONFIG, paths, 2);
    const prompt = typeof result === "string" ? result : (result as Prompt).prompt;

    expect(prompt).toContain("## Controller Observed Changed Files");
    expect(prompt).toContain("iteration2.ts");
  });

  it("renderFinalValidation includes a file committed after the recorded log start", () => {
    const repo = makeGitRepo(); dirs.push(repo);
    const changeDir = path.join(repo, ".phasedev", "changes", "sample-change");
    fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });
    fs.writeFileSync(path.join(changeDir, "iteration_plan.md"), ITERATION_PLAN, "utf-8");

    fs.writeFileSync(path.join(repo, "base.txt"), "0");
    const startSha = gitCommitAll(repo, "start boundary");

    const paths = buildChangePaths(changeDir);
    recordCommitLogStart(paths.statePath, startSha);

    fs.writeFileSync(path.join(repo, "final.ts"), "final work");
    gitCommitAll(repo, "final commit");

    const prompt = renderFinalValidation(repo, DEFAULT_CONFIG, paths);

    expect(prompt).toContain("## Controller Observed Changed Files");
    expect(prompt).toContain("final.ts");
  });
});
