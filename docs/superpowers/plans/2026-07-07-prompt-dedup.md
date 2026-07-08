# Prompt & Orchestrator Skill Deduplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove duplication in `skills/phasedev-orchestrator/SKILL.md` and the `templates/*.md` phase prompts, and fix the misleading Important Rule 3 — without changing the meaning of any prompt contract or any flow behavior.

**Architecture:** Four independent waves, one commit each. SKILL.md is restructured in place (Waves 0–1). Template duplication is removed by extracting shared `const` partials in `src/features/phase-control/prompt-render-helpers.ts` and injecting them through the existing `renderPhaseTemplate` variable map (Waves 2–3) — the same pattern as `PATH_RESOLUTION_RULE` / `SELF_CHECK_FALLBACK`. Rendered-prompt equivalence is proven per wave by diffing the output of the existing `scripts/generate-agent-prompts.ts` generator before/after.

**Tech Stack:** TypeScript, Bun test, existing template renderer (`src/shared/templates/render-template.ts`).

**Spec:** `docs/superpowers/specs/2026-07-07-prompt-dedup-design.md`

## Global Constraints

- MANDATORY: invoke the `dev-core` skill before any code/doc edit in every task (CLAUDE.md hard gate). Every delegation prompt for a task must include this instruction.
- Wording-only change. The user approved intentional wording updates to prompt templates on 2026-07-07 (recorded in the spec). No routing, state, YAML-key, verdict, or approval semantics change.
- Allowed files: `skills/phasedev-orchestrator/SKILL.md`, `templates/phase1_change_intake.md`, `templates/phase2_code_research.md`, `templates/phase3_technical_design.md`, `templates/phase4_iteration_planning.md`, `templates/phase6a_iteration_validation.md`, `templates/phase6b_final_validation.md`, `src/features/phase-control/prompt-render-helpers.ts`, `test/cli.test.ts`. NO other `src/` file may change (spec SC6).
- Out of scope (spec Non-Goals): `templates/init.md`, `templates/feedback.md`, `templates/phase5_implementation.md`, `templates/phase6r_finding_repair.md`, `templates/phase7_archive.md`, `templates/validation_common.md`, `templates/artifacts/*`, all validators and routing code.
- One commit per wave; `bun test` and `npm run typecheck` green before each commit.
- `test/skill-md-drift.test.ts` must stay green: SKILL.md must keep at least one backticked `invalid_*` / `*_approval` token, and every such token must exist as a `kind:` in `src/features/phase-control/flow-route.ts`.
- Commit trailer for every commit:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- Snapshot tool: `bun run scripts/generate-agent-prompts.ts --project-path <dir> --out-dir <dir>` renders all phase prompts (files `00-init.md` … `09-stage-6-archive.md` under `<out-dir>/prompts/`). It self-seeds a sandbox; the `--project-path` dir may be empty. Do NOT modify this script.

## File Structure

| File | Responsibility in this change |
|---|---|
| `skills/phasedev-orchestrator/SKILL.md` | Waves 0–1: rule-3 fix, then full restructure (merged loop, single sub-agent prompt, cross-references) |
| `src/features/phase-control/prompt-render-helpers.ts` | Waves 2–3: new exported constants `SELF_CHECK_RETRY_RULE`, `POST_VERDICT_FEEDBACK_RULE`, `FORMATTING_POLICY_COMMON`, `APPROVAL_RULE`; wired into `renderPhaseTemplate`'s common variable map |
| `templates/phase1_change_intake.md` | Waves 2–3: `{{self_check_retry_rule}}`, `{{formatting_policy_common}}`, `{{approval_rule}}` |
| `templates/phase2_code_research.md` | Wave 2: `{{self_check_retry_rule}}` |
| `templates/phase3_technical_design.md` | Waves 2–3: `{{self_check_retry_rule}}`, `{{formatting_policy_common}}`, `{{approval_rule}}` |
| `templates/phase4_iteration_planning.md` | Wave 2: `{{self_check_retry_rule}}` |
| `templates/phase6a_iteration_validation.md` | Wave 2: `{{post_verdict_feedback_rule}}`, pointer sentence replacing the CLI-only summary bullet |
| `templates/phase6b_final_validation.md` | Wave 2: same two edits as 6A |
| `test/cli.test.ts` | Waves 2–3: characterization assertions pinning the shared rule text and the new pointer sentence in rendered prompts |

Verified before planning: none of the duplicated strings ("If the check fails, fix the reported…", "reports a defect after the verdict…", "one primary human language…", "grows beyond 7 items…", "approved: false` to `approved: true…", "catches every structural violation") is currently pinned by any test — the only test churn is the new assertions this plan adds.

---

### Task 1: Wave 0 — Fix misleading Important Rule 3 in SKILL.md

**Files:**
- Modify: `skills/phasedev-orchestrator/SKILL.md:281`

**Interfaces:**
- Consumes: nothing.
- Produces: corrected rule 3 text `**Sub-agents NEVER run \`phasedev advance\`** — only the orchestrator calls it, after sub-agents report passing self-checks.` (Task 2 rewrites the whole file and must carry this exact wording forward.)

- [ ] **Step 1: Invoke `dev-core`, then apply the single edit**

In `skills/phasedev-orchestrator/SKILL.md`, replace:

```markdown
3. **NEVER run `phasedev advance` yourself** — the orchestrator does.
```

with:

```markdown
3. **Sub-agents NEVER run `phasedev advance`** — only the orchestrator calls it, after sub-agents report passing self-checks.
```

No other change in this task.

- [ ] **Step 2: Run the drift test and confirm only SKILL.md changed**

Run: `bun test test/skill-md-drift.test.ts`
Expected: PASS (1 test).
Run: `git diff --stat`
Expected: exactly one file changed, `skills/phasedev-orchestrator/SKILL.md`, 1 insertion / 1 deletion.

