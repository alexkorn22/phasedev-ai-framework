# Iteration Commit Checkpoint + Per-Iteration Change Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PhaseDev require a clean git tree when leaving iteration/final validation, record per-change commit boundaries in `.commit-log.json`, and feed boundary diffs into the validator's changed-file inventory so each validator sees only its own iteration's delta.

**Architecture:** The agent commits per phase contract; the controller reads git (read-only) and refuses to advance out of a *passing* validation when the tree is dirty outside `.phasedev/**`. A new controller-only `.commit-log.json` (class of `.findings-baseline.json`) stores `start` and per-iteration boundary SHAs. `changed-file-inventory` unions `git diff <base> HEAD` with `git status`, keeping the existing status-only path intact when no base is supplied.

**Tech Stack:** TypeScript, Bun (`bun test`), Node `child_process` (`spawnSync git`), `yaml`. No new dependencies.

## Global Constraints

- Invoke the `dev-core` skill before writing/editing any code (project Hard Gate). Every delegated coding task must include this instruction.
- Frozen contracts (CLAUDE.md "Behavior To Preserve"): **do not** change `state.json` shape; `config.yaml` key is **additive**; controller **reads** git only, never mutates.
- Dependency direction: entrypoints → features → entities/shared; entities → shared only; `shared` imports nothing project-specific. `src/shared/shell/git.ts` imports only `child_process`.
- Exported functions have explicit return types. No `any`. Guard clauses over nested `if/else`.
- SHA format everywhere: 40-char lowercase hex, `/^[0-9a-f]{40}$/`.
- Commit-log JSON writes go through `writeFileAtomic` (atomic, controller-only, dot-prefixed file, travels into archive).
- Focused tests first, then full suite: `bun test <files>` then `bun test` and `npm run typecheck`.
- Spec: `docs/superpowers/specs/2026-07-11-iteration-commit-checkpoint-design.md` is authoritative.

---

## Shared test helper (used by git-touching tasks)

Several test files need a throwaway git repo. Repeat this helper at the top of each test file that needs it (do not import across test files — keep each self-contained):

```ts
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

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
```

---

## Task 1: Shared git helper

**Files:**
- Create: `src/shared/shell/git.ts`
- Test: `test/git.test.ts`

**Interfaces:**
- Produces:
  - `interface GitResult { ok: boolean; stdout: string; stderr: string; failureReason: string | null }`
  - `function runGit(projectPath: string, args: string[]): GitResult`
  - `function gitHeadSha(projectPath: string): string | null`
  - `function isGitRepo(projectPath: string): boolean`

- [ ] **Step 1: Write the failing test**

Create `test/git.test.ts` (include the shared `makeGitRepo`/`gitCommitAll` helper above):

```ts
import { describe, it, expect, afterEach } from "bun:test";
import * as fs from "fs";
import { runGit, gitHeadSha, isGitRepo } from "../src/shared/shell/git";
// + makeGitRepo, gitCommitAll from the shared helper above

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

describe("shared/shell/git", () => {
  it("isGitRepo is true inside a repo, false outside", () => {
    const repo = makeGitRepo(); dirs.push(repo);
    const plain = fs.mkdtempSync(require("path").join(require("os").tmpdir(), "phasedev-plain-")); dirs.push(plain);
    expect(isGitRepo(repo)).toBe(true);
    expect(isGitRepo(plain)).toBe(false);
  });

  it("gitHeadSha returns a 40-hex SHA after a commit, null with no commits or no repo", () => {
    const repo = makeGitRepo(); dirs.push(repo);
    expect(gitHeadSha(repo)).toBeNull();
    fs.writeFileSync(require("path").join(repo, "a.txt"), "x");
    const sha = gitCommitAll(repo, "init");
    expect(gitHeadSha(repo)).toBe(sha);
    expect(gitHeadSha(repo)).toMatch(/^[0-9a-f]{40}$/);
  });

  it("runGit reports failure with a reason on a bad revision", () => {
    const repo = makeGitRepo(); dirs.push(repo);
    fs.writeFileSync(require("path").join(repo, "a.txt"), "x");
    gitCommitAll(repo, "init");
    const res = runGit(repo, ["diff", "--name-status", "0".repeat(40), "HEAD"]);
    expect(res.ok).toBe(false);
    expect(res.failureReason).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/git.test.ts`
Expected: FAIL (cannot resolve `../src/shared/shell/git`).

- [ ] **Step 3: Write minimal implementation**

Create `src/shared/shell/git.ts`:

```ts
import { spawnSync } from "child_process";

export interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  failureReason: string | null;
}

const SHA_PATTERN = /^[0-9a-f]{40}$/;

export function runGit(projectPath: string, args: string[]): GitResult {
  const result = spawnSync("git", ["-C", projectPath, ...args], { encoding: "utf-8" });
  const ok = !result.error && result.status === 0;
  const failureReason = ok
    ? null
    : result.error?.message || result.stderr.trim() || `git exited with ${result.status}`;
  return { ok, stdout: result.stdout ?? "", stderr: result.stderr ?? "", failureReason };
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/git.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/shell/git.ts test/git.test.ts
git commit -m "feat: add read-only shared git helper"
```

---

## Task 2: `.commit-log.json` entity + `commitLogPath`

**Files:**
- Create: `src/entities/change/commit-log.ts`
- Modify: `src/entities/change/paths.ts:5-27` (add `commitLogPath` to `ChangePaths` and `buildChangePaths`)
- Test: `test/commit-log.test.ts`

