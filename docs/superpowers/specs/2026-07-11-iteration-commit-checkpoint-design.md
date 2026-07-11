# Iteration Commit Checkpoint + Per-Iteration Change Review — Design Spec

**Status:** design agreed 2026-07-09 (roadmap `temp/roadmap.md`, section
«Коммит-чекпоинт после валидации итерации + пер-итерационный обзор изменений»).
This spec turns that agreed design into an implementation contract. No design
decisions are reopened here.

**Date:** 2026-07-11
**Branch:** `refactoring`

---

## 1. Problem

The changed-file inventory (`src/features/phase-control/changed-file-inventory.ts`)
is built from `git status`, i.e. from the **uncommitted** working tree. While
iterations accumulate without commits:

1. The validator of iteration N sees the accumulated changes of iterations
   1…N-1. The Expected Change Surface filter hides other files, but overlapping
   surfaces (shared barrel files, etc.) are indistinguishable — the validator
   judges another iteration's work as this iteration's, producing false MUST-FIX
   findings and needless repair cycles.
2. The "changes did not leak outside the iteration scope" check degenerates:
   outside the surface there is always noise from previous iterations
   ("N changed file(s) … hidden"), so a real scope leak drowns in it.
3. "No changed files matched" is ambiguous: "code not written yet" and "code
   already committed" look identical.

## 2. Solution overview

The agent commits; the controller **requires and records**; the controller only
**reads** git history, never mutates it. The feature has four coupled parts —
they ship together, not as options (without part 3 `final_validation` would go
blind once trees are clean).

1. A "clean tree" gate on validation **exit**.
2. `.commit-log.json` — machine-readable boundary bookmarks per change.
3. Changed-file inventory upgraded to **boundary diffs**.
4. The `iteration_validation` phase contract instructs the agent to commit.

## 3. Frozen contracts preserved

- `state.json` shape (`{ activePhase, activeIteration, repairCycleCount }`) is
  **unchanged**. No `flowMode`-style additions here.
- `config.yaml` gains one **additive** boolean key `requireIterationCommit`.
- The controller never runs `git commit`/`git add`/any mutating git command. It
  only runs read-only git (`rev-parse`, `status`, `diff`).
- Existing `changed-file-inventory` behaviour (git status + `.phasedev/` filter +
  Expected Change Surface filter + "Inventory unavailable" fallback) is
  preserved and **extended**, not replaced.
- "passing verdict" out of `iteration_validation` is whatever `resolveRoute`
  already resolves to a **forward** route (next iteration or `final_validation`)
  under `config.blockingSeverity`. The gate reuses that existing
  threshold-aware routing; it does not re-derive severities.

---

## 4. Config key: `requireIterationCommit`

- **Type:** boolean. **Default:** `true`.
- `true`: the commit gate is active (but silently skipped when the project is
  not a git repository).
- `false`: current behaviour (no gate, best-effort boundary recording).
- Parsed with the existing `readBoolean` pattern in
  `src/entities/config/config.ts`; added to `Config`, `DEFAULT_CONFIG`, and the
  `parseConfig` return object.
- Added to the bundled default `config.yaml` (root flags block, near
  `runArchiveStage`), so `phasedev init` propagates it (init copies the bundled
  config verbatim — `src/features/project-init/init-project.ts`).
- `phasedev config get requireIterationCommit` works automatically:
  `getConfigValue` reads the field off the `Config` object via `getDeepValue`.

---

## 5. `.commit-log.json` — boundary bookmarks

A controller-only service file in the change directory, in the same class as
`.findings-baseline.json`: dot-prefixed, atomic write, written and read only by
the controller, travels with the change into the archive.

### 5.1 Shape

```json
{
  "start": "a3f8c21d9be04f17c2aa5e8d3f61b0c4d9e7a512",
  "iterations": { "1": "b4e9…", "2": "c5fa…", "3": "d60b…" }
}
```

- Full **40-char lowercase hex** SHAs (short SHAs can become ambiguous).
- `start`: HEAD at `create-change` time (if the project is a git repo). If the
  repo appeared later, `start` is recorded on the first `advance` into
  `implementation`. `start` is `null` until recorded.
- `iterations["N"]`: HEAD at the moment `advance` **exited**
  `iteration_validation(N)` with a clean tree. A repair-cycle re-validation of
  iteration N **overwrites** `iterations["N"]` — the boundary moves to the
  repair commit.
- **Deliberately NOT stored** (YAGNI, avoid a second source of truth): dates,
  commit messages, iteration names, branch. All recoverable from git by SHA.
- Rationale for JSON over Markdown: nobody edits this file by hand; a table
  parser and the risk of manual edits are unwanted. The human-readable trail is
  the git history itself (one conventional commit per iteration).