- [ ] **Step 3: Run full suite and typecheck**

Run: `bun test && npm run typecheck`
Expected: all tests PASS, typecheck exits 0.

- [ ] **Step 4: Commit**

```bash
git add skills/phasedev-orchestrator/SKILL.md
git commit -m "fix: SKILL.md rule 3 - advance ban addresses sub-agents, not the orchestrator

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Wave 1 — SKILL.md compression

**Files:**
- Modify: `skills/phasedev-orchestrator/SKILL.md` (full-content replacement)

**Interfaces:**
- Consumes: rule-3 wording from Task 1 (already merged into the new content below).
- Produces: restructured SKILL.md with sections `## Command Invocation (mandatory)`, `## The Loop`, `## Sub-Agent Spawning`, `## Invalid-artifact recovery policy`, `## Auto-Approval` — Tasks 3–4 do not depend on it, but the drift test and orchestrator behavior do.

- [ ] **Step 1: Invoke `dev-core`, then replace the entire content of `skills/phasedev-orchestrator/SKILL.md` with the following**

````markdown
---
name: phasedev-orchestrator
description: PhaseDev AI Framework orchestrator. Thin loop controller that spawns dedicated sub-agents for each PhaseDev phase. No phase work is done by the main agent itself.
---

# PhaseDev Orchestrator — AI Flow Controller for PhaseDev Framework

## Overview

The **PhaseDev Orchestrator** transforms the main agent into a strict **flow controller** that delegates every PhaseDev phase — change_intake, code_research, technical_design, iteration_planning, implementation, validation, finding_repair, archive — to a dedicated sub-agent.

The orchestrator is intentionally **thin**:
- It uses `phasedev check` to validate the active phase, `phasedev advance` to switch phases, and spawns sub-agents for phase work.
- It does **not** execute phase contracts, collect context, validate artifacts, fix invalid artifacts, or pass data between phases. Artifact creation, self-validation, and self-repair belong to the owning sub-agent.

```
┌──────────────────────────────────────┐
│           Main Agent                 │
│     (PhaseDev Flow Controller)       │
│  LOOP:                               │
│  1. phasedev check → phase valid?    │
│  2. advance or spawn sub-agents      │
│  3. verify phase switched            │
└──────────────────────────────────────┘
```

## When to Use

- Running the full PhaseDev flow with strict phase separation and isolated context per phase.
- Large projects where a single context cannot hold all phases of the flow.

## How to Invoke

```
$phasedev-orchestrator [goal description]
```

If a goal is provided, it is passed to the first `change_intake` sub-agent. Otherwise the orchestrator resumes from the current PhaseDev state.

**Goal injection:** for the first `change_intake` sub-agent only, prepend the goal description to the prompt as intake context (the change_intake contract expects task/change intake). For every later phase, pass no goal — sub-agents read artifact files directly.

## Command Invocation (mandatory)

`phasedev` is a **globally installed CLI** on `PATH`. Always invoke it directly as `phasedev <command>` — e.g. `phasedev create-change`, `phasedev phase`, `phasedev check`, `phasedev advance`, `phasedev approve`, `phasedev config <key>`. **NEVER** wrap it in `npx`, `bunx`, `npm exec`, `npm run`, `bun run`, or `bun run src/cli.ts`. There is nothing to resolve and no fallback to try (except when the phase controller's self-check fallback block provides explicit alternatives — in that case, follow the controller's instructions). This applies to the orchestrator and to every sub-agent prompt.

**Core orchestrator commands:**
- `phasedev create-change <name>` — create a change directory with `state.json` (`activePhase: change_intake`). Run once before the first `phase`.
- `phasedev phase` — print the contract for the active phase (read-only, idempotent). The same contract is returned for all sub-agents until `advance` is called.
- `phasedev check [--phase <name>]` — validate artifacts of the active phase (or `--phase` override). Returns OK or issues list.
- `phasedev advance` — validate active phase, compute next phase via `resolveRoute`, and switch `state.json`. Refuses on invalid/approval/blocked. Single mutation point for flow state.
- `phasedev approve <file>` — set `approved: true` and `approved_by` in an artifact's YAML frontmatter. Used for auto-approval (see [Auto-Approval](#auto-approval)).
- `phasedev add-finding "<finding>" <severity> --required-fix <text> [--class <class>] [--iteration <label>]` — append a finding row to validation_findings.md. Allocates the ID automatically, creates the file when missing, and corrects the YAML `verdict` (e.g. ready -> repair_required for an open MUST-FIX). The ONLY way to add a finding; never hand-edit the findings registry.
- `phasedev feedback` — print the user-feedback processing contract for a sub-agent.
- `phasedev status` — print a summary of the current flow state (active change, phase, artifacts, iteration statuses, validation findings).
- `phasedev config <key>` — read config values.

Sub-agent-facing findings commands (`reopen-finding`, `resolve-finding`, `set-verdict`) are documented by `phasedev help` and the phase contracts; the orchestrator does not run them itself.

All commands run from the **project root** (the current working directory). `phasedev` defaults to `process.cwd()`, so `--project-path` is omitted everywhere in this skill.

## Initialization

Before the loop, create the change (one time) and read orchestrator-safe settings:

```bash
phasedev create-change <name>
```
→ Create a change directory with `state.json` (`activePhase: change_intake`). Derive `<name>` from the user's goal (slugify). This must be done **before** the first `phase`. Subsequent invocations in the same change skip this step.

```bash
phasedev config maxIterations
```
→ Safety iteration limit. Default to **10** if empty/invalid. Stop with "Max iterations reached" when reached.

```bash
phasedev config maxRepairCycles
```
→ Safety limit for consecutive repair cycles without progress. Default to **3** if empty/invalid.