**Interfaces:**
- Consumes: `writeFileAtomic` from `../../shared/fs/write-file-atomic`.
- Produces:
  - `interface CommitLog { start: string | null; iterations: Record<string, string> }`
  - `readCommitLog(commitLogPath: string): CommitLog | null`
  - `writeCommitLog(commitLogPath: string, log: CommitLog): void`
  - `recordCommitLogStart(commitLogPath: string, sha: string): void`
  - `recordIterationBoundary(commitLogPath: string, iterationId: number, sha: string): void`
  - `iterationDiffBase(log: CommitLog, iterationId: number): string | null`
  - `ChangePaths.commitLogPath: string`

- [ ] **Step 1: Write the failing test**

Create `test/commit-log.test.ts`:

```ts
import { describe, it, expect, afterEach } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  readCommitLog, writeCommitLog, recordCommitLogStart,
  recordIterationBoundary, iterationDiffBase
} from "../src/entities/change/commit-log";
import { buildChangePaths } from "../src/entities/change/paths";

const A = "a".repeat(40), B = "b".repeat(40), C = "c".repeat(40), D = "d".repeat(40);
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });
function tmp(): string { const d = fs.mkdtempSync(path.join(os.tmpdir(), "clog-")); dirs.push(d); return d; }

describe("entities/change/commit-log", () => {
  it("buildChangePaths exposes .commit-log.json", () => {
    expect(buildChangePaths("/x/change").commitLogPath).toBe("/x/change/.commit-log.json");
  });

  it("read returns null when missing, round-trips a written log", () => {
    const p = path.join(tmp(), ".commit-log.json");
    expect(readCommitLog(p)).toBeNull();
    writeCommitLog(p, { start: A, iterations: { "1": B } });
    expect(readCommitLog(p)).toEqual({ start: A, iterations: { "1": B } });
  });

  it("read returns null on malformed JSON or bad SHA shape", () => {
    const p = path.join(tmp(), ".commit-log.json");
    fs.writeFileSync(p, "{not json");
    expect(readCommitLog(p)).toBeNull();
    fs.writeFileSync(p, JSON.stringify({ start: "short", iterations: {} }));
    expect(readCommitLog(p)).toBeNull();
  });

  it("recordCommitLogStart sets start once (idempotent) and preserves iterations", () => {
    const p = path.join(tmp(), ".commit-log.json");
    recordCommitLogStart(p, A);
    recordIterationBoundary(p, 1, B);
    recordCommitLogStart(p, C); // must NOT overwrite start
    expect(readCommitLog(p)).toEqual({ start: A, iterations: { "1": B } });
  });

  it("recordIterationBoundary overwrites the same iteration (repair cycle) and preserves start", () => {
    const p = path.join(tmp(), ".commit-log.json");
    recordCommitLogStart(p, A);
    recordIterationBoundary(p, 1, B);
    recordIterationBoundary(p, 2, C);
    recordIterationBoundary(p, 2, D); // repair re-validation overwrites boundary 2
    expect(readCommitLog(p)).toEqual({ start: A, iterations: { "1": B, "2": D } });
  });

  it("iterationDiffBase: N=1 → start, N>1 → iterations[N-1], missing → null", () => {
    const log: any = { start: A, iterations: { "1": B, "2": C } };
    expect(iterationDiffBase(log, 1)).toBe(A);
    expect(iterationDiffBase(log, 2)).toBe(B);
    expect(iterationDiffBase(log, 3)).toBe(C);
    expect(iterationDiffBase({ start: null, iterations: {} }, 1)).toBeNull();
    expect(iterationDiffBase({ start: A, iterations: {} }, 5)).toBe(A);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/commit-log.test.ts`
Expected: FAIL (module not found / `commitLogPath` undefined).

- [ ] **Step 3a: Add `commitLogPath` to paths**

In `src/entities/change/paths.ts`, add to the `ChangePaths` interface (after `findingsBaselinePath: string;`):

```ts
  commitLogPath: string;
```

and to the `buildChangePaths` return object (after the `findingsBaselinePath` line):

```ts
    commitLogPath: path.join(changeDir, ".commit-log.json")
```

- [ ] **Step 3b: Write the commit-log module**

Create `src/entities/change/commit-log.ts`:

```ts
import * as fs from "fs";
import { writeFileAtomic } from "../../shared/fs/write-file-atomic";

export interface CommitLog {
  start: string | null;
  iterations: Record<string, string>;
}

const SHA_PATTERN = /^[0-9a-f]{40}$/;

function isValidLog(value: unknown): value is CommitLog {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const { start, iterations } = record;
  if (start !== null && !(typeof start === "string" && SHA_PATTERN.test(start))) return false;
  if (typeof iterations !== "object" || iterations === null || Array.isArray(iterations)) return false;
  for (const sha of Object.values(iterations as Record<string, unknown>)) {
    if (typeof sha !== "string" || !SHA_PATTERN.test(sha)) return false;
  }
  return true;
}

export function readCommitLog(commitLogPath: string): CommitLog | null {
  if (!fs.existsSync(commitLogPath)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(commitLogPath, "utf-8"));
  } catch {
    return null;
  }
  return isValidLog(parsed) ? { start: parsed.start, iterations: { ...parsed.iterations } } : null;
}

export function writeCommitLog(commitLogPath: string, log: CommitLog): void {
  writeFileAtomic(commitLogPath, `${JSON.stringify(log, null, 2)}\n`);
}

export function recordCommitLogStart(commitLogPath: string, sha: string): void {
  const log = readCommitLog(commitLogPath) ?? { start: null, iterations: {} };
  if (log.start !== null) return;
  writeCommitLog(commitLogPath, { start: sha, iterations: log.iterations });
}

export function recordIterationBoundary(commitLogPath: string, iterationId: number, sha: string): void {
  const log = readCommitLog(commitLogPath) ?? { start: null, iterations: {} };
  writeCommitLog(commitLogPath, {
    start: log.start,
    iterations: { ...log.iterations, [String(iterationId)]: sha }
  });
}

export function iterationDiffBase(log: CommitLog, iterationId: number): string | null {
  if (iterationId <= 1) return log.start;
  return log.iterations[String(iterationId - 1)] ?? log.start;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/commit-log.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/entities/change/commit-log.ts src/entities/change/paths.ts test/commit-log.test.ts
git commit -m "feat: add .commit-log.json boundary bookmark entity"
```

