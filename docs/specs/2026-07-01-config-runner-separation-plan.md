# Implementation Plan: Config Restructure & Runner Separation

**Spec:** `docs/specs/2026-07-01-config-runner-separation-spec.md`
**spec_id:** 2026-07-01-config-runner-separation-1030
**planning_mode:** spec-driven
**source_of_truth:** approved spec
**plan_revision:** 2
**status:** Approved
**Created:** 2026-07-01
**Tasks:** 9
**Estimated complexity:** 5 standard + 4 complex

## Architecture Summary

The codebase follows a three-layer architecture: **Entities** (types/validators), **Features** (business logic), **Shared** (utilities).

The core change is a clean boundary separation: what is currently one monolithic `Config` type (in `entities/config/config.ts` holding both flow configuration and runner execution parameters) gets split into two independent domains:

1. **`Config`** (in `entities/config/`) — flow state machine config: phases (renamed from stages), `runArchiveStage`, `autoApprove`. No runner fields.
2. **`RunnerConfig`** (in `features/runner/`) — runner execution config: model, SDK parameters, loop settings, watchdog, notifications.

The `Stage` union type (in `entities/stage/types.ts`) and `flow-route.ts` already use new stage names — no changes needed there.

Key integration points:
- `runner.ts` loads both `config.yaml` and `runner.yaml` via `loadConfig()`, passes `Config` + `RunnerConfig` to `runRunner()`
- `cli.ts` loads only `config.yaml` (runner config is irrelevant to CLI commands)
- `run-flow-ralph.ts` receives both configs, uses `RunnerConfig` for SDK parameters and `Config` for flow decisions
- `features/runner/config.ts` transitions from a barrel re-export to an independent module with `parseRunnerConfig()`
- `init-project.ts` creates both config files
- `SKILL.md` gets all stage names renamed per DC-3 mapping

## Technical Decisions

### Patterns
- **Three-layer architecture** preserved (Entities/Features/Shared)
- **Parser pattern** reused: `asRecord`, `readString`, `readBoolean`, `readPositiveInteger`, `readEnum`, `readSkillArray` helper family replicated (with attribution) for `parseRunnerConfig` — the parsers evolve independently
- **Barrel anti-pattern fixed**: `features/runner/config.ts` ceases to be a re-export barrel and becomes an independent module
- **Dependency injection** in `runRunner()` preserved — `RunnerDependencies` interface stays test-friendly

### Existing Code to Reuse
- `readString`, `readBoolean`, `readPositiveInteger`, `readEnum`, `readSkillArray` from `entities/config/config.ts` — replicate with a `// see entities/config/config.ts` comment
- `defaultConfigPath()`, `projectConfigPath()`, `resolveConfigPath()` patterns — replicate as `defaultRunnerConfigPath()`, `projectRunnerConfigPath()`, `resolveRunnerConfigPath()`
- Shared types (`ReasoningEffort`, `SandboxMode`, `ApprovalPolicy`) stay in `entities/config/config.ts` — consumed by both `Config` and `RunnerConfig`

### Libraries
- **No new dependencies** — `yaml` (^2.8.2) already handles both config files
- `DEFAULT_RUNNER_CONFIG` provides hardcoded defaults for missing fields in `runner.yaml`

### Trade-offs

| Decision | Option A (selected) | Option B (rejected) | Rationale |
|----------|----------|----------|--------|-----------|
| `features/runner/config.ts` | Overwrite with `RunnerConfig` module | New file `runner-config.ts` | Existing import path stays valid; compile errors flag all consumers that need updating |
| Shared type location | Keep `ApprovalPolicy`, `ReasoningEffort`, `SandboxMode` in entities/config | Move to shared/types/runner | Avoid cascading import refactors; they are domain types not runner-specific |
| Parser helpers for RunnerConfig | Copy `read*` helpers into runner module | Extract to shared utility | Parsers will diverge; a shared module creates unwanted cross-domain dependency |
| Missing `runner.yaml` | Graceful fallback to defaults (legacy mode) | Throw error | DC-19 mandates backward compatibility |
| Legacy stage name mapping | Inline in `parseConfig()` | Separate compatibility layer | Simpler, single code path, easier to test |

## Quality Strategy

### Test approach
- **Test framework:** `bun:test` — Bun's built-in test runner
- **Test naming:** `*.test.ts` convention
- **Test directory:** `/test/` at project root (not co-located)
- **Fixture pattern:** inline YAML strings in test bodies; `makeConfig(overrides)` for runner tests
- **Key test helpers:** `createTempWorkspace(label)`, `cleanupTempWorkspace(path)` from `test/helpers/temp-workspace.ts`