### 5.2 Location

- Path: `<changeDir>/.commit-log.json`, exposed as
  `ChangePaths.commitLogPath` from `buildChangePaths`
  (`src/entities/change/paths.ts`).
- **Module placement:** `src/entities/change/commit-log.ts`. Rationale: this is
  a per-change controller state file (a sibling of `state.json` and
  `.findings-baseline.json`), so it belongs to the `change` entity. Note: the
  roadmap loosely suggested `src/entities/schema`, but that directory
  (`load-schema.ts`) only handles **artifact section schemas** (Markdown heading
  validation), not JSON controller files — it is the wrong home. See §11
  Discrepancies.

### 5.3 Module API (`src/entities/change/commit-log.ts`)

```ts
export interface CommitLog {
  start: string | null;
  iterations: Record<string, string>;
}

// null on: missing file, unparseable JSON, or shape violation (degrade gracefully).
export function readCommitLog(commitLogPath: string): CommitLog | null;

// Atomic write via writeFileAtomic, trailing newline.
export function writeCommitLog(commitLogPath: string, log: CommitLog): void;

// Idempotent: sets `start` only if currently null/absent; preserves iterations.
export function recordCommitLogStart(commitLogPath: string, sha: string): void;

// Sets iterations[String(iterationId)] = sha (overwrites on repair); preserves start.
export function recordIterationBoundary(commitLogPath: string, iterationId: number, sha: string): void;

// Diff base for validating iteration N: iterations[N-1] ?? start (N=1 → start). null if neither exists.
export function iterationDiffBase(log: CommitLog, iterationId: number): string | null;
```

- SHA validation constant: `/^[0-9a-f]{40}$/`. `readCommitLog` returns `null`
  when `start` is present but not a valid SHA, or any `iterations` value is not
  a valid SHA, or the top-level shape is wrong.
- `recordCommitLogStart` / `recordIterationBoundary` read the existing log (or
  start from `{ start: null, iterations: {} }` when `readCommitLog` returns
  null), mutate the one field, and write back — preserving the other field.

---

## 6. Shared git helper: `src/shared/shell/git.ts` (NEW)

There is currently no shared git helper; `changed-file-inventory.ts` inlines
`spawnSync("git", …)`. The new feature adds three git reads used across three
modules (`changed-file-inventory`, `advance-flow`, `create-change`): HEAD SHA,
repo detection, and (already existing) status/diff. This real reuse justifies a
small shared module. It imports **only** `child_process` — nothing
project-specific (dependency direction: shared → no feature/entity imports).

```ts
export interface GitResult {
  ok: boolean;            // process ran and exited 0
  stdout: string;
  stderr: string;
  failureReason: string | null; // human-readable reason when !ok
}

// Read-only git invocation, cwd = projectPath via `-C`.
export function runGit(projectPath: string, args: string[]): GitResult;

// `git rev-parse HEAD`, trimmed; null unless a valid 40-hex SHA is returned.
export function gitHeadSha(projectPath: string): string | null;

// `git rev-parse --is-inside-work-tree` === "true".
export function isGitRepo(projectPath: string): boolean;
```

`runGit` uses `spawnSync("git", ["-C", projectPath, ...args], { encoding: "utf-8" })`.
`failureReason` = `result.error?.message || result.stderr.trim() || \`git exited with ${result.status}\``.

`changed-file-inventory.ts` is refactored to call `runGit` instead of its inline
`spawnSync` (behaviour-preserving for the existing status path).

---

## 7. Commit gate on validation exit

### 7.1 Dirty-tree predicate (in `changed-file-inventory.ts`, reused by the gate)

A single "one lens on code changes" is used by both the inventory and the gate:
git status short, `.phasedev/**` filtered out.

```ts
export interface ChangeScanEntry { status: string; filePath: string; }
export type ChangeScan =
  | { ok: true; entries: ChangeScanEntry[] }
  | { ok: false; reason: string };

// git status --short --untracked-files=all -- . , parsed, `.phasedev/`-filtered.
export function scanChangedFilesOutsidePhasedev(projectPath: string): ChangeScan;
```

- `ok: false` when git status fails (non-git repo, git error). Gate treats this
  as **skip** (fail-open): non-git projects and git errors never block the flow.
- `ok: true` with `entries.length === 0` = clean tree outside `.phasedev/**`.

### 7.2 Gate helper (in `advance-flow.ts`)

```ts
function commitGateBlocks(projectPath: string, config: Config): boolean {
  if (!config.requireIterationCommit) return false; // opt-out
  const scan = scanChangedFilesOutsidePhasedev(projectPath);
  if (!scan.ok) return false;                        // non-git / git error → skip
  return scan.entries.length > 0;                    // dirty outside .phasedev → block
}
```

