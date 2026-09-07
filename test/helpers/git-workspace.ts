import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

/**
 * Initializes a git repository when needed and merges commitLog.start into the
 * target change's state.json without overwriting phase lock or other fields.
 */
export function initGitWorkspaceWithCommitLog(projectPath: string, changeDir: string): void {
  const run = (args: string[]) => spawnSync("git", ["-C", projectPath, ...args], { encoding: "utf-8" });
  if (!fs.existsSync(path.join(projectPath, ".git"))) {
    run(["init"]);
    run(["config", "user.email", "test@example.com"]);
    run(["config", "user.name", "Test"]);
    run(["config", "commit.gpgsign", "false"]);
  }
  run(["add", "-A"]);
  run(["commit", "-m", "test git workspace base", "--no-gpg-sign", "--allow-empty"]);
  const start = run(["rev-parse", "HEAD"]).stdout.trim();
  const statePath = path.join(changeDir, "state.json");
  if (!fs.existsSync(statePath)) {
    return;
  }
  const state = JSON.parse(fs.readFileSync(statePath, "utf-8")) as Record<string, unknown>;
  const existing = state.commitLog as { start?: unknown; iterations?: Record<string, string> } | undefined;
  if (typeof existing?.start === "string" && /^[0-9a-f]{40}$/.test(existing.start)) {
    return;
  }
  state.commitLog = {
    start,
    iterations: existing?.iterations ?? {}
  };
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
}