### Risk areas
1. **HIGH — 10+ `config.codex.*` / `config.loop.*` references in `run-flow-ralph.ts`**: every access path must be audited and migrated to either `runnerConfig.runner.*` or `config.*`. Missing one causes a compile error AND runtime logic break.
2. **HIGH — Config test full rewrite**: `test/config.test.ts` (362 lines) constructs old-format YAML and asserts old `config.codex.*` paths. Must be fully rewritten for `phases:` format.
3. **MEDIUM — Barrel breakage**: `features/runner/config.ts` exports change completely. Compile errors cascade to stage-control, runner.ts, cli.ts, and all test files.
4. **MEDIUM — Legacy migration mapping**: 14-row migration table with stage name renames. Complex multi-step transformation chain. Each rename pair needs a test case.
5. **LOW — `isIgnoredFlowSnapshotPath`**: easy to miss adding `.phasedev/runner.yaml` alongside existing `.phasedev/config.yaml`.

### CQ Pre-Check
| Gate | Activated | Requirement |
|------|-----------|-------------|
| CQ3 | Yes | `parseRunnerConfig` must validate all input fields with the `read*` helper family |
| CQ8 | Yes | YAML parse errors must produce clear messages with file path |
| CQ14 | Yes | Replicate `read*` helpers in runner module with attribution — do not import from entities |

## Coverage Matrix

| Row ID | Authority item | Type | Primary task(s) | Notes |
|--------|----------------|------|-----------------|-------|
| AC1 | `parseConfig` with `phases:` | requirement | Task 1 | Config interface restructured, parseConfig updated |
| AC2 | `parseRunnerConfig` | requirement | Task 2 | RunnerConfig types + parser created |
| AC3 | `loadConfig` dual-file load | requirement | Task 3 | Returns `{config, runnerConfig}` — needs RunnerConfig type (Task 2) |
| AC4 | `loadConfig` legacy fallback | requirement | Task 3 | Legacy `codex.stages` → deprecation warning + mapping — needs RunnerConfig type (Task 2) |
| AC5 | `runRunner(config, runnerConfig)` | requirement | Task 3 | Signature changed, access paths audited |
| AC6 | runner.yaml in `isIgnoredFlowSnapshotPath` | requirement | Task 3 | One-line addition |
| AC7 | `phasedev init` creates both files | requirement | Task 6 | init-project.ts updated |
| AC8 | `bun test` passes | deliverable | Task 8, Task 9 | All tests updated |
| AC9 | `npm run typecheck` passes | deliverable | All tasks | Each task maintains typecheck |
| DC-1 | Remove `codex:` wrapper | constraint | Task 1 | |
| DC-2 | `codex.stages:` → `phases:` | constraint | Task 1 | |
| DC-3 | Stage name renames | constraint | Task 7 | SKILL.md |
| DC-4 | SDK fields → `runner.yaml` | constraint | Task 2 | |
| DC-7 | `runArchiveStage` at root | constraint | Task 1 | |
| DC-8 | `autoApprove` at root | constraint | Task 1 | |
| DC-10 | config.ts + phases | constraint | Task 1 | |
| DC-11 | runner/config.ts module | constraint | Task 2 | |
| DC-12 | runner.ts loads both | constraint | Task 3 | |
| DC-13 | runRunner(config, runnerConfig) | constraint | Task 3 | |
| DC-14 | SKILL.md rename | constraint | Task 7 | |
| DC-15 | No logic/flow changes | constraint | Tasks 3+4+5 | Verify no behavioral changes |
| DC-18 | Internal Config uses phases | constraint | Task 1 | |
| DC-19 | Missing runner.yaml fallback | constraint | Task 1 | |
| DC-20 | CLI old keys deprecation | constraint | Task 4 | |
| DC-21 | runner.yaml in snapshot ignore | constraint | Task 3 | |
| DC-22 | Legacy codex.stages parsing | constraint | Task 1 | |
| IC-6 | runner.yaml wins if exists | constraint | Task 1 | |
| IC-7 | validateSkillMdStageNames | constraint | Task 3 | Startup check for SKILL.md |

## Review Trail
- Plan reviewer revision 2: APPROVED (issues fixed: AC3/AC4 → Task 3, Task 7 deps added, test breakage documented with narrow-scope verify commands)
- Cross-model validation: skipped (user declined third-party provider invocation)
- Status gate: Approved
- Approved by: user (interactive)

## Task Breakdown

### Task 1: Restructure Config interface, update parseConfig, add legacy migration
**Files:** `src/entities/config/config.ts`
**Surface:** backend-logic
**Complexity:** complex
**Dependencies:** none