### 7.3 Where the gate fires

**Fires on validation EXIT, not implementation entry** (entering iteration 1 on a
dirty repo with unrelated changes must not be blocked).

- **`iteration_validation(N)` → forward (passing verdict):** in `advanceFlow`
  section (E), after the `maxIterations` guard and **before**
  `applyStateSideEffects`/`saveFlowState`, when:
  ```ts
  state.activePhase === "iteration_validation" &&
  state.activeIteration !== null &&
  (route.kind === "final_validation" ||
   (route.kind === "iteration" && route.activeIteration.id !== state.activeIteration))
  ```
  This condition mirrors, verbatim, the `isNextIteration || isFinalValidation`
  passing-exit condition already in `applyStateSideEffects`
  (`advance-flow.ts:179-193`). Because `route` came from `resolveRoute(…,
  config.blockingSeverity)`, a `repair_required`/open-blocking verdict routes to
  `finding_repair` (not matched here) — so `finding_repair` entry is **never**
  gated, exactly as required. If `commitGateBlocks` is true → `refuse` with the
  iteration commit blocker (no state mutation).

- **`final_validation` → `archive_ready`:** inside the existing
  `if (route.kind === "archive_ready")` branch
  (`advance-flow.ts:362-388`), after the `runArchiveStage` guard and **before**
  the archive mutation (`fs.rmSync(paths.findingsBaselinePath …)` /
  `startArchiveStage`). If `commitGateBlocks` is true → `refuse` with the final
  commit blocker.

### 7.4 Blocker text (`src/features/phase-control/prompt-blockers.ts`)

```ts
export function iterationCommitBlocker(
  iterationId: number, iterationName: string, changeSlug: string, changeName?: string
): Prompt;

export function finalCommitBlocker(changeSlug: string, changeName?: string): Prompt;
```

- `changeSlug` = `path.basename(changeDir)` (used in the suggested commit
  message). `changeName` = the CLI `--change` value (may be undefined), used for
  the `advanceCommand(changeName)` retry line, matching every other blocker.
- Iteration blocker content (mirrors the boxed style of the existing blockers):
  - Title line: `[FLOW CONTROLLER] BLOCKED: Iteration ${iterationId} validated. Commit the iteration before advancing.`
  - Explains uncommitted changes outside `.phasedev/**` must be committed
    together with the updated `.phasedev` artifacts.
  - Suggested commit message: `phasedev(${changeSlug}): iteration ${iterationId} — ${iterationName}`
  - Retry: `run '${advanceCommand(changeName)}' again.`
  - Opt-out note: `set 'requireIterationCommit: false' in config.yaml`.
  - `reason: "Iteration commit required"`.
- Final blocker content: analogous, suggested message
  `phasedev(${changeSlug}): final validation`, `reason: "Commit required before archive"`.

### 7.5 Accepted cost (documented, from the roadmap)

Unrelated uncommitted changes anywhere in the repo also block advance (the
controller cannot tell "someone else's" from "this iteration's"). Remedy:
commit/stash them, or set `requireIterationCommit: false`.

---

## 8. `.commit-log.json` write points

| Point | Trigger | Action |
|---|---|---|
| `create-change` | change created and project is a git repo | `recordCommitLogStart(commitLogPath, gitHeadSha)` |
| `advance` into `implementation` | `nextState.activePhase === "implementation"` and repo present | `recordCommitLogStart(...)` (idempotent — no-op if already set; captures "repo appeared later") |
| `advance` out of `iteration_validation(N)` (passing exit) | gate passed / skipped, state saved, repo present | `recordIterationBoundary(commitLogPath, N, gitHeadSha)` |

- All writes are guarded by `gitHeadSha(projectPath) !== null` (skip in non-git
  projects). `recordCommitLogStart` is idempotent so double-recording is safe.
- The boundary record happens **after** `saveFlowState` succeeds (the exit is
  committed to state), using `state.activeIteration` (the iteration that was
  just validated), so a repair-cycle re-validation of N overwrites
  `iterations["N"]`.
- `final_validation` needs **no** boundary write: `start..HEAD` already covers
  the whole change, and archive is terminal.
- Archive travel: `startArchiveStage` moves the whole change directory via
  `moveDirectory(changeDir, archiveTarget)` (`archive-stage.ts:78`), so
  `.commit-log.json` is relocated automatically with no extra code — confirmed
  against the code.

---

## 9. Inventory by boundary diffs

| Phase | Validator sees | Source |
|---|---|---|
| `iteration_validation(N)` | delta of iteration N only | `git diff <iterations[N-1]> HEAD` (N=1: from `start`) + `git status` for uncommitted |
| `final_validation` | the whole change | `git diff <start> HEAD` + `git status` |

### 9.1 `renderChangedFileInventory` signature change