```bash
phasedev config runArchiveStage
```
→ Remember for [Archive Handling](#archive-handling).

```bash
phasedev config autoApprove
```
→ Default to `false` if empty/invalid. Remember for [Auto-Approval](#auto-approval).

## The Loop

Each iteration:

1. **Validate active phase:** `phasedev check` — is the active phase ready to advance? (checks artifact validity; approval is not checked here)
2. **Advance or work:**
   - If `check` returns OK → run `phasedev advance`. If advance succeeds, the phase switched — spawn sub-agents on the **new** phase.
   - If `check` returns issues, or advance refuses with `invalid_*` (artifact issues), `*_approval` (needs approval), or `archive_readiness_blocked` (iterations not complete) → spawn sub-agents on the **current** active phase.
3. **Verify:** when all sub-agents for the phase have reported with passing self-checks, run `phasedev advance`. If it accepts, loop from step 1. If it refuses, handle per [Auto-Approval](#auto-approval), [Invalid-artifact recovery policy](#invalid-artifact-recovery-policy), or [Termination](#termination).

**N sub-agents per phase is dynamic.** How many sub-agents (1 or more) to spawn is exclusively the orchestrator's decision, made per-phase per-change — there is no framework-level binding between phases and agent counts or agent types. Sub-agents run **sequentially**; each one reads the same phase contract itself via `phasedev phase` (the orchestrator does not transmit the contract text), works on its assigned portion, self-validates with `phasedev check`, and reports. The framework guarantees only the invariant: `phasedev phase` returns the same contract for every sub-agent until `advance` is called — this lock enables N sequential agents on any phase.

What NOT to do:
- **Do not introduce** any phase→agent-count or phase→agent-type table, and do not hardcode per-phase counts ("for design — 3 agents").
- **Do not add** min/max agent limits per phase in config, code, or SKILL.md — the dynamic per-change decision must never become a static framework rule.

## Sub-Agent Spawning

For every executable phase, spawn a dedicated sub-agent via the `Agent` tool. Never execute phase work in the main agent.

**Agent type selection:** The orchestrator decides which agent type best suits each phase. Check the available agent types in the environment — if a custom user agent (e.g. a project-specific agent defined in `.claude/agents/` or listed in the available agent types) is a better fit for the current phase than the default general-purpose agent, pass its name as `subagent_type`. This lets project teams define specialized agents with their own system prompts, tools, and model preferences for each phase, while the orchestrator picks the right one per phase at runtime.

**Sub-agent prompt** (the single canonical prompt; the goal line and the role line are optional slots):

```javascript
Agent(
  description: "<phase-name>: execute phase contract",
  prompt: `Execute the current PhaseDev phase (run from the project root).

<goal description — CHANGE_INTAKE PHASE ONLY; omit this line for every other phase>

<Your role: <Architect | API Designer | Code Reviewer | DB Designer | ...>. The contract describes the ENTIRE phase; your role covers only your part — do not do others' work. — OPTIONAL ROLE LINE; omit for single-agent phases>

phasedev is a GLOBAL CLI. Invoke it directly as "phasedev <command>". NEVER use npx, bunx, npm exec, npm run, bun run, or bun run src/cli.ts to launch it — just run "phasedev ...".

1. Run command: phasedev phase — get the active phase contract.
2. Work on the artifacts of the active phase according to your role and the contract.
3. Self-validate before reporting (mandatory): run phasedev check. If it fails, read the reported issues, fix the artifact, and rerun phasedev check until it passes. You create the artifact — you validate it; the orchestrator does not validate artifacts for you.
4. Do NOT report the phase as complete while the self-check is failing or has not been run. If it cannot pass after you fix the artifact, report a blocker with the exact failing command and output.
5. Do NOT run phasedev advance — that is the orchestrator's job. Only the self-check command (phasedev check) may be rerun.
6. Report: the phase completed, the EXACT self-check command and its final result (PASS/FAIL), and any blockers.`
)
```

That is the entire prompt — no context collection, no artifact paths, no previous phase data, and no embedded `phasedev phase` output (every sub-agent runs it itself; this keeps the orchestrator's context thin). The contract already contains artifact templates, allowlist, configured skill policy if present, and the mandatory self-check. Artifact self-validation is the sub-agent's duty: the orchestrator only checks the phase state via `phasedev check`; it never inspects, judges, or fixes artifact content. A report without a passing self-check result is an incomplete phase; if `phasedev check` returns issues after a sub-agent reported "complete", that sub-agent skipped its self-check — apply the [Invalid-artifact recovery policy](#invalid-artifact-recovery-policy), not a silent re-spawn loop.

## User Feedback Handling

At any STOP point (approval gate, `archive_ready` with `runArchiveStage=false`, blocker, or after user interrupt), the user may give feedback — a correction, a new requirement, a bug report, or a rejection of the current output.

**Fast path (no sub-agent).** When the feedback is a concrete, already-formulated implementation defect ("here is a bug, put it into the findings"), do NOT spawn a sub-agent. Record it yourself with a single deterministic call (same precedent as Auto-Approval — a controller operation without interpretation):

```bash
phasedev add-finding "<defect summary>" MUST-FIX --required-fix "<required fix>" --class implementation
```

Command semantics (auto-ID, file creation, verdict correction) are defined in the `add-finding` entry under [Command Invocation](#command-invocation-mandatory). Then continue the loop — `phasedev advance` routes to finding_repair where the fix is implemented. Never hand-edit the findings registry and never edit repository code to handle feedback.

**Delegated path (feedback needs analysis).** When it is unclear whether the feedback is an implementation defect or a scope/design/plan change, or it is mixed, spawn a dedicated sub-agent:

```javascript
Agent(
  description: "process user feedback on PhaseDev change",
  prompt: `The user has feedback on the current PhaseDev change.

Feedback: <user's full feedback text>

phasedev is a GLOBAL CLI. Invoke it directly as "phasedev <command>".

Run: phasedev feedback — and follow the printed contract exactly. It defines how to classify the feedback, which phasedev commands to use, and the write boundary.
Do NOT run phasedev advance — the orchestrator continues the loop after you finish.
Report: recorded finding IDs, changed artifacts and their approval status, and the result of phasedev check.`
)
```

After the fast path or the sub-agent return, run `phasedev check` and continue the main loop from that state — `phasedev check` will guide the next action (e.g. `finding_repair` if findings were added, approval gate if approvals were reset, iteration work if a phase is active).

The same mechanism applies whether the orchestrator stopped at an approval gate, before archive, or after user interrupt. It also applies when a new session starts and the user says "I have feedback on this change" — the orchestrator runs `phasedev check` to determine the current state, then uses the fast path or the feedback sub-agent instead of the normal phase spawn.

**No special state needed.** The framework's existing flow handles the rest.

## Invalid-artifact recovery policy

One of the artifact-invalid routes (`invalid_prd`, `invalid_execution_contract`, `invalid_code_research`, `invalid_technical_design`, `invalid_iteration_planning`, `invalid_findings`) means the owning phase's sub-agent reported completion without a passing self-check (or the state was already broken on resume: human edit, crashed session). `invalid_archive_state` is NOT included here — it is always a STOP. The orchestrator does NOT validate or fix the artifact; it gives the owning sub-agent exactly **one** recovery attempt:

1. Spawn ONE sub-agent for the owning phase. Instruct it: run `phasedev phase` to get the fix contract (it lists the issues), fix the artifact, then run `phasedev check` until it passes. Do NOT run `phasedev advance`. Verify with `phasedev check` only, then report back.
2. After it returns, call `phasedev check`:
   - Phase valid → continue the loop.
   - Same phase still invalid → **STOP**. Report "Sub-agent failed to self-validate `<artifact>` after one recovery attempt" with the issues. Do not spawn again.
3. Never turn this into a loop — the orchestrator is not the validation driver.

## Auto-Approval

When `phasedev config autoApprove` (from Initialization) is `true`, the orchestrator automatically approves change_intake, technical_design, and iteration_planning artifacts at approval gates instead of stopping to ask the user.

**How it works for each approval gate:**

When `phasedev advance` refuses with an `*_approval` refusal:
- `change_intake_approval` → Run `phasedev approve prd.md --by "PhaseDev Orchestrator"` and `phasedev approve execution_contract.md --by "PhaseDev Orchestrator"`, then retry `phasedev advance`.
- `technical_design_approval` → Run `phasedev approve design.md --by "PhaseDev Orchestrator"`, then retry `phasedev advance`.
- `iteration_planning_approval` → Run `phasedev approve iteration_plan.md --by "PhaseDev Orchestrator"`, then retry `phasedev advance`.

**Auto-approve procedure (use `phasedev approve` instead of spawning a sub-agent):**

1. Run `phasedev approve <file>` for each approval artifact (from the project root; filenames auto-resolve to the active change directory).
2. Run `phasedev advance` to move past the approval gate.
3. If advance succeeds → continue the main loop normally.
4. If advance still refuses with the same `*_approval` → **STOP**. Report "Auto-approve failed to advance after approving artifacts." Do not loop.

## Termination

Stop when any is met:
- **Flow complete** — `phasedev advance` returns `finished=true` (archive phase completion). The archive `state.json` has `activePhase: archive` and `.phase-archive.json` has `status: completed`. The orchestrator stops and reports success.
- **Blocked** — approval gate, blocker, or invalid state. Approval gates (`change_intake_approval`, `technical_design_approval`, `iteration_planning_approval`): when `autoApprove` is true, follow [Auto-Approval](#auto-approval); otherwise tell the user to approve and wait.
- **No progress** — after sub-agents, `phasedev advance` still refuses with the same reason; for a repeated `invalid_*` this is the stop step of the [Invalid-artifact recovery policy](#invalid-artifact-recovery-policy).
- **Max iterations** — `maxIterations` reached.
- **Repair cycle limit** — advance refuses with "Repair cycle limit reached"; manual intervention or a higher maxRepairCycles in config.yaml is required.
- **Unrecoverable error** — sub-agent error after one retry.
- **User interrupt**.

## Archive Handling

Archive is entered when `phasedev advance` transitions to the archive phase (after final validation passes and all iterations are `[x]`). The archive phase contract is printed via `phasedev phase`.

1. Check the `runArchiveStage` value from Initialization before calling `advance`. If `false`, **do not call advance** — stop and report:
   > "Archive execution is paused by config (runArchiveStage=false). Set runArchiveStage=true in config.yaml to enable archive."
2. If `true`, call `phasedev advance`. It performs the archive mutation (moves the change directory to `.phasedev/changes/archive/`, creates `.phase-archive.json` with `status: "in_progress"`), and switches `state.json` to `activePhase: archive`.
3. Spawn an archive sub-agent that reads the archive contract via `phasedev phase`, writes delta specs, and sets `.phase-archive.json` `status: "completed"`.
4. After the sub-agent returns, call `phasedev advance`:
   - If it returns `finished=true` → the archive is complete → **flow complete** → STOP.
   - If it refuses ("Archive not complete") → sub-agent did not finish → no-progress → STOP and report.

## Error Handling

| Error | Action |
|-------|--------|
| Sub-agent error / timeout / API error | Retry once. If it fails again, stop and report. |
| Sub-agent reports a blocker | Run `phasedev check`. If still same phase issues → stop, report block reason. |
| `invalid_*` after sub-agent reported "complete" | Apply the [Invalid-artifact recovery policy](#invalid-artifact-recovery-policy). |
| `phasedev advance` refuses unexpectedly | Check the refusal message. If `*_approval` and autoApprove is enabled, follow [Auto-Approval](#auto-approval). Otherwise stop and report. |

## Important Rules

1. **NEVER execute phase work directly** — always spawn a sub-agent via `Agent`.
2. **ALWAYS invoke `phasedev` directly as a global command** — per [Command Invocation](#command-invocation-mandatory); restate the ban in every sub-agent prompt.
3. **Sub-agents NEVER run `phasedev advance`** — only the orchestrator calls it, after sub-agents report passing self-checks.
4. **ALWAYS use `phasedev check` to validate the active phase** — never read `.phasedev/` files directly.
5. **ALWAYS use `phasedev config` to read settings** — never read `config.yaml` directly.
6. **NEVER validate or fix phase artifacts yourself** — the owning sub-agent creates, self-checks, and self-heals each artifact; on `invalid_*` after "complete", apply the [Invalid-artifact recovery policy](#invalid-artifact-recovery-policy).
7. **NEVER pass context between phases** — sub-agents read artifact files directly; the filesystem is the durable state.
8. **NEVER re-describe phase contracts** — sub-agents get them from `phasedev phase`.
9. **NEVER log iterations to `.phasedev/logs/`** — the orchestrator is ephemeral; state is visible in chat.
10. **Report clearly** — after each iteration: phase completed, the sub-agent's self-check result, and the next phase `phasedev check` reports.
````

- [ ] **Step 2: Read-through check — every original imperative survives**

Compare the new file against `git show HEAD:skills/phasedev-orchestrator/SKILL.md` and confirm each original MUST/NEVER is still present (moved, referenced, or verbatim). Checklist:

- npx/bunx/npm exec/npm run/bun run ban: in Command Invocation AND inside the sub-agent prompt text AND rule 2 pointer.
- "Never execute phase work in the main agent" (Sub-Agent Spawning + rule 1).
- Sub-agent numbered steps 1–6 identical to the old "Base sub-agent prompt" steps.
- Optional role line preserves "The contract describes the ENTIRE phase; your role covers only your part — do not do others' work."
- Goal injection only for change_intake (How to Invoke + prompt slot).
- Dynamic-N invariant + sequential sub-agents + "same contract until advance" lock (The Loop).
- What-NOT-to-do: no phase→count/type table; no min/max limits; no static rule (2 bullets).
- Advance-refusal dispatch: `invalid_*` / `*_approval` / `archive_readiness_blocked` → current phase; success → new phase (Loop step 2).
- Recovery policy: exactly one attempt, then STOP; never a loop; `invalid_archive_state` excluded.
- Auto-approval gates and per-gate approve commands unchanged.
- Feedback fast path command + "Never hand-edit the findings registry and never edit repository code" preserved.
- "No context transmission" / "sub-agent owns validation" / "do not embed phasedev phase output" (paragraph after the prompt).
- Archive steps 1–4 unchanged, including the runArchiveStage=false stop message.
- Termination list: all 7 stop conditions present.

- [ ] **Step 3: Verify drift test and length reduction**

Run: `bun test test/skill-md-drift.test.ts`
Expected: PASS — the file keeps backticked tokens `invalid_prd`, `invalid_execution_contract`, `invalid_code_research`, `invalid_technical_design`, `invalid_iteration_planning`, `invalid_findings`, `invalid_archive_state`, `change_intake_approval`, `technical_design_approval`, `iteration_planning_approval`.

Run: `git show HEAD:skills/phasedev-orchestrator/SKILL.md | wc -w && wc -w skills/phasedev-orchestrator/SKILL.md`
Expected: new word count ≤ 70% of old (spec SC1: ≥30% reduction). If not, trim further within the sections above (never by dropping an imperative from Step 2's checklist).

- [ ] **Step 4: Full suite, typecheck, and scope check**

Run: `bun test && npm run typecheck`
Expected: all PASS.
Run: `git diff --stat`
Expected: only `skills/phasedev-orchestrator/SKILL.md` changed (rendered phase prompts untouched by construction).

- [ ] **Step 5: Commit**

```bash
git add skills/phasedev-orchestrator/SKILL.md
git commit -m "docs: compress phasedev-orchestrator SKILL.md - single loop, single sub-agent prompt, cross-references

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Wave 2 — Shared self-check retry & post-verdict feedback partials, 6A/6B pointer

**Files:**
- Modify: `src/features/phase-control/prompt-render-helpers.ts:64-95`
- Modify: `templates/phase1_change_intake.md:64`, `templates/phase2_code_research.md:53`, `templates/phase3_technical_design.md:131`, `templates/phase4_iteration_planning.md:72`
- Modify: `templates/phase6a_iteration_validation.md:35,57`, `templates/phase6b_final_validation.md:41,59`
- Test: `test/cli.test.ts` (new assertions; focused run `bun test test/cli.test.ts test/config.test.ts`)

**Interfaces:**
- Consumes: `renderPhaseTemplate(phase, templateName, variables, config)` and the existing constant-injection pattern (`PATH_RESOLUTION_RULE`, `SELF_CHECK_FALLBACK`) in `prompt-render-helpers.ts`.
- Produces: exported constants `SELF_CHECK_RETRY_RULE: string` and `POST_VERDICT_FEEDBACK_RULE: string`; template variables `{{self_check_retry_rule}}` and `{{post_verdict_feedback_rule}}` available in ALL phase templates (Task 4 adds two more variables to the same map).

- [ ] **Step 1: Invoke `dev-core`, snapshot rendered prompts at HEAD**

```bash
SNAP="/private/tmp/claude-501/-Users-oleksandr-WORK-ag-dev-flow/eb2367b3-1475-4a49-a9fa-a4926ddedb93/scratchpad/dedup-snap-w2"
mkdir -p "$SNAP/proj"
bun run scripts/generate-agent-prompts.ts --project-path "$SNAP/proj" --out-dir "$SNAP/before"
ls "$SNAP/before/prompts"
```
Expected: exit 0; files `00-init.md` … `09-stage-6-archive.md`.

- [ ] **Step 2: Write the characterization/pointer assertions (test-first)**

In `test/cli.test.ts`, inside the test `"artifact stage prompts include immediate self-check routes"`, after the line `expect(output).toContain("Artifact Build Contract: execution_contract.md");`, add:

```typescript
    expect(output).toContain("If the check fails, fix the reported artifact issues in this same phase, then rerun the same command. Repeat until it exits successfully. Do not ask the user to approve `prd.md` or `execution_contract.md` until this self-check passes.");
    expect(output).not.toContain("{{self_check_retry_rule}}");
```

In the test `"prompt generator renders plan prompt from isolated generated sandbox"`, after the line `expect(phaseValidationPrompt).toContain("verdict: <set_after_review>");`, add:

```typescript
    for (const validationPrompt of [phaseValidationPrompt, finalValidationPrompt]) {
      expect(validationPrompt).toContain("Record the validation result in [validation_findings.md](");
      expect(validationPrompt).toContain("per the Common Validation Contract and the embedded Artifact Build Contract below.");
      expect(validationPrompt).not.toContain("using only the embedded Artifact Build Contract for structure");
      expect(validationPrompt).toContain("If the user reports a defect after the verdict is written and before `phasedev advance`, do not edit repository code and do not delegate a code task");
      expect(validationPrompt).not.toContain("{{post_verdict_feedback_rule}}");
    }
```

- [ ] **Step 3: Run the focused tests to verify the new pointer assertions fail**

Run: `bun test test/cli.test.ts`
Expected: FAIL — the generator test fails on `Record the validation result in` (old templates still carry the long CLI-only sentence); the change_intake retry-rule assertion already passes (characterization).

- [ ] **Step 4: Add the two constants and wire them into `renderPhaseTemplate`**

In `src/features/phase-control/prompt-render-helpers.ts`, after the `SELF_CHECK_FALLBACK` constant, add:

```typescript
export const SELF_CHECK_RETRY_RULE =
  "If the check fails, fix the reported artifact issues in this same phase, then rerun the same command. Repeat until it exits successfully.";

export const POST_VERDICT_FEEDBACK_RULE =
  "- If the user reports a defect after the verdict is written and before `phasedev advance`, do not edit repository code and do not delegate a code task: record it with `phasedev add-finding \"<finding>\" <severity> --required-fix <text> --class <class>` (the command corrects the verdict automatically), then run `phasedev advance` — the flow will route to finding_repair where the fix is implemented.";
```

In the same file, inside `renderPhaseTemplate`, after the line `self_check_fallback: SELF_CHECK_FALLBACK,`, add:

```typescript
    self_check_retry_rule: SELF_CHECK_RETRY_RULE,
    post_verdict_feedback_rule: POST_VERDICT_FEEDBACK_RULE,
```

- [ ] **Step 5: Replace the duplicated template paragraphs with placeholders**

Each edit replaces one full line. The retry-rule constant carries the shared two sentences; the phase-specific final clause stays inline.

`templates/phase1_change_intake.md` — replace:
```
If the check fails, fix the reported artifact issues in this same phase, then rerun the same command. Repeat until it exits successfully. Do not ask the user to approve `prd.md` or `execution_contract.md` until this self-check passes.
```
with:
```
{{self_check_retry_rule}} Do not ask the user to approve `prd.md` or `execution_contract.md` until this self-check passes.
```

`templates/phase2_code_research.md` — replace:
```
If the check fails, fix the reported artifact issues in this same phase, then rerun the same command. Repeat until it exits successfully. Report `Research ready` only after this self-check passes.
```
with:
```
{{self_check_retry_rule}} Report `Research ready` only after this self-check passes.
```

`templates/phase3_technical_design.md` — replace:
```
If the check fails, fix the reported artifact issues in this same phase, then rerun the same command. Repeat until it exits successfully. Do not ask the user to approve `architecture/design.md` until this self-check passes.
```
with:
```
{{self_check_retry_rule}} Do not ask the user to approve `architecture/design.md` until this self-check passes.
```

`templates/phase4_iteration_planning.md` — replace:
```
If the check fails, fix the reported artifact issues in this same phase, then rerun the same command. Repeat until it exits successfully. Do not ask the user to approve `iteration_plan.md` until this self-check passes.
```
with:
```
{{self_check_retry_rule}} Do not ask the user to approve `iteration_plan.md` until this self-check passes.
```

In BOTH `templates/phase6a_iteration_validation.md` and `templates/phase6b_final_validation.md` — replace the identical trailing bullet:
```
- If the user reports a defect after the verdict is written and before `phasedev advance`, do not edit repository code and do not delegate a code task: record it with `phasedev add-finding "<finding>" <severity> --required-fix <text> --class <class>` (the command corrects the verdict automatically), then run `phasedev advance` — the flow will route to finding_repair where the fix is implemented.
```
with:
```
{{post_verdict_feedback_rule}}
```

In BOTH `templates/phase6a_iteration_validation.md` and `templates/phase6b_final_validation.md` — replace the identical summary bullet (spec 2.3; the referenced Common Validation Contract and Artifact Build Contract remain embedded in the same rendered prompt via `{{validation_common_contract}}` and `{{validation_findings_artifact_contract}}`):
```
- Write validation result to [validation_findings.md]({{findings_path}}) using only the embedded Artifact Build Contract for structure, record rows and the verdict only through the phasedev findings commands (add-finding / resolve-finding / reopen-finding / set-verdict); `phasedev check-validation` catches every structural violation.
```
with:
```
- Record the validation result in [validation_findings.md]({{findings_path}}) per the Common Validation Contract and the embedded Artifact Build Contract below.
```

- [ ] **Step 6: Run focused tests to verify they pass**

Run: `bun test test/cli.test.ts test/config.test.ts`
Expected: PASS (including the Step 2 assertions).

- [ ] **Step 7: Snapshot after and diff — only the 6A/6B pointer sentence may change**

```bash
bun run scripts/generate-agent-prompts.ts --project-path "$SNAP/proj" --out-dir "$SNAP/after"
for f in "$SNAP/before/prompts/"*.md; do
  b="$(basename "$f")"
  diff -u <(sed "s|$SNAP/before|@OUT@|g" "$f") <(sed "s|$SNAP/after|@OUT@|g" "$SNAP/after/prompts/$b") \
    && echo "IDENTICAL $b" || echo "CHANGED $b"
done
```
Expected: `IDENTICAL` for every file EXCEPT `06-stage-5a-phase-validation.md` and `07-stage-5b-final-validation.md`, whose only diff hunk is the old "Write validation result to …" bullet → the new "Record the validation result in …" bullet. Any other diff line is a regression — fix the constant/template until the diff matches. (If the runs straddle midnight, regenerate both snapshots on the same day.)

- [ ] **Step 8: Full suite and typecheck**

Run: `bun test && npm run typecheck`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add src/features/phase-control/prompt-render-helpers.ts templates/phase1_change_intake.md templates/phase2_code_research.md templates/phase3_technical_design.md templates/phase4_iteration_planning.md templates/phase6a_iteration_validation.md templates/phase6b_final_validation.md test/cli.test.ts
git commit -m "refactor: shared self-check retry and post-verdict feedback partials in phase templates

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Wave 3 — Shared formatting-policy and approval-rule partials (phase1/phase3)

**Files:**
- Modify: `src/features/phase-control/prompt-render-helpers.ts` (two constants + two map entries, next to Task 3's)
- Modify: `templates/phase1_change_intake.md:48,76-77`
- Modify: `templates/phase3_technical_design.md:89,100,103`
- Test: `test/cli.test.ts` (one new test)

**Interfaces:**
- Consumes: `renderPhaseTemplate` variable map extended in Task 3; cli.test.ts local helpers `runNext()`, `writeApproved(filePath, body)`, `validPrdBody()`, `validRulesBody()`, `validResearchBody()`, and the `testTmpDir` fixture.
- Produces: exported constants `FORMATTING_POLICY_COMMON: string`, `APPROVAL_RULE: string`; template variables `{{formatting_policy_common}}`, `{{approval_rule}}`.

- [ ] **Step 1: Invoke `dev-core`, snapshot rendered prompts at current HEAD**

```bash
SNAP="/private/tmp/claude-501/-Users-oleksandr-WORK-ag-dev-flow/eb2367b3-1475-4a49-a9fa-a4926ddedb93/scratchpad/dedup-snap-w3"
mkdir -p "$SNAP/proj"
bun run scripts/generate-agent-prompts.ts --project-path "$SNAP/proj" --out-dir "$SNAP/before"
```
Expected: exit 0.

- [ ] **Step 2: Write the failing test**

In `test/cli.test.ts`, immediately after the test `"artifact stage prompts include immediate self-check routes"`, add:

```typescript
  test("phase1 and phase3 prompts share common formatting and approval rules", () => {
    const intakeOutput = runNext();
    const commonRules = [
      "Use one primary human language for artifact prose; keep code identifiers, file paths, commands, and source terms in their original form.",
      "If a list grows beyond 7 items, group it by meaningful categories instead of using one long flat list.",
      "The AI agent must not change `approved: false` to `approved: true`; approval is performed by the user."
    ];
    for (const rule of commonRules) {
      expect(intakeOutput).toContain(rule);
    }

    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    fs.mkdirSync(changeDir, { recursive: true });
    writeApproved(path.join(changeDir, "prd.md"), validPrdBody());
    writeApproved(path.join(changeDir, "execution_contract.md"), validRulesBody());
    fs.writeFileSync(path.join(changeDir, "research_facts.md"), validResearchBody(), "utf-8");

    const designOutput = runNext();
    expect(designOutput).toContain("Phase 3.");
    for (const rule of commonRules) {
      expect(designOutput).toContain(rule);
    }
    expect(designOutput).not.toContain("{{formatting_policy_common}}");
    expect(designOutput).not.toContain("{{approval_rule}}");
  });
```

- [ ] **Step 3: Run it to verify it fails**

Run: `bun test test/cli.test.ts -t "share common formatting and approval rules"`
Expected: FAIL — `designOutput` does not contain `The AI agent must not change` (phase3 currently spells it lowercase: "the AI agent must not change…").

- [ ] **Step 4: Add the constants and map entries**

In `src/features/phase-control/prompt-render-helpers.ts`, after `POST_VERDICT_FEEDBACK_RULE`, add:

```typescript
export const FORMATTING_POLICY_COMMON = [
  "- Use one primary human language for artifact prose; keep code identifiers, file paths, commands, and source terms in their original form.",
  "- If a list grows beyond 7 items, group it by meaningful categories instead of using one long flat list."
].join("\n");

export const APPROVAL_RULE =
  "- The AI agent must not change `approved: false` to `approved: true`; approval is performed by the user.";
```

In `renderPhaseTemplate`, after `post_verdict_feedback_rule: POST_VERDICT_FEEDBACK_RULE,`, add:

```typescript
    formatting_policy_common: FORMATTING_POLICY_COMMON,
    approval_rule: APPROVAL_RULE,
```

- [ ] **Step 5: Edit the two templates**

`templates/phase1_change_intake.md`:

Replace (Artifact requirements bullet):
```
- The AI agent must not change `approved: false` to `approved: true`; approval is performed by the user.
```
with:
```
{{approval_rule}}
```

Replace the two adjacent Formatting rules bullets:
```
- Use one primary human language for artifact prose; keep code identifiers, file paths, commands, and source terms in their original form.
- If a list grows beyond 7 items, group it by meaningful categories instead of using one long flat list.
```
with:
```
{{formatting_policy_common}}
```

`templates/phase3_technical_design.md`:

Replace (Constraints bullet — note the intentional lowercase→uppercase normalization, an approved wording update):
```
- the AI agent must not change `approved: false` to `approved: true`; approval is performed by the user.
```
with:
```
{{approval_rule}}
```

Replace (Formatting rules, first duplicated bullet):
```
- Use one primary human language for artifact prose; keep code identifiers, file paths, commands, and source terms in their original form.
```
with:
```
{{formatting_policy_common}}
```

Delete the second duplicated bullet three lines below (this moves the 7-items rule two positions earlier in phase3's rendered list — reorder only, no rule lost):
```
- If a list grows beyond 7 items, group it by meaningful categories instead of using one long flat list.
```

Phase-specific formatting bullets in both templates (tables-first, emoji markers, Mermaid, frontmatter rules) stay untouched; `templates/phase7_archive.md` Visual Formatting Scope stays untouched (spec 3.1).

- [ ] **Step 6: Run the test to verify it passes**

Run: `bun test test/cli.test.ts -t "share common formatting and approval rules"`
Expected: PASS.

- [ ] **Step 7: Snapshot after and diff — only phase1/phase3 prompts change, reorder + capitalization only**

```bash
bun run scripts/generate-agent-prompts.ts --project-path "$SNAP/proj" --out-dir "$SNAP/after"
for f in "$SNAP/before/prompts/"*.md; do
  b="$(basename "$f")"
  diff -u <(sed "s|$SNAP/before|@OUT@|g" "$f") <(sed "s|$SNAP/after|@OUT@|g" "$SNAP/after/prompts/$b") \
    && echo "IDENTICAL $b" || echo "CHANGED $b"
done
```
Expected: `IDENTICAL` for every file EXCEPT `03-stage-2-design.md`, whose diff shows only (a) "the AI agent must not change" → "The AI agent must not change" and (b) the "If a list grows beyond 7 items…" bullet moving up next to the "one primary human language" bullet. `01-stage-0-setup.md` must be IDENTICAL (phase1's bullets were already adjacent and capitalized). Any other diff line is a regression.

- [ ] **Step 8: Full suite and typecheck**

Run: `bun test && npm run typecheck`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add src/features/phase-control/prompt-render-helpers.ts templates/phase1_change_intake.md templates/phase3_technical_design.md test/cli.test.ts
git commit -m "refactor: shared formatting-policy and approval-rule partials for phase1/phase3 templates

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Final verification against acceptance criteria

**Files:**
- No new edits expected. Fix-forward only if a check fails.

**Interfaces:**
- Consumes: all four wave commits.
- Produces: verified acceptance report (SC1–SC6 from the spec).

- [ ] **Step 1: Full suite + typecheck**

Run: `bun test && npm run typecheck`
Expected: all PASS (spec SC5).

- [ ] **Step 2: CLI smoke (spec SC5)**

```bash
SMOKE="/private/tmp/claude-501/-Users-oleksandr-WORK-ag-dev-flow/eb2367b3-1475-4a49-a9fa-a4926ddedb93/scratchpad/smoke-proj"
mkdir -p "$SMOKE"
phasedev init --project-path "$SMOKE"
phasedev create-change --project-path "$SMOKE" my-change
phasedev phase --project-path "$SMOKE"
phasedev check --project-path "$SMOKE"
phasedev advance --project-path "$SMOKE"
```
Expected: init/create-change succeed; `phase` prints the change_intake contract containing the shared retry rule text ("If the check fails, fix the reported artifact issues in this same phase…") with no literal `{{` placeholders; `check`/`advance` report missing artifacts / refuse to advance (normal for an empty change — refusal is the expected outcome, not an error).

- [ ] **Step 3: Single-source check (spec SC4)**

```bash
grep -rl "If the check fails, fix the reported artifact issues in this same phase" templates/ src/ skills/
grep -rl "If the user reports a defect after the verdict is written" templates/ src/ skills/
grep -rl "If a list grows beyond 7 items" templates/ src/ skills/
grep -rl "must not change \`approved: false\` to \`approved: true\`" templates/ src/ skills/
```
Expected: each command prints exactly one file — `src/features/phase-control/prompt-render-helpers.ts`.

- [ ] **Step 4: Scope check (spec SC6)**

Run: `git diff --stat 77106aa..HEAD`
Expected: only these files: `skills/phasedev-orchestrator/SKILL.md`, `src/features/phase-control/prompt-render-helpers.ts`, the six phase templates from the File Structure table, `test/cli.test.ts`, and this plan file. Nothing else under `src/`.

- [ ] **Step 5: SC1/SC2 spot-check on SKILL.md**

```bash
grep -c "^## The Loop$" skills/phasedev-orchestrator/SKILL.md          # expected: 1
grep -c "Sub-agents NEVER run" skills/phasedev-orchestrator/SKILL.md   # expected: 1
grep -c "Execute the current PhaseDev phase (run from the project root)" skills/phasedev-orchestrator/SKILL.md  # expected: 1 (single prompt block)
```
Expected: the counts in the comments. Report the word-count reduction from Task 2 Step 3 in the final summary.