---

## Task 3: `requireIterationCommit` config key

**Files:**
- Modify: `src/entities/config/config.ts:18-40` (`Config`, `DEFAULT_CONFIG`) and `:296-303` (`parseConfig` return)
- Modify: `config.yaml:49-56` (root flags block)
- Test: `test/config.test.ts` (append cases)

**Interfaces:**
- Produces: `Config.requireIterationCommit: boolean` (default `true`).
- Consumes: existing `readBoolean(value, fallback, key)`.

- [ ] **Step 1: Write the failing test**

Append to `test/config.test.ts`:

```ts
import { parseConfig, DEFAULT_CONFIG } from "../src/entities/config/config";

describe("requireIterationCommit config key", () => {
  it("defaults to true when absent", () => {
    expect(DEFAULT_CONFIG.requireIterationCommit).toBe(true);
    expect(parseConfig("phases: {}\n").requireIterationCommit).toBe(true);
  });
  it("reads an explicit false", () => {
    expect(parseConfig("requireIterationCommit: false\n").requireIterationCommit).toBe(false);
  });
  it("rejects a non-boolean value", () => {
    expect(() => parseConfig("requireIterationCommit: yes-please\n")).toThrow(/requireIterationCommit/);
  });
});
```

(If `test/config.test.ts` already imports `parseConfig`/`DEFAULT_CONFIG`, reuse those imports instead of re-importing.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/config.test.ts`
Expected: FAIL (`requireIterationCommit` is `undefined`; the non-boolean case does not throw).

- [ ] **Step 3: Implement**

In `src/entities/config/config.ts`, add to the `Config` interface (after `blockingSeverity: BlockingSeverity;`):

```ts
  requireIterationCommit: boolean;
```

Add to `DEFAULT_CONFIG` (after `blockingSeverity: "must_fix"`):

```ts
  requireIterationCommit: true
```

Add to the `parseConfig` return object (after the `blockingSeverity:` line):

```ts
    requireIterationCommit: readBoolean(root.requireIterationCommit, DEFAULT_CONFIG.requireIterationCommit, "requireIterationCommit")
```

In `config.yaml`, add to the root flags block (after `blockingSeverity: must_fix` at line 56):

```yaml

# Require a clean git tree (changes outside .phasedev/** committed) when leaving
# iteration/final validation. Silently skipped when the project is not a git repo.
requireIterationCommit: true
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/entities/config/config.ts config.yaml test/config.test.ts
git commit -m "feat: add requireIterationCommit config key (default true)"
```

---

## Task 4: Boundary-diff inventory + change scan

**Files:**
- Modify: `src/features/phase-control/changed-file-inventory.ts` (whole file: switch to `runGit`, add `scanChangedFilesOutsidePhasedev`, add `diffBase`)
- Test: `test/changed-file-inventory.test.ts`

**Interfaces:**
- Consumes: `runGit` from `../../shared/shell/git`.
- Produces:
  - `interface ChangeScanEntry { status: string; filePath: string }`
  - `type ChangeScan = { ok: true; entries: ChangeScanEntry[] } | { ok: false; reason: string }`
  - `scanChangedFilesOutsidePhasedev(projectPath: string): ChangeScan`
  - `ChangedFileInventoryOptions.diffBase?: string`
  - `renderChangedFileInventory(projectPath, options)` unchanged signature shape, new behaviour.

- [ ] **Step 1: Write the failing test**

Create `test/changed-file-inventory.test.ts` (include the shared git helper). This exercises the new diff-union and stale-SHA fallback in a real repo:

```ts
import { describe, it, expect, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { renderChangedFileInventory, scanChangedFilesOutsidePhasedev } from "../src/features/phase-control/changed-file-inventory";
// + makeGitRepo, gitCommitAll shared helper

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/changed-file-inventory.test.ts`
Expected: FAIL (`scanChangedFilesOutsidePhasedev` not exported; `diffBase` ignored).

- [ ] **Step 3: Implement**

In `src/features/phase-control/changed-file-inventory.ts`:

Replace the top import:

```ts
import { runGit } from "../../shared/shell/git";
import { Iteration } from "../../entities/iteration-plan/types";
import { escapeMarkdownTableCell, isMarkdownTableSeparatorRow, splitMarkdownTableRow } from "../../shared/markdown/table";
```

Extend the options interface and add the scan types/function (place near the top, after `normalizeStatusPath`/`parseGitStatusLine`):

```ts
export interface ChangedFileInventoryOptions {
  phase?: Iteration;
  diffBase?: string;
}

export interface ChangeScanEntry { status: string; filePath: string; }
export type ChangeScan =
  | { ok: true; entries: ChangeScanEntry[] }
  | { ok: false; reason: string };

export function scanChangedFilesOutsidePhasedev(projectPath: string): ChangeScan {
  const result = runGit(projectPath, ["status", "--short", "--untracked-files=all", "--", "."]);
  if (!result.ok) {
    return { ok: false, reason: result.failureReason ?? "git status failed" };
  }
  const entries = result.stdout
    .split(/\r?\n/)
    .map(parseGitStatusLine)
    .filter((entry): entry is ChangeScanEntry => entry !== null)
    .filter(entry => !entry.filePath.startsWith(".phasedev/"));
  return { ok: true, entries };
}

function parseGitDiffLine(line: string): ChangeScanEntry | null {
  if (line.trim().length === 0) return null;
  const parts = line.split("\t");
  if (parts.length < 2) return null;
  return {
    status: parts[0].trim(),
    filePath: normalizeStatusPath(parts[parts.length - 1])
  };
}
```

Rewrite the body of `renderChangedFileInventory` so it builds `rows` from the scan (+ optional diff), then keeps the existing empty/surface/render logic verbatim:

```ts
const UNAVAILABLE_BODY =
  "Build the changed-file inventory from read-only repository, filesystem, or manifest/output evidence before deciding the verdict; treat this as blocking only if the phase scope cannot be verified or the evidence is contradictory.";

function unavailableInventory(reason: string): string {
  return [
    "## Controller Observed Changed Files",
    "",
    `Inventory unavailable: ${reason}. ${UNAVAILABLE_BODY}`
  ].join("\n");
}

export function renderChangedFileInventory(projectPath: string, options: ChangedFileInventoryOptions = {}): string {
  const scan = scanChangedFilesOutsidePhasedev(projectPath);
  if (!scan.ok) {
    return unavailableInventory(scan.reason);
  }

  let rows: ChangeScanEntry[] = scan.entries;

  if (options.diffBase) {
    const diff = runGit(projectPath, ["diff", "--name-status", options.diffBase, "HEAD", "--", "."]);
    if (!diff.ok) {
      return unavailableInventory(diff.failureReason ?? "git diff failed");
    }
    const merged = new Map<string, ChangeScanEntry>();
    for (const entry of diff.stdout.split(/\r?\n/).map(parseGitDiffLine)) {
      if (entry && !entry.filePath.startsWith(".phasedev/")) merged.set(entry.filePath, entry);
    }
    for (const entry of scan.entries) merged.set(entry.filePath, entry); // working tree overrides
    rows = [...merged.values()];
  }

  if (rows.length === 0) {
    return [
      "## Controller Observed Changed Files",
      "",
      "No changed files outside .phasedev/** were observed by the controller. This is not automatically blocking: verify whether the current phase expected surfaces are generated, ignored, already committed, or otherwise provable through read-only filesystem or manifest/output evidence before deciding the verdict."
    ].join("\n");
  }

  if (options.phase) {
    const surfacePatterns = phaseExpectedSurfacePatterns(options.phase);
    const matchedRows = surfacePatterns.length > 0
      ? rows.filter(entry => pathMatchesSurface(entry.filePath, surfacePatterns))
      : rows;
    const outsideCount = rows.length - matchedRows.length;

    if (matchedRows.length === 0) {
      return [
        "## Controller Observed Changed Files",
        "",
        `No changed files outside .phasedev/** matched the current phase Expected Change Surface. ${outsideCount} changed file(s) outside the current phase surface were hidden from this phase-scoped inventory; use read-only repository evidence only if scope evidence is contradictory.`
      ].join("\n");
    }

    return [
      "## Controller Observed Changed Files",
      "",
      "| Status | Path |",
      "|---|---|",
      ...matchedRows.map(entry => `| ${escapeMarkdownTableCell(entry.status)} | ${escapeMarkdownTableCell(entry.filePath)} |`),
      ...(outsideCount > 0 ? [
        "",
        `${outsideCount} changed file(s) outside the current phase Expected Change Surface were hidden from this phase-scoped inventory.`
      ] : [])
    ].join("\n");
  }

  return [
    "## Controller Observed Changed Files",
    "",
    "| Status | Path |",
    "|---|---|",
    ...rows.map(entry => `| ${escapeMarkdownTableCell(entry.status)} | ${escapeMarkdownTableCell(entry.filePath)} |`)
  ].join("\n");
}
```

Note: `parseGitStatusLine` now returns `ChangeScanEntry | null` (same shape as before — `{ status, filePath }`); keep its implementation, only the annotated return type name changes if you choose to annotate it. Leave `phaseExpectedSurfacePatterns`, `pathMatchesSurface`, `globToRegExp`, `escapeRegExp`, `normalizeStatusPath` unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/changed-file-inventory.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify no regression in existing inventory assertions**

Run: `bun test test/controller.test.ts test/cli.test.ts`
Expected: PASS (existing non-git assertions still hit "Inventory unavailable"/"Controller Observed Changed Files").

- [ ] **Step 6: Commit**

```bash
git add src/features/phase-control/changed-file-inventory.ts test/changed-file-inventory.test.ts
git commit -m "feat: union boundary git diff into changed-file inventory"
```

---

## Task 5: Commit blockers

**Files:**
- Modify: `src/features/phase-control/prompt-blockers.ts` (append two builders)
- Test: `test/prompt-blockers.test.ts` (create; there is no existing unit test for this file)

**Interfaces:**
- Consumes: `prompt`, `advanceCommand`, `Prompt`.
- Produces:
  - `iterationCommitBlocker(iterationId: number, iterationName: string, changeSlug: string, changeName?: string): Prompt`
  - `finalCommitBlocker(changeSlug: string, changeName?: string): Prompt`

- [ ] **Step 1: Write the failing test**

Create `test/prompt-blockers.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { iterationCommitBlocker, finalCommitBlocker } from "../src/features/phase-control/prompt-blockers";

describe("commit blockers", () => {
  it("iterationCommitBlocker names the iteration, suggests a message, points at advance and the opt-out", () => {
    const p = iterationCommitBlocker(2, "Wire the gate", "my-change", "my-change");
    expect(p.blocked).toBe(true);
    expect(p.reason).toBe("Iteration commit required");
    expect(p.phase).toBe("iteration_validation");
    expect(p.prompt).toContain("Iteration 2 validated");
    expect(p.prompt).toContain("phasedev(my-change): iteration 2 — Wire the gate");
    expect(p.prompt).toContain("phasedev advance --change 'my-change'");
    expect(p.prompt).toContain("requireIterationCommit: false");
  });

  it("iterationCommitBlocker uses a bare advance command when changeName is undefined", () => {
    const p = iterationCommitBlocker(1, "N", "slug", undefined);
    expect(p.prompt).toContain("phasedev advance");
    expect(p.prompt).not.toContain("--change");
  });

  it("finalCommitBlocker blocks before archive with a suggested final message", () => {
    const p = finalCommitBlocker("my-change", "my-change");
    expect(p.blocked).toBe(true);
    expect(p.reason).toBe("Commit required before archive");
    expect(p.phase).toBe("final_validation");
    expect(p.prompt).toContain("phasedev(my-change): final validation");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/prompt-blockers.test.ts`
Expected: FAIL (builders not exported).

- [ ] **Step 3: Implement**

Append to `src/features/phase-control/prompt-blockers.ts`:

```ts
export function iterationCommitBlocker(
  iterationId: number,
  iterationName: string,
  changeSlug: string,
  changeName?: string
): Prompt {
  return prompt("next", "iteration_validation", [
    "================================================================================",
    `[FLOW CONTROLLER] BLOCKED: Iteration ${iterationId} validated. Commit the iteration before advancing.`,
    "The controller found uncommitted changes outside `.phasedev/**`.",
    "Commit the iteration's code changes together with the updated `.phasedev` artifacts.",
    `- Suggested commit message: phasedev(${changeSlug}): iteration ${iterationId} — ${iterationName}`,
    `After committing, run '${advanceCommand(changeName)}' again.`,
    "To opt out of this gate, set 'requireIterationCommit: false' in config.yaml.",
    "================================================================================"
  ].join("\n"), true, "Iteration commit required");
}

export function finalCommitBlocker(changeSlug: string, changeName?: string): Prompt {
  return prompt("next", "final_validation", [
    "================================================================================",
    "[FLOW CONTROLLER] BLOCKED: Final validation passed. Commit before archive.",
    "The controller found uncommitted changes outside `.phasedev/**`.",
    "Commit the remaining code changes together with the updated `.phasedev` artifacts.",
    `- Suggested commit message: phasedev(${changeSlug}): final validation`,
    `After committing, run '${advanceCommand(changeName)}' again.`,
    "To opt out of this gate, set 'requireIterationCommit: false' in config.yaml.",
    "================================================================================"
  ].join("\n"), true, "Commit required before archive");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/prompt-blockers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/phase-control/prompt-blockers.ts test/prompt-blockers.test.ts
git commit -m "feat: add iteration/final commit gate blockers"
```

---

## Task 6: Advance-flow gate + boundary/start recording

**Files:**
- Modify: `src/features/phase-control/advance-flow.ts` (imports; `archive_ready` branch `:362-388`; section E around `:398-475`)
- Test: `test/advance-commit-gate.test.ts`

**Interfaces:**
- Consumes: `scanChangedFilesOutsidePhasedev` (Task 4), `gitHeadSha` (Task 1), `recordIterationBoundary`/`recordCommitLogStart` (Task 2), `iterationCommitBlocker`/`finalCommitBlocker` (Task 5), `parsePlan` (already imported), `config.requireIterationCommit` (Task 3).
- Produces: no new exports; behavioural change to `advanceFlow`.

**Design notes for the implementer (verified against the code):**
- The "passing exit" from `iteration_validation` is exactly the condition already used to mark `[x]` in `applyStateSideEffects` (`advance-flow.ts:179-193`): `route.kind === "final_validation"` OR (`route.kind === "iteration"` AND `route.activeIteration.id !== state.activeIteration`). Reuse it verbatim.
- The gate must `refuse` (return early, no mutation) BEFORE `applyStateSideEffects`/`saveFlowState`.
- The boundary record must happen AFTER `saveFlowState` succeeds, keyed by `state.activeIteration`, so repair re-validation overwrites `iterations[N]`.
- `changeDir` is in scope in `advanceFlow` (line ~241); `path` is imported; use `path.basename(changeDir)` as `changeSlug`.

- [ ] **Step 1: Write the failing test**

Create `test/advance-commit-gate.test.ts`. Use the shared git helper and the real flow helpers. Build a change up to an iteration-validation exit, then assert gate + boundary. Sketch (fill exact flow setup from existing `test/e2e-flow.test.ts` / `test/controller.test.ts` patterns for creating a change and driving `advanceFlow`):

```ts
import { describe, it, expect, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { advanceFlow } from "../src/features/phase-control/advance-flow";
import { readCommitLog } from "../src/entities/change/commit-log";
import { buildChangePaths } from "../src/entities/change/paths";
import { DEFAULT_CONFIG } from "../src/entities/config/config";
// + makeGitRepo, gitCommitAll shared helper
// + a local helper driveToIterationValidationExit(projectPath) that runs the flow
//   (create-change → … → iteration_validation with a passing verdict) mirroring
//   the existing e2e-flow.test.ts setup, leaving state at iteration_validation(1)
//   with the route resolving forward.

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

describe("advance commit gate", () => {
  it("refuses to advance out of a passing iteration_validation when the tree is dirty", () => {
    const repo = makeGitRepo(); dirs.push(repo);
    const changeDir = driveToIterationValidationExit(repo); // dirty working tree (iteration code uncommitted)
    fs.writeFileSync(path.join(repo, "leftover.ts"), "x"); // uncommitted outside .phasedev
    const res = advanceFlow(repo, { ...DEFAULT_CONFIG, requireIterationCommit: true });
    expect(res.ok).toBe(false);
    expect(res.message).toContain("Commit the iteration before advancing");
  });

  it("advances and records the boundary SHA when the tree is clean", () => {
    const repo = makeGitRepo(); dirs.push(repo);
    const changeDir = driveToIterationValidationExit(repo);
    const head = gitCommitAll(repo, "iter1"); // commit everything
    const res = advanceFlow(repo, { ...DEFAULT_CONFIG, requireIterationCommit: true });
    expect(res.ok).toBe(true);
    expect(readCommitLog(buildChangePaths(changeDir).commitLogPath)?.iterations["1"]).toBe(head);
  });

  it("does not gate when requireIterationCommit is false (still records boundary)", () => {
    const repo = makeGitRepo(); dirs.push(repo);
    const changeDir = driveToIterationValidationExit(repo);
    // dirty tree left on purpose
    const res = advanceFlow(repo, { ...DEFAULT_CONFIG, requireIterationCommit: false });
    expect(res.ok).toBe(true);
  });

  it("does not gate in a non-git project", () => {
    const plain = fs.mkdtempSync(path.join(require("os").tmpdir(), "phasedev-plain-")); dirs.push(plain);
    const changeDir = driveToIterationValidationExit(plain);
    const res = advanceFlow(plain, { ...DEFAULT_CONFIG, requireIterationCommit: true });
    expect(res.ok).toBe(true);
  });

  it("overwrites iterations[N] on a repair-cycle re-validation of iteration N", () => {
    // Drive iteration 1 through a repair cycle back to iteration_validation(1),
    // commit the repair, advance; the recorded iterations["1"] must equal the repair HEAD.
    // (Build on the repair-cycle setup already exercised in controller.test.ts.)
  });
});
```

If assembling `driveToIterationValidationExit` from scratch is heavy, instead extend the existing repair/iteration flow test in `test/controller.test.ts` where a change is already driven to `iteration_validation`, wrapping that project path in a git repo. Keep the four gate cases (dirty / clean+boundary / disabled / non-git) and the repair-overwrite case.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/advance-commit-gate.test.ts`
Expected: FAIL (advance does not gate; `.commit-log.json` not written).

- [ ] **Step 3a: Add imports**

In `src/features/phase-control/advance-flow.ts` add:

```ts
import { scanChangedFilesOutsidePhasedev } from "./changed-file-inventory";
import { gitHeadSha } from "../../shared/shell/git";
import { recordCommitLogStart, recordIterationBoundary } from "../../entities/change/commit-log";
import { iterationCommitBlocker, finalCommitBlocker } from "./prompt-blockers";
```

(`invalidPrdBlocker … archiveReadinessBlocker` are already imported from `./prompt-blockers`; add the two new names to that import list rather than a second import statement.)

- [ ] **Step 3b: Add the gate helper**

Add near the top of the module (after the `ok`/`refuse`/`done` helpers):

```ts
function commitGateBlocks(projectPath: string, config: Config): boolean {
  if (!config.requireIterationCommit) return false;
  const scan = scanChangedFilesOutsidePhasedev(projectPath);
  if (!scan.ok) return false; // non-git project or git error → skip (fail-open)
  return scan.entries.length > 0;
}
```

- [ ] **Step 3c: Gate the final_validation → archive transition**

In the `archive_ready` branch (`advance-flow.ts:362-388`), after the `runArchiveStage` guard and before `fs.rmSync(paths.findingsBaselinePath …)`:

```ts
    if (commitGateBlocks(projectPath, config)) {
      return refuse(finalCommitBlocker(path.basename(changeDir), changeName).prompt);
    }
```

- [ ] **Step 3d: Gate the iteration_validation forward transition + record boundaries**

In section (E), after the `maxIterations` guard (`advance-flow.ts:428-434`) and before `const sideEffect = applyStateSideEffects(...)`:

```ts
  const leavingIterationValidation =
    state.activePhase === "iteration_validation" && state.activeIteration !== null;
  const iterationValidationPassed =
    leavingIterationValidation &&
    (route.kind === "final_validation" ||
      (route.kind === "iteration" && route.activeIteration.id !== state.activeIteration));

  if (iterationValidationPassed && commitGateBlocks(projectPath, config)) {
    const iter = parsePlan(paths.iterationPlanPath).find(p => p.id === state.activeIteration);
    return refuse(
      iterationCommitBlocker(
        state.activeIteration as number,
        iter?.name ?? "",
        path.basename(changeDir),
        changeName
      ).prompt
    );
  }
```

Then, immediately AFTER `saveFlowState(projectPath, finalNextState, changeName);` (`advance-flow.ts:475`), add the recording side-effects:

```ts
  if (finalNextState.activePhase === "implementation") {
    const head = gitHeadSha(projectPath);
    if (head) recordCommitLogStart(paths.commitLogPath, head);
  }
  if (iterationValidationPassed) {
    const head = gitHeadSha(projectPath);
    if (head) recordIterationBoundary(paths.commitLogPath, state.activeIteration as number, head);
  }
```

(`finalNextState.activePhase === "implementation"` covers "repo appeared later"; `recordCommitLogStart` is idempotent so re-entry is a no-op.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/advance-commit-gate.test.ts`
Expected: PASS.

- [ ] **Step 5: Cross-module regression check**

Run: `bun test test/controller.test.ts test/e2e-flow.test.ts test/cli.test.ts`
Expected: PASS (non-git flow tests unaffected — gate is skipped, boundary recording is a no-op without a repo).

- [ ] **Step 6: Commit**

```bash
git add src/features/phase-control/advance-flow.ts test/advance-commit-gate.test.ts
git commit -m "feat: gate validation exit on clean tree and record commit boundaries"
```

---

## Task 7: Record `start` at create-change

**Files:**
- Modify: `src/features/phase-control/create-change.ts` (imports; after `writeFileAtomic(statePath, …)` at `:84`)
- Test: `test/create-change-commit-log.test.ts`

**Interfaces:**
- Consumes: `gitHeadSha` (Task 1), `recordCommitLogStart`/`buildChangePaths.commitLogPath` (Task 2).

- [ ] **Step 1: Write the failing test**

Create `test/create-change-commit-log.test.ts` (include the shared git helper):

```ts
import { describe, it, expect, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { createChange } from "../src/features/phase-control/create-change";
import { readCommitLog } from "../src/entities/change/commit-log";
import { buildChangePaths } from "../src/entities/change/paths";
// + makeGitRepo, gitCommitAll shared helper

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

describe("create-change commit-log start", () => {
  it("records start = HEAD in a git repo", () => {
    const repo = makeGitRepo(); dirs.push(repo);
    fs.writeFileSync(path.join(repo, "a.txt"), "x");
    const head = gitCommitAll(repo, "init");
    const res = createChange(repo, "My Change");
    expect(res.ok).toBe(true);
    expect(readCommitLog(buildChangePaths(res.changeDir!).commitLogPath)?.start).toBe(head);
  });

  it("writes no commit-log in a non-git project", () => {
    const plain = fs.mkdtempSync(path.join(require("os").tmpdir(), "phasedev-plain-")); dirs.push(plain);
    const res = createChange(plain, "My Change");
    expect(res.ok).toBe(true);
    expect(fs.existsSync(buildChangePaths(res.changeDir!).commitLogPath)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/create-change-commit-log.test.ts`
Expected: FAIL (no commit-log written).

- [ ] **Step 3: Implement**

In `src/features/phase-control/create-change.ts` add imports:

```ts
import { gitHeadSha } from "../../shared/shell/git";
import { recordCommitLogStart } from "../../entities/change/commit-log";
import { buildChangePaths } from "../../entities/change/paths";
```

After `writeFileAtomic(statePath, JSON.stringify(initialState, null, 2) + "\n");` (line 84), add:

```ts
  const head = gitHeadSha(projectPath);
  if (head) {
    recordCommitLogStart(buildChangePaths(changeDir).commitLogPath, head);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/create-change-commit-log.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/phase-control/create-change.ts test/create-change-commit-log.test.ts
git commit -m "feat: record commit-log start SHA at create-change"
```

---

## Task 8: Wire diff base into validation prompts

**Files:**
- Modify: `src/features/phase-control/get-phase-prompt.ts` (imports; `renderIterationValidation` `:185-213`; `renderFinalValidation` `:215-227`)
- Test: `test/get-phase-prompt-diffbase.test.ts`

**Interfaces:**
- Consumes: `readCommitLog`, `iterationDiffBase` (Task 2); `renderChangedFileInventory` `diffBase` option (Task 4). `paths.commitLogPath` already available via `buildChangePaths`.

- [ ] **Step 1: Write the failing test**

Create `test/get-phase-prompt-diffbase.test.ts`. Assert that when a commit-log exists, the iteration-validation inventory reflects a committed file from the boundary diff (not just git status). Use the shared git helper plus the existing "drive a change to iteration_validation" setup (as in Task 6). Sketch:

```ts
import { describe, it, expect, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { getPhasePrompt } from "../src/features/phase-control/get-phase-prompt";
import { DEFAULT_CONFIG } from "../src/entities/config/config";
// + makeGitRepo, gitCommitAll, and the drive-to-iteration_validation(2) helper

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

describe("iteration_validation inventory uses the boundary diff", () => {
  it("shows a committed file from git diff base..HEAD (not only git status)", () => {
    const repo = makeGitRepo(); dirs.push(repo);
    // Drive to iteration_validation(2) with iteration 1 committed and recorded in
    // .commit-log.json (iterations["1"] = <sha>); iteration 2's file committed as HEAD.
    // The inventory for iteration 2 must include the iteration-2 committed file.
    const prompt = getPhasePrompt(repo, DEFAULT_CONFIG).prompt;
    expect(prompt).toContain("## Controller Observed Changed Files");
    // and includes the iteration-2 committed path
  });
});
```

If the full multi-iteration drive is too costly for a unit test, assert at the seam instead: construct `paths.commitLogPath` with a known base via `recordIterationBoundary`, put a committed file after that base, call `renderIterationValidation`/`renderFinalValidation` directly, and assert the committed path appears. Keep at least one test proving `diffBase` reaches the inventory for both `renderIterationValidation` and `renderFinalValidation`.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/get-phase-prompt-diffbase.test.ts`
Expected: FAIL (committed file absent — diff base not wired).

- [ ] **Step 3: Implement**

In `src/features/phase-control/get-phase-prompt.ts` add import:

```ts
import { readCommitLog, iterationDiffBase } from "../../entities/change/commit-log";
```

In `renderIterationValidation`, replace the inventory line (`:210`):

```ts
    controller_changed_files_inventory: renderChangedFileInventory(projectPath, { phase: currentPhase }),
```

with:

```ts
    controller_changed_files_inventory: renderChangedFileInventory(projectPath, {
      phase: currentPhase,
      diffBase: (() => {
        const log = readCommitLog(paths.commitLogPath);
        return log ? iterationDiffBase(log, currentPhase.id) ?? undefined : undefined;
      })()
    }),
```

In `renderFinalValidation`, replace the inventory line (`:224`):

```ts
    controller_changed_files_inventory: renderChangedFileInventory(projectPath),
```

with:

```ts
    controller_changed_files_inventory: renderChangedFileInventory(projectPath, {
      diffBase: readCommitLog(paths.commitLogPath)?.start ?? undefined
    }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/get-phase-prompt-diffbase.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/phase-control/get-phase-prompt.ts test/get-phase-prompt-diffbase.test.ts
git commit -m "feat: feed commit-log boundary diff into validation inventories"
```

---

## Task 9: Iteration validation phase contract wording

**Files:**
- Modify: `templates/phase6a_iteration_validation.md:54-57` (Phase completion block)
- Test: `test/controller.test.ts` (add one assertion on the rendered iteration_validation prompt)

**Interfaces:** none (template + rendered-prompt assertion).

- [ ] **Step 1: Write the failing test**

Add to `test/controller.test.ts` inside the existing iteration_validation prompt rendering suite (mirror the existing `expect(result.prompt).toContain("## Controller Observed Changed Files")` assertion at `test/controller.test.ts:743`):

```ts
it("iteration_validation contract instructs the agent to commit after a passing verdict", () => {
  // reuse the existing helper that renders the iteration_validation prompt in this file
  const rendered = /* existing render of iteration_validation prompt */;
  expect(rendered).toContain("commit the iteration");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/controller.test.ts`
Expected: FAIL (commit instruction not present).

- [ ] **Step 3: Implement**

In `templates/phase6a_iteration_validation.md`, replace the Phase completion block (lines 54-57):

```markdown
Phase completion:
- After writing `validation_findings.md` and possibly updating the iteration status, stop.
- Tell the user the verdict, whether the iteration is confirmed correctly solved, and the next transition through `phasedev advance`.
- If the user reports a defect after the verdict is written and before `phasedev advance`, do not edit repository code and do not delegate a code task: record it with `phasedev add-finding "<finding>" <severity> --required-fix <text> --class <class>` (the command corrects the verdict automatically), then stop — you do not run `phasedev advance`; the flow driver (user or orchestrator) advances, and the flow routes to finding_repair where the fix is implemented.
```

with:

```markdown
Phase completion:
- After writing `validation_findings.md` and possibly updating the iteration status, stop.
- On a `ready` or `ready_with_risks` verdict, after marking the iteration `[x]`, commit the iteration's code changes together with the updated `.phasedev` artifacts before running `phasedev advance`. Suggested message: `phasedev(<change>): iteration N — <name>`. If the working tree is not clean, `phasedev advance` will block until the iteration is committed (unless `requireIterationCommit: false` in config.yaml).
- Tell the user the verdict, whether the iteration is confirmed correctly solved, and the next transition through `phasedev advance`.
- If the user reports a defect after the verdict is written and before `phasedev advance`, do not edit repository code and do not delegate a code task: record it with `phasedev add-finding "<finding>" <severity> --required-fix <text> --class <class>` (the command corrects the verdict automatically), then stop — you do not run `phasedev advance`; the flow driver (user or orchestrator) advances, and the flow routes to finding_repair where the fix is implemented.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/controller.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add templates/phase6a_iteration_validation.md test/controller.test.ts
git commit -m "feat: instruct agent to commit each validated iteration"
```

---

## Task 10: Full verification

- [ ] **Step 1: Full test suite**

Run: `bun test`
Expected: all tests pass (previous count + the new tests).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean, no errors.

- [ ] **Step 3: CLI smoke in a git repo**

```bash
tmp=$(mktemp -d); git -C "$tmp" init -q; git -C "$tmp" config user.email t@t; git -C "$tmp" config user.name t
echo x > "$tmp/f"; git -C "$tmp" add -A; git -C "$tmp" commit -qm base --no-gpg-sign
phasedev init --project-path "$tmp"
phasedev create-change --project-path "$tmp" my-change
cat "$tmp/.phasedev/changes/my-change/.commit-log.json"   # expect { "start": "<40-hex>", "iterations": {} }
phasedev phase --project-path "$tmp"
```
Expected: `.commit-log.json` exists with a valid `start` SHA and empty `iterations`.

- [ ] **Step 4: Final commit (if any incidental changes remain)**

```bash
git status
```
Expected: clean working tree (everything already committed per task).

---

## Self-Review

**Spec coverage:**
- §4 config key → Task 3. §5 `.commit-log.json` → Task 2. §6 shared git → Task 1.
- §7 gate (dirty/clean/non-git/disabled, iteration + final placement) → Tasks 5, 6.
- §8 write points (create-change, implementation entry, iteration exit, archive travel) → Tasks 6, 7 (archive travel is free via `moveDirectory` — no code, verified in spec §8).
- §9 boundary-diff inventory (+ stale-SHA fallback) → Tasks 4, 8.
- §10 phase contract wording → Task 9.
- Test list from roadmap: gate dirty/clean/non-git/disabled (Task 6), boundary overwrite in repair (Task 6), stale SHA fallback (Task 4), commit-log write points (Tasks 6, 7), inventory diff sources per phase (Tasks 4, 8), prompt contract rendering (Task 9). All covered.

**Placeholder scan:** every code step shows full code; test sketches that depend on the existing multi-phase flow setup (Tasks 6, 8) explicitly point at the concrete existing patterns to reuse (`test/e2e-flow.test.ts`, `test/controller.test.ts`) and the fallback seam-level assertion, rather than leaving "add a test" open.

**Type consistency:** `CommitLog`, `ChangeScan`/`ChangeScanEntry`, `GitResult`, `iterationCommitBlocker`/`finalCommitBlocker`, `iterationDiffBase`, `recordCommitLogStart`/`recordIterationBoundary`, `scanChangedFilesOutsidePhasedev`, `gitHeadSha`, `commitLogPath` are named identically across producing and consuming tasks.