This task does the core config restructuring. `entities/config/config.ts` is the single production file modified.

- [ ] RED: Write tests for the new Config shape and parseConfig behavior:
  - `test/config.test.ts` — add test block for `Config` with `phases:` at top level (no `codex:` wrapper, no `loop:` block)
  - Assert `parseConfig({ phases: { change_intake: { skills: { routers: [], main: [], additional: [] } } }, runArchiveStage: true, autoApprove: false })` returns a valid `Config` with `phases.change_intake` accessible
  - Assert `parseConfig({})` returns defaults for `runArchiveStage` (true) and `autoApprove` (false)
  - Assert `parseConfig({ phases: { unknown_stage: {} } })` emits a warning but does not throw (forward compatibility, IC-3)
  - Assert legacy mode: `parseConfig({ codex: { stages: { setup: { skills: { main: ["test"] } } }, default: { model: "claude-sonnet-5", reasoningEffort: "medium" } } })` returns `phases.change_intake.skills.main` mapped from `codex.stages.setup`, with deprecation warning
  - Assert legacy per-stage model/effort override produces per-stage WARNING (CR-1 fix)
  - Assert `parseConfig` with BOTH `codex.stages` AND `phases` — `phases` wins (IC-6)
  - Assert shared types (`ReasoningEffort`, `SandboxMode`, `ApprovalPolicy`) remain exported from this module
  - Verify: `bun test test/config.test.ts` — new tests fail (Config type doesn't exist yet)
- [ ] GREEN: Implement config restructure in `entities/config/config.ts`:
  - **Remove** `StageModelConfig = { model, reasoningEffort }` — moves to RunnerConfig
  - **Remove** `WatchdogConfig` type — moves to RunnerConfig module
  - **Remove** `NotificationConfig`, `TelegramNotificationConfig` types — move to RunnerConfig module
  - **Change** `Config` interface:
    - Remove `codex: { default, stages, sandboxMode, approvalPolicy, networkAccessEnabled, streamAgentOutput }` block
    - Remove `loop: { maxIterations, logDir, enableLogs, runArchiveStage, autoApprove, watchdog, notifications }` block
    - Add `phases: Partial<Record<Exclude<Stage, "init">, StageConfig>>` at root
    - Add `runArchiveStage: boolean` at root (default `true`)
    - Add `autoApprove: boolean` at root (default `false`)
  - **Keep** shared types: `ReasoningEffort`, `SandboxMode`, `ApprovalPolicy`, `StageSkillConfig`, `StageConfig`
  - **Update** `DEFAULT_CONFIG` to new shape — no `codex:` or `loop:` wrappers
  - **Update** `parseConfig(raw)`:
    - Parse `phases:` key instead of `codex.stages:`
    - If `raw.codex.stages` found: parse legacy format, emit deprecation warning via console.warn, map stage names (setup→change_intake, research→code_research, etc.) using a STAGE_NAME_MAP constant, reconstruct runtime `phases` object
    - If `codex.stages` AND `phases` both present: `phases` wins, emit warning
    - If per-stage model/effort override found in legacy mode: emit per-stage WARNING "Per-stage model override for '<stage>' is not supported in legacy mode"
    - Parse `runArchiveStage` and `autoApprove` from root, default to `true` and `false` respectively
    - Unknown keys in `phases` section → warning, not error (forward compatibility)
  - **Remove** `getStageModelConfig()` function — logic moves to runner domain
  - **Update** `StageConfig` to NOT include `StageModelConfig` (`model`, `reasoningEffort`) — those are runner-only now. `StageConfig` becomes `{ skills: StageSkillConfig }`
  - **Note:** Existing `test/config.test.ts` assertions reference old `config.codex.*` / `config.loop.*` paths that no longer exist. These old tests will fail until Task 8. Task 1's Verify uses `--test-name-pattern` to run only new tests.
- [ ] Verify: `bun test --test-name-pattern "parseConfig|phases|legacy" test/config.test.ts`
  Expected: New tests pass
- [ ] Acceptance Proof:
  - AC1: `parseConfig(yaml.parse(readFileSync("config.yaml")))` completes without errors, returns `Config` with `phases: { change_intake: {...}, ... }`
    - Artifact: `zuvo/proofs/AC1-config-parse.txt`
  - AC4: `loadConfig(testDir)` where only legacy `config.yaml` exists returns deprecation warning + extracted runner fields — Artifact: `zuvo/proofs/AC1-legacy-partial.txt`
- [ ] Commit: `restructure Config interface, update parseConfig with phases and legacy migration`

---

### Task 2: Create RunnerConfig module with types and parser
**Files:** `src/features/runner/config.ts`, `src/features/runner/index.ts`, `src/features/runner/codex-turn.ts`
**Surface:** backend-logic
**Complexity:** complex
**Dependencies:** Task 1

This task creates the independent `RunnerConfig` module, replacing the barrel re-export that currently exists.

- [ ] RED: Write tests for RunnerConfig types and `parseRunnerConfig`:
  - `test/runner.test.ts` — add test block:
  - Assert `parseRunnerConfig({ runner: { model: "claude-sonnet-5", reasoningEffort: "medium", sandboxMode: "workspace-write", maxIterations: 10 } })` returns valid `RunnerConfig` with defaults for missing optional fields
  - Assert `parseRunnerConfig({})` returns `DEFAULT_RUNNER_CONFIG` (all defaults)
  - Assert `parseRunnerConfig({ runner: { model: 123 } })` throws validation error (model must be string)
  - Assert `parseRunnerConfig({ runner: { reasoningEffort: "invalid" } })` throws (not a valid enum value)
  - Verify: `bun test test/runner.test.ts` — new tests fail
- [ ] GREEN: Implement RunnerConfig module:
  - **Overwrite** `src/features/runner/config.ts`:
    - Define `RunnerConfig` interface with `runner:` containing: `model`, `reasoningEffort`, `sandboxMode`, `approvalPolicy`, `networkAccessEnabled`, `streamAgentOutput`, `maxIterations`, `logDir`, `enableLogs`, `watchdog: WatchdogConfig`, `notifications: NotificationConfig`
    - Define `WatchdogConfig` interface (moved from entities/config): `enabled`, `turnTimeoutMs`, `inactivityTimeoutMs`, `statusIntervalMs`, `abortGraceMs`
    - Define `NotificationConfig` interface (moved): `telegram: TelegramNotificationConfig`
    - Define `TelegramNotificationConfig` interface (moved): `enabled`, `botTokenEnv`, `chatIdEnv`
    - Copy `readString`, `readBoolean`, `readPositiveInteger`, `readEnum`, `asRecord` helpers with a `// see entities/config/config.ts` comment
    - Define `parseRunnerConfig(raw): RunnerConfig` — validates all fields, uses DEFAULT_RUNNER_CONFIG for missing ones
    - Define `DEFAULT_RUNNER_CONFIG` with sensible defaults
    - Define path helpers: `defaultRunnerConfigPath()`, `projectRunnerConfigPath()`, `resolveRunnerConfigPath()`
    - **Re-export** shared types from entities for consumer convenience: `export type { ApprovalPolicy, ReasoningEffort, SandboxMode } from "../../entities/config/config"`
  - **Update** `src/features/runner/index.ts`:
    - Remove re-exports of entity config types (`Config`, `DEFAULT_CONFIG`, `loadConfig`, etc.)
    - Export `RunnerConfig`, `parseRunnerConfig`, and runner-specific types
    - Keep exporting `runRunner`, `RunnerDependencies`, `RunnerResult`, `RunnerStatus`
  - **Update** `src/features/runner/codex-turn.ts`:
    - Change import of `ApprovalPolicy`, `ReasoningEffort`, `SandboxMode` from `../../entities/config/config` to `./config` (the new RunnerConfig module re-exports them)
  - **Note:** Existing `test/runner.test.ts` imports old barrel re-exports (now removed). These tests will fail until Task 9. Task 2's Verify runs only new tests.
- [ ] Verify: `bun test --test-name-pattern "RunnerConfig|parseRunnerConfig" test/runner.test.ts`
  Expected: New RunnerConfig tests pass
- [ ] Acceptance Proof:
  - AC2: `parseRunnerConfig(yaml.parse(readFileSync("runner.yaml")))` completes without errors, returns `RunnerConfig` with `runner: { model, reasoningEffort, ... }`
    - Artifact: `zuvo/proofs/AC2-runner-parse.txt`
- [ ] Commit: `create RunnerConfig module with types, parseRunnerConfig, and DEFAULT_RUNNER_CONFIG`

---

### Task 3: Update runner.ts and run-flow-ralph.ts for separate configs
**Files:** `src/runner.ts`, `src/features/runner/run-flow-ralph.ts`
**Surface:** backend-logic
**Complexity:** complex
**Dependencies:** Task 1, Task 2

This task updates the runner entry point and loop to accept both `Config` and `RunnerConfig` separately, migrating all internal access paths.

- [ ] RED: Write tests for the dual-config runner:
  - `test/runner.test.ts` — add test block:
  - Assert `runRunner(projectPath, config, runnerConfig, deps)` typechecks with new signatures
  - Assert runner uses `runnerConfig.runner.model` for Codex creation (not `config.codex.default`)
  - Assert runner uses `runnerConfig.runner.sandboxMode` for turn config
  - Assert runner uses `config.runArchiveStage` for archive stage decisions
  - Assert `isIgnoredFlowSnapshotPath(".phasedev/runner.yaml")` returns `true`
  - Assert `isIgnoredFlowSnapshotPath(".phasedev/config.yaml")` still returns `true`
  - Verify: `bun test test/runner.test.ts` — new tests fail
- [ ] GREEN: Migrate runner.ts and run-flow-ralph.ts:
  - **`src/runner.ts`:**
    - Import `RunnerConfig` types from `./features/runner/config` (new module)
    - `runRunnerCli`: after `loadConfig()`, destructure `const { config, runnerConfig } = loadConfig(resolvedConfigPath)`
    - Change `config.loop.notifications.telegram` → `runnerConfig.runner.notifications.telegram`
    - Change `config.loop.logDir` → `runnerConfig.runner.logDir`
    - Change `config.loop.enableLogs` → `runnerConfig.runner.enableLogs`
    - Pass both `config` and `runnerConfig` to `runRunner(projectPath, config, runnerConfig, deps)`
  - **`src/features/runner/run-flow-ralph.ts`:**
    - Import `RunnerConfig` from `./config` (the new module)
    - Import `Config` directly from `../../entities/config/config` (not through the barrel)
    - Remove import of `getStageModelConfig` from barrel — replace with access to `runnerConfig.runner.model` / `runnerConfig.runner.reasoningEffort`
    - Import `resolveProjectLogDir` from `../../shared/fs/resolve-project-log-dir` (it's a shared utility)
    - Change `runRunner()` signature from `(projectPath, config, dependencies)` to `(projectPath, config: Config, runnerConfig: RunnerConfig, dependencies)`
    - **Audit all access paths (10+ references):**
      - `config.loop.logDir` → `runnerConfig.runner.logDir`
      - `config.loop.maxIterations` → `runnerConfig.runner.maxIterations`
      - `config.loop.autoApprove` → `config.autoApprove` (stays in Config at root level)
      - `config.loop.runArchiveStage` → `config.runArchiveStage` (stays in Config)
      - `config.codex.sandboxMode` → `runnerConfig.runner.sandboxMode`
      - `config.codex.approvalPolicy` → `runnerConfig.runner.approvalPolicy`
      - `config.codex.networkAccessEnabled` → `runnerConfig.runner.networkAccessEnabled`
      - `config.codex.streamAgentOutput` → `runnerConfig.runner.streamAgentOutput`
      - `config.loop.watchdog` → `runnerConfig.runner.watchdog`
      - `getStageModelConfig(config, stage)` → `runnerConfig.runner.model` / `runnerConfig.runner.reasoningEffort`
    - **Add `runner.yaml` to flow snapshot ignore:**
      - Add `const RUNNER_CONFIG_RELATIVE_PATH = ".phasedev/runner.yaml";` constant alongside `PROJECT_CONFIG_RELATIVE_PATH`
      - Update `isIgnoredFlowSnapshotPath` to also check for `RUNNER_CONFIG_RELATIVE_PATH`
      - Update `hashProtectedPath` call to include runner.yaml path
    - **Add `validateSkillMdStageNames` call at runner startup:**
      - Implement the function (from IC-7 in the spec): reads SKILL.md, regex matches old stage name patterns, throws fatal error if found
      - Call it after config loading, before the main loop
  - **Verify no logic changes** (DC-15): the runner loop behavior is identical — only the data source changes, not the control flow
  - **Incremental test updates (run-flow-ralph.test.ts):** Update any test helpers (`makeConfig`, `makeRunnerConfig`) in `test/runner.test.ts` to produce the new dual-config shape. This is the MINIMUM needed to keep the runner test file type-checking — the full rewrite is in Task 9.
- [ ] Verify: `npm run typecheck`
  Expected: exit 0 — production code compiles with new signatures
  **Note:** Full `bun test test/runner.test.ts` may still fail because some old test assertions reference old Config paths. Those are fixed in Task 9. The typecheck pass verifies the refactor is structurally correct.
- [ ] Acceptance Proof:
  - AC3: `loadConfig(testDir)` where both files exist returns `{ config, runnerConfig }` with `config.phases` containing stages and `runnerConfig.runner.model` containing model
    - Artifact: `zuvo/proofs/AC3-dual-load.txt`
  - AC4: `loadConfig(testDir)` where only legacy `config.yaml` exists returns deprecation warning + extracts `runnerConfig.runner.model` from legacy config
    - Artifact: `zuvo/proofs/AC4-legacy-load.txt`
  - AC5: `runRunner(config, runnerConfig)` — typecheck passes, runner starts with correct model from runnerConfig
    - Artifact: `zuvo/proofs/AC5-runner-signature.txt`
  - AC6: `isIgnoredFlowSnapshotPath(".phasedev/runner.yaml")` returns `true`
    - Artifact: `zuvo/proofs/AC6-allowlist.txt`
- [ ] Commit: `update runner.ts and run-flow-ralph.ts for Config + RunnerConfig separation`

---

### Task 4: Update cli.ts for new Config shape with legacy key mapping
**Files:** `src/cli.ts`, `src/features/cli-help/render-help.ts`
**Surface:** backend-logic, config
**Complexity:** standard
**Dependencies:** Task 1, Task 2

Updates the CLI to work with the new Config shape and handle legacy key deprecation.

- [ ] RED: Write tests for CLI config command:
  - `test/cli.test.ts` — add test block:
  - Assert `getConfigValue(config, "phases.change_intake.skills.main")` returns skills array
  - Assert `getConfigValue(config, "codex.stages.setup.skills.main")` returns same value with deprecation hint "use 'phases.change_intake'"
  - Assert `getConfigValue(config, "loop.runArchiveStage")` returns `config.runArchiveStage` value with deprecation hint
  - Assert `getConfigValue(config, "nonexistent.key")` returns `undefined`
  - Verify: `bun test test/cli.test.ts` — new tests fail
- [ ] GREEN: Update CLI:
  - **`src/cli.ts`:**
    - Import `loadConfig`, `Config`, `getConfigValue` directly from `entities/config/config` (not through the runner barrel)
    - `phasedev config <key>` command: only loads `config.yaml`, reads via `getConfigValue(config, key)` with legacy key mapping
    - `phasedev next` / `init` commands: continue to use `getStageSkillConfig` unchanged
  - **`src/entities/config/config.ts`:**
    - Update `getConfigValue(config, key)`: if key starts with `codex.stages.`, map to `phases.<mapped_stage>.<remaining>` with deprecation warning. If key starts with `codex.default.*` or `codex.sandboxMode` or `codex.approvalPolicy` → warn "This is a runner config key. Runner config is in runner.yaml." If key starts with `loop.` and matches `runArchiveStage`/`autoApprove` → map to root-level field with deprecation hint. If key starts with `loop.` and matches runner field → warn "This is a runner config key in runner.yaml."
    - Stage name mapping: use same `STAGE_NAME_MAP` constant from Task 1
  - **`src/features/cli-help/render-help.ts`:**
    - Fix old stage name in help example: `--expect-route setup` → `--expect-route change_intake`
  - **Note:** Existing `test/cli.test.ts` has old stage name assertions that will fail until Task 9. Task 4's Verify uses `--test-name-pattern`.
- [ ] Verify: `bun test --test-name-pattern "deprecation|getConfigValue" test/cli.test.ts`
  Expected: New deprecation tests pass
- [ ] Acceptance Proof:
  - AC-S3: `phasedev config codex.stages.implementation` returns value + deprecation hint "use 'phases.implementation'"
    - Artifact: `zuvo/proofs/ACS3-deprecation.txt`
- [ ] Commit: `update CLI config command with legacy key mapping and deprecation hints`

---

### Task 5: Update stage-control files for new Config shape
**Files:** `src/features/stage-control/skill-policy.ts`, `src/features/stage-control/get-next-prompt.ts`, `src/features/stage-control/phase-routing.ts`, `src/features/stage-control/archive-stage.ts`
**Surface:** backend-logic
**Complexity:** standard
**Dependencies:** Task 1

Updates the stage-control feature to use the new Config's `phases` accessor path instead of `codex.stages`.

- [ ] RED: Write compile-check tests:
  - Import `Config` from `entities/config/config` in each stage-control file
  - Assert `getStageSkillConfig(config, stage)` works with `config.phases[stage]` (not `config.codex.stages[stage]`)
  - Verify: `npm run typecheck` — fails if Config interface not properly consumed
- [ ] GREEN: Update stage-control files:
  - **`skill-policy.ts`:**
    - Change import of `Config` from `../../entities/config/config` (may already be correct — verify)
    - `getStageSkillConfig(config, stage)`: update access path from `config.codex.stages[stage]` to `config.phases[stage]`
    - No behavioral changes (DC-15) — same data, different access path
  - **`get-next-prompt.ts`:**
    - Verify import of `Config` is from `../../entities/config/config` (not through runner barrel)
    - Update access paths: `config.codex.stages` → `config.phases`
  - **`phase-routing.ts`:**
    - Same — update Config access paths
  - **`archive-stage.ts`:**
    - Same — update Config access paths (uses `config.phases`, `config.runArchiveStage`, `config.autoApprove`)
- [ ] Verify: `npm run typecheck`
  Expected: exit 0 — stage-control compiles with new Config shape
- [ ] Acceptance Proof:
  - DC-18: Internal `Config` uses `phases:` — verified by typecheck passing
    - Artifact: `zuvo/proofs/DC18-phases-typecheck.txt`
- [ ] Commit: `update stage-control access paths for new Config shape (phases)`

---

### Task 6: Update init-project.ts to create both config files
**Files:** `src/features/project-init/init-project.ts`
**Surface:** config
**Complexity:** standard
**Dependencies:** Task 1, Task 2

Updates project initialization to create both `config.yaml` and `runner.yaml`.

- [ ] RED: Write tests for dual-file init:
  - `test/config.test.ts` — add test block:
  - Assert `initProject(tempDir)` creates `.phasedev/config.yaml` AND `.phasedev/runner.yaml`
  - Assert both files parse without errors via `parseConfig` and `parseRunnerConfig`
  - Assert existing project without runner.yaml → only creates runner.yaml (config.yaml left untouched)
  - Assert project with both files exists → no-op (no overwrite)
  - Verify: `bun test test/config.test.ts` — new tests fail
- [ ] GREEN: Update init-project.ts:
  - Add import of `DEFAULT_RUNNER_CONFIG` from `features/runner/config`
  - After creating `config.yaml`, also create `.phasedev/runner.yaml` with runner defaults serialized via `stringify` / `yaml.stringify`
  - For existing projects: check if `runner.yaml` exists; if not, create it. Do NOT overwrite existing `config.yaml`
  - Use same `readInitialConfig()` / `writeProjectConfig()` pattern extended for runner
- [ ] Verify: `bun test test/config.test.ts`
  Expected: Dual-file init tests pass
- [ ] Acceptance Proof:
  - AC7: `phasedev init --project-path /tmp/test-project` creates `.phasedev/config.yaml` and `.phasedev/runner.yaml`; both parse without errors
    - Artifact: `zuvo/proofs/AC7-init-files.txt`
- [ ] Commit: `update init-project to create both config.yaml and runner.yaml`

---

### Task 7: Rename stage names in orchestrator SKILL.md
**Files:** `skills/phasedev-orchestrator/SKILL.md`
**Surface:** docs
**Complexity:** standard
**Dependencies:** Task 3 (validateSkillMdStageNames function used in Verify step)

Renames all old stage names in the orchestrator SKILL.md to new names per DC-3 mapping.

- [ ] RED: N/A — docs-only task. Verification via `validateSkillMdStageNames()` (Task 3) after rename.
- [ ] GREEN: Apply stage name mapping to SKILL.md:
  - `setup` → `change_intake`
  - `setup_approval` → `change_intake_approval`
  - `research` → `code_research`
  - `invalid_research` → `invalid_code_research`
  - `design` → `technical_design`
  - `invalid_design` → `invalid_technical_design`
  - `plan` → `iteration_planning`
  - `invalid_plan` → `invalid_iteration_planning`
  - `plan_approval` → `iteration_planning_approval`
  - `phase_validation` → `iteration_validation`
  - `repair` → `finding_repair`
  - **Important:** `implementation` does NOT change (confirmed in spec mapping)
  - **Important:** `final_validation` does NOT change (it's a real stage, confirmed in spec)
  - Be careful with word boundaries — replace only stage-name contexts, not prose references
  - Compound names (e.g., `setup_approval`) must be matched as whole tokens to avoid partial replacement
- [ ] Verify: `validateSkillMdStageNames("skills/phasedev-orchestrator/SKILL.md")` — no error
  Expected: All old names replaced, validation passes
- [ ] Acceptance Proof:
  - DC-14: SKILL.md contains no old stage names; `validateSkillMdStageNames()` passes
    - Artifact: `zuvo/proofs/DC14-skill-md-rename.txt`
- [ ] Commit: `rename stage names in orchestrator SKILL.md per DC-3 mapping`

---

### Task 8: Update config.test.ts for new config format
**Files:** `test/config.test.ts`
**Surface:** integration
**Complexity:** complex
**Dependencies:** Task 1, Task 6

Rewrites the config test file to use new `phases:` YAML fixtures and adds coverage for legacy migration, edge cases, and dual-file init.

- [ ] RED: N/A — test file rewrite, not test-first. Verify by running `bun test test/config.test.ts` after writing.
- [ ] GREEN: Rewrite `test/config.test.ts`:
  - Replace all old `codex:` / `loop:` YAML strings with `phases:` format
  - Replace all `config.codex.stages` / `config.loop.*` assertions with new access paths
  - Add test cases for:
    - `parseConfig` with `phases:` format (AC1)
    - `parseConfig` with legacy `codex.stages:` format — verifies deprecation warning AND correct mapping
    - `parseConfig` with BOTH formats — phases wins
    - `parseConfig` with empty/missing phases → `{}`
    - `parseConfig` with unknown phase keys → warning, not throw
    - `parseConfig` with missing `runArchiveStage`/`autoApprove` → defaults (true, false)
    - Legacy `getStageModelConfig` removal (these tests should be removed or moved to runner tests)
    - `loadConfig` integration tests with temp workspace (Task 1's dual-load behavior)
    - `initProject` dual-file creation (Task 6)
  - Remove tests for `getStageModelConfig` (moved to runner domain)
  - Remove tests for runner fields in Config (`loop.*`, `codex.default.*`, etc.)
- [ ] Verify: `bun test test/config.test.ts`
  Expected: All tests pass
- [ ] Acceptance Proof:
  - AC8 (partial): config.test.ts is clean — part of `bun test` pass
    - Artifact: `zuvo/proofs/AC8-config-tests.txt`
- [ ] Commit: `rewrite config.test.ts for new phases: format and legacy migration tests`

---

### Task 9: Update runner.test.ts and cli.test.ts
**Files:** `test/runner.test.ts`, `test/cli.test.ts`
**Surface:** integration
**Complexity:** complex
**Dependencies:** Task 3, Task 4

Updates the runner and CLI test files for new Config/RunnerConfig types and updated stage names.

- [ ] RED: N/A — test fixture update. Verify by running full test suite after changes.
- [ ] GREEN: Update test files:
  - **`test/runner.test.ts`:**
    - Update `makeConfig(overrides)` to produce new `Config` shape (without codex:/loop: wrappers)
    - Add `makeRunnerConfig(overrides)` helper to produce `RunnerConfig` for tests
    - Update all `runRunner()` calls to include `runnerConfig` as third parameter
    - Update assertions that access `config.codex.*`, `config.loop.*` to use new paths
    - Add tests for: RunnerConfig parsing, dual-config runRunner, isIgnoredFlowSnapshotPath
    - Remove tests for `getStageModelConfig` (dead code)
  - **`test/cli.test.ts`:**
    - Fix all old stage name assertions (lines ~458, 459, 505, 734, 735, 1037, 1039, 1093):
      - `current_stage: setup` → `current_stage: change_intake`
      - `route_kind: setup` → `route_kind: change_intake`
      - `--expect-route setup_approval` → `--expect-route change_intake_approval`
      - references to `research` → `code_research`
    - Update `writeConfig()` and `writeProjectConfig()` helpers to produce `phases:` format YAML
    - Add tests for `getConfigValue` with legacy key mapping and deprecation hints
    - Add tests for CLI working without runner.yaml (legacy mode compatibility)
- [ ] Verify: `bun test`
  Expected: exit 0 — full test suite passes
- [ ] Verify: `npm run typecheck`
  Expected: exit 0 — typecheck passes
- [ ] Acceptance Proof:
  - AC8: `bun test` — exit 0
    - Artifact: `zuvo/proofs/AC8-test-suite.txt`
  - AC9: `npm run typecheck` — exit 0
    - Artifact: `zuvo/proofs/AC9-typecheck.txt`
- [ ] Commit: `update runner.test.ts and cli.test.ts for Config/RunnerConfig separation`

---

## Whole-feature Smoke Proofs

- **SMOKE1 — Init → Config → Next полный цикл (новый формат)**
  - Preconditions: Temporary directory
  - Proof: `phasedev init --project-path /tmp/smoke-test && cd /tmp/smoke-test && phasedev config runArchiveStage && phasedev next`
  - Expected: Init creates both files; config outputs `true`; next completes (empty project may be blocked — expected)
  - Artifact: `zuvo/proofs/smoke-new-project.txt`
  - Maps to: Task 6 (init), Task 4 (config command)

- **SMOKE2 — Legacy проект без runner.yaml**
  - Preconditions: Temporary directory with old `config.yaml` (codex.stages.plan, loop.maxIterations, etc.)
  - Proof: `cd /tmp/smoke-legacy && phasedev config phases.iteration_planning && phasedev next`
  - Expected: Deprecation warning on load; `phasedev config phases.iteration_planning` outputs value; next works
  - Artifact: `zuvo/proofs/smoke-legacy.txt`
  - Maps to: Task 1 (legacy loadConfig), Task 4 (legacy key mapping)
