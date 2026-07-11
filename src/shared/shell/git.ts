import { spawnSync } from "child_process";

export interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  failureReason: string | null;
  status: number | null;
  errorMessage: string | null;
}

const SHA_PATTERN = /^[0-9a-f]{40}$/;

export function runGit(projectPath: string, args: string[]): GitResult {
  const result = spawnSync("git", ["-C", projectPath, ...args], { encoding: "utf-8" });
  const ok = !result.error && result.status === 0;
  const errorMessage = result.error?.message ?? null;
  const failureReason = ok
    ? null
    : result.error?.message || result.stderr.trim() || `git exited with ${result.status}`;
  return {
    ok,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    failureReason,
    status: result.status ?? null,
    errorMessage
  };
}

export function gitHeadSha(projectPath: string): string | null {
  const result = runGit(projectPath, ["rev-parse", "HEAD"]);
  if (!result.ok) return null;
  const sha = result.stdout.trim();
  return SHA_PATTERN.test(sha) ? sha : null;
}

export function isGitRepo(projectPath: string): boolean {
  const result = runGit(projectPath, ["rev-parse", "--is-inside-work-tree"]);
  return result.ok && result.stdout.trim() === "true";
}