```ts
export interface ChangedFileInventoryOptions {
  phase?: Iteration;
  diffBase?: string; // NEW: 40-hex SHA; when set, union git diff base..HEAD with git status
}
```

- With `diffBase` set: run `runGit(projectPath, ["diff", "--name-status", diffBase, "HEAD", "--", "."])`.
  - **Diff failure (stale SHA after rebase/amend) → return the existing
    "Inventory unavailable: … build evidence read-only" branch** (the same
    fallback used when git status fails). Flow is not blocked.
  - On success, parse `--name-status` lines (tab-separated; rename `R100\told\tnew`
    → take the last field as the path), filter `.phasedev/`, and **merge** with
    the status entries into a path-keyed map (diff entries first, status entries
    override — the working tree is the most current). The merged rows then flow
    through the existing empty/surface/render logic unchanged.
- Without `diffBase`: status-only (current behaviour, byte-for-byte).

### 9.2 Diff base wiring (`src/features/phase-control/get-phase-prompt.ts`)

- `renderIterationValidation`: read `readCommitLog(paths.commitLogPath)`; if
  non-null, `diffBase = iterationDiffBase(log, currentPhase.id) ?? undefined`;
  pass `{ phase: currentPhase, diffBase }`.
- `renderFinalValidation`: read the log; `diffBase = log?.start ?? undefined`;
  pass `{ diffBase }`.
- When the log is missing or the base is null → `diffBase` undefined →
  status-only fallback (graceful; e.g. `requireIterationCommit: false` with no
  commits, or repo absent).

### 9.3 Why one feature, not options

Once commits exist and each iteration exit leaves a clean tree,
`final_validation`'s `git status` is empty; without the `start..HEAD` diff it
would see nothing. Parts 1–3 therefore ship together.

---

## 10. Phase contract wording (`templates/phase6a_iteration_validation.md`)

The `iteration_validation` prompt already tells the agent to flip the iteration
to `[x]` on a `ready`/`ready_with_risks` verdict (line 36) and to stop after
writing findings (Phase completion, lines 54-57). Add the commit instruction to
the Phase completion / "Done when" contract:

- After a `ready` / `ready_with_risks` verdict and marking the iteration `[x]`,
  **commit the iteration's code changes together with the updated `.phasedev`
  artifacts** before running `phasedev advance`. Suggested message:
  `phasedev(<change>): iteration N — <name>`. Note that if the tree is not
  clean, `phasedev advance` will block with the commit gate (§7).

The generic PHASE_SUMMARIES "Done when" line
(`prompt-render-helpers.ts:33-43`) stays as-is (it is a `phasedev check…`
line, not the place for a commit instruction); the commit contract lives in the
`iteration_validation` template body only. `final_validation`'s template is not
changed — its commit requirement is enforced by the gate and the change is
already committed iteration-by-iteration.

---

## 11. Discrepancies found between design claims and actual code

1. **Schema home.** Roadmap: "схема `.commit-log.json` в `src/entities/schema`."
   `src/entities/schema/` contains only `load-schema.ts`, which validates
   **artifact Markdown section schemas**, not JSON controller files. Correct
   home is `src/entities/change/commit-log.ts` (per-change controller state,
   sibling of `state.json`/`.findings-baseline.json`). Resolved as such in §5.2.
2. **No shared git helper exists** (confirmed): only an inline `spawnSync` in
   `changed-file-inventory.ts`. New `src/shared/shell/git.ts` added (§6).
3. **Line references from the exploration pass are accurate** (verified):
   `validatePhaseExit` at `advance-flow.ts:283`; `archive_ready` branch
   `:362-388`; iteration-completion side-effect `:179-193`; `BASELINE_PHASES`
   `:454`. `create-change` writes `state.json` via `writeFileAtomic`
   (`create-change.ts:84`). `buildChangePaths`/`findingsBaselinePath` at
   `paths.ts:16-27`.
4. **`config.yaml` root flags** end at `blockingSeverity` (line 56);
   `maxRepairCycles` is not present in the bundled file (relies on the default).
   `requireIterationCommit: true` is added to the root flags block.
5. **Tests currently use no git repos** — existing inventory assertions run in
   non-git temp dirs and hit "Inventory unavailable". New tests must create real
   git repos (helper specified in the plan). Existing non-git tests keep passing
   unchanged (diff path only activates when a `diffBase` is supplied and the
   repo exists).
6. **`updateIterationStatus` is idempotent** on an already-`[x]` heading (the
   regex char class includes `x`; returns `true`) — so the agent marking `[x]`
   before committing does not break `applyStateSideEffects`. No change needed.

## 12. Open questions

None blocking. The design was pre-agreed; all four parts and their code seams
are verified against the current `refactoring` branch.
