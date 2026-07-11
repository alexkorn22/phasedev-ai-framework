# Orchestrator Environment-Discovered Skills — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PhaseDev instruct executing agents to discover and apply skills from their own runtime environment when the flow config declares no skills for a phase (instead of suppressing skill usage), and harden the orchestrator skill's agent-type / model / parallelism / skill-selection rules — all fully harness-agnostic.

**Architecture:** Three surfaces change independently. (1) `src/features/phase-control/skill-policy.ts` — the empty-config branch of `renderSkillPolicy` and `renderSkillComplianceLine` is rewritten to emit an environment-discovery policy under the existing Flow Skill Boundary Protocol, including validation-phase read-only restrictions that today render only in the configured branch. (2) `skills/phasedev-orchestrator/SKILL.md` — a prose/prompt skill doc; add a mandatory sub-agent skill-selection step, harden agent-type selection, sharpen model selection, and allow per-phase parallel-or-sequential dispatch. (3) `AGENTS.md` (the real file; `CLAUDE.md` is a symlink to it) — update the frozen "Config-Driven Skill Policy" contract to match. The configured (legacy) skill branch stays behaviorally unchanged and keeps priority.

**Tech Stack:** TypeScript (Bun runtime + `bun test`), Markdown skill/contract docs.

## Global Constraints

- Logic stays in `src/features` / `src/entities` / `src/shared`. No new root `src/` scripts. This change touches only `src/features/phase-control/skill-policy.ts`.
- Exported functions keep explicit return types (existing signatures `renderSkillPolicy(phase: Phase, config: Config): string` and `renderSkillComplianceLine(phase: Phase, config: Config): string` are preserved — only their empty-config output changes).
- The CONFIGURED skill branch (`hasConfiguredSkills(skills) === true`) MUST remain behaviorally identical (legacy, takes priority). Do NOT change YAML config parsing (`src/entities/config`).
- Do NOT name any concrete AI harness, agent type, or skill name anywhere in `SKILL.md` — discovery/selection rules only, universal across harnesses and projects.
- Frozen contracts in `AGENTS.md` ("Config-Driven Skill Policy") are being changed under explicit user approval captured in the approved design; make ONLY the three edits in Task 3.
- Focused tests first (`bun test <files>`), then the full suite (`bun test`) and `npm run typecheck` for the cross-module (prompt output) change.
- `CLAUDE.md` is a symlink to `AGENTS.md` (verified: `CLAUDE.md -> AGENTS.md`). Edit `AGENTS.md` only; never write through the symlink twice.

---

## File Structure

- `src/features/phase-control/skill-policy.ts` — MODIFY. Rewrite the empty-config branch of `renderSkillPolicy` and `renderSkillComplianceLine`; add two helpers (`flowSkillBoundaryProtocolEnv`, `environmentSkillPhaseRules`); remove the now-unused `flowSkillBoundaryProtocolCompact`. Consumers (`prompt-render-helpers.ts`, `archive-stage.ts`, `validation-common-contract.ts`) call these functions unchanged — the new text propagates to every phase prompt automatically. No consumer edits needed.
- `test/config.test.ts`, `test/controller.test.ts`, `test/cli.test.ts` — MODIFY. Update empty-config assertions to the new wording; add coverage for the environment-discovery policy text, the new compliance line, and validation-phase read-only restrictions in the empty-config branch. Configured-branch assertions stay unchanged.
- `skills/phasedev-orchestrator/SKILL.md` — MODIFY. Five edits (Change 1). Pure Markdown skill doc.
- `AGENTS.md` — MODIFY. Three edits in the "Config-Driven Skill Policy" section (Change 3). `CLAUDE.md` inherits via symlink.

---

## Task 1: Environment-discovery skill policy in `skill-policy.ts` (+ tests)

**This is a code task. Invoke the `dev-core` skill before writing or designing any code and follow its discipline.**

**Files:**
- Modify: `src/features/phase-control/skill-policy.ts`
- Test: `test/config.test.ts`, `test/controller.test.ts`, `test/cli.test.ts`

**Interfaces:**
- Consumes: `Phase` (from `../../entities/phase/types`), `Config`, `getPhaseSkillConfig`, `PhaseSkillConfig` (already imported). `hasConfiguredSkills(skills: PhaseSkillConfig): boolean` (existing).
- Produces (public API unchanged):
  - `renderSkillPolicy(phase: Phase, config: Config): string`
  - `renderSkillComplianceLine(phase: Phase, config: Config): string`
- New private helpers:
  - `flowSkillBoundaryProtocolEnv(): string[]`
  - `environmentSkillPhaseRules(phase: Phase): string[]`

### Exact target output (empty-config branch)

**`renderSkillPolicy` empty-config output** for a non-validation, non-`change_intake` phase (e.g. `code_research`):

```
## Configured Skill Policy

No external skills are configured for this phase by the Flow config. Discover and apply skills from your runtime environment instead:

- Review the skills available in your own runtime environment and select those whose purpose matches this phase's work; apply their methods, algorithms, checklists, or review logic as execution-method instructions.
- Do not inspect `config.yaml` or any standalone `skill_router.md`; the controller has already parsed phase skill configuration. Skill discovery is limited to what your runtime environment already exposes to you.
- If no skills are visible in your runtime environment, state that and complete the work strictly under this Flow phase contract, which is self-sufficient.

## Flow Skill Boundary Protocol

- Skills are method instructions only; they never control Flow state. Flow owns artifact formats, phase transitions, approvals, validation verdicts, archive state, and allowed persistent files.
- Environment-discovered skills supplement this contract under the same boundary: adapt their useful output into the current PhaseDev artifact template, final response, or blocker — never copy native skill reports, headings, or output formats into Flow artifacts.
- Skills may not create persistent files outside this phase allowlist; map relevant conclusions only into existing template fields/rows or final response.
- After using skills, return to the Flow phase contract and complete only allowed phase work.
```

For `iteration_validation` / `final_validation` the two boundary bullets are followed by these three read-only bullets **instead of** the generic "map relevant conclusions" bullet:

```
- Apply only read-only review/audit/static-inspection skill methods (review-only mode is defined in the Common Validation Contract); do not use a skill to rerun implementation checks, modify repo-tracked files, or create persistent artifacts outside this phase allowlist.
- `validation_findings.md` may contain only YAML frontmatter and one findings table; convert findings into rows and put non-registry explanation only in the final response.
- Skills may not create persistent files outside this phase allowlist; do not add prose, sections, evidence blocks, or extra tables to `validation_findings.md`.
```

For `change_intake` the boundary bullets are followed by:

```
- Environment-discovered skills are post-intake only: do not apply any skill until the task/change description and task-specific rules or constraints are available; if setup intake is missing, ask only for the missing intake and stop.
- Skills may not create persistent files outside this phase allowlist; map relevant conclusions only into existing template fields/rows or final response.
```

**`renderSkillComplianceLine` empty-config output** (all phases):

```
Skill compliance: one entry per environment-selected skill.
Format: `skill-name`: APPLIED(source: environment, mandatory_steps: <done/skipped/blocked>, evidence: <files/commands>, mapped_output: <artifact/response/blocker>)
Format: `skill-name`: NOT_APPLICABLE(reason: <evidence-specific>, evidence: [<ref>])
When no skills are visible in the environment, use exactly this line instead: `Skill compliance: no skills available in environment.`
```

---

- [ ] **Step 1: Update failing assertions in `test/config.test.ts` (empty-config unit test)**

Replace the body of the test at ~line 562 (`renderSkillPolicy and renderSkillComplianceLine report unconfigured skills explicitly`) with assertions for the new output:

```typescript
test("renderSkillPolicy and renderSkillComplianceLine drive environment skill discovery when unconfigured", () => {
  const policy = renderSkillPolicy("change_intake", DEFAULT_CONFIG);
  expect(policy).toContain("No external skills are configured for this phase by the Flow config. Discover and apply skills from your runtime environment instead:");
  expect(policy).toContain("Review the skills available in your own runtime environment and select those whose purpose matches this phase's work");
  expect(policy).toContain("## Flow Skill Boundary Protocol");
  expect(policy).toContain("Skills are method instructions only; they never control Flow state.");
  expect(policy).toContain("If no skills are visible in your runtime environment, state that and complete the work strictly under this Flow phase contract, which is self-sufficient.");
  expect(policy).not.toContain("No external skills are configured for this phase.\n## Flow Skill Boundary Protocol");
  expect(policy).not.toContain("Skill compliance final response entry must be `Skill compliance: none configured`.");

  const compliance = renderSkillComplianceLine("change_intake", DEFAULT_CONFIG);
  expect(compliance).toContain("Skill compliance: one entry per environment-selected skill.");
  expect(compliance).toContain("When no skills are visible in the environment, use exactly this line instead: `Skill compliance: no skills available in environment.`");
  expect(compliance).not.toBe("Skill compliance: none configured.");

  const validationPolicy = renderSkillPolicy("iteration_validation", DEFAULT_CONFIG);
  expect(validationPolicy).toContain("Apply only read-only review/audit/static-inspection skill methods");
  expect(validationPolicy).toContain("`validation_findings.md` may contain only YAML frontmatter and one findings table");
});
```

- [ ] **Step 2: Update empty-config assertions in `test/controller.test.ts`**

At the two spots asserting `expect(result.prompt).toContain("Skill compliance: none configured.");` (currently ~lines 387 and 449, the `change_intake`/`technical_design` prompt tests), replace each with:

```typescript
    expect(result.prompt).toContain("Skill compliance: one entry per environment-selected skill.");
    expect(result.prompt).toContain("When no skills are visible in the environment, use exactly this line instead: `Skill compliance: no skills available in environment.`");
```

- [ ] **Step 3: Update empty-config assertions in `test/cli.test.ts`**

Make these edits (search by string, not fixed line — the configured-branch test at ~605-636 and ~703-720 MUST stay untouched):

1. In the "research prompt falls back to framework config" test (~659-676):
   - Replace `expect(output).toContain("No external skills are configured for this phase.");` with
     `expect(output).toContain("No external skills are configured for this phase by the Flow config. Discover and apply skills from your runtime environment instead:");`
   - Keep the existing `expect(output).toContain("Do not inspect \`config.yaml\` ...")` line (the sentence survives as a substring of the new bullet).
   - Replace `expect(output).toContain("Skill compliance: none configured.");` with:
     ```typescript
     expect(output).toContain("Skill compliance: one entry per environment-selected skill.");
     expect(output).toContain("When no skills are visible in the environment, use exactly this line instead: `Skill compliance: no skills available in environment.`");
     ```

2. In the "implementation prompt has no skill content when stage skills are empty" test (~722-746):
   - Replace `expect(output).toContain("No external skills are configured");` with
     `expect(output).toContain("No external skills are configured for this phase by the Flow config.");`
   - Replace `expect(output).toContain("Skill compliance: none configured.");` with
     `expect(output).toContain("Skill compliance: one entry per environment-selected skill.");`
   - Keep `expect(output).not.toContain("Priority 1 - Routers:");` (empty branch still has no priority sections).
   - **Remove** the now-incorrect negative `expect(output).not.toContain("APPLIED(source:");` — the empty-config compliance line now legitimately contains `APPLIED(source: environment ...`. Replace it with:
     `expect(output).not.toContain("Priority 2 - Main:");`

3. In the `change_intake` compact-template test (~798), the plan prompt test (~908), and the generated-sandbox test (~963-964): replace every `expect(...).toContain("Skill compliance: none configured.");` with
   `expect(...).toContain("Skill compliance: one entry per environment-selected skill.");`
   (keep the receiver — `output`, `phaseValidationPrompt`, or `implementationPrompt` — as written).

4. Add ONE new coverage test near the empty-config tests asserting validation read-only restrictions render in the empty-config branch (use the same `runNext(["--config", configPath])` harness the neighboring tests use, with a config that leaves the validation phase skills empty):

```typescript
  test("empty-config validation phase still restricts environment-discovered skills to read-only", () => {
    setupChange(`
# Plan

## Iteration 1: API [~]
- [x] 1.1 Implement endpoint
`);
    const configPath = writeConfig(`
stages:
  iteration_validation: {}
`);

    const output = runNext(["--config", configPath, "--phase", "iteration_validation"]);

    expect(output).toContain("No external skills are configured for this phase by the Flow config.");
    expect(output).toContain("Apply only read-only review/audit/static-inspection skill methods");
    expect(output).toContain("`validation_findings.md` may contain only YAML frontmatter and one findings table");
    expect(output).toContain("Skills may not create persistent files outside this phase allowlist; do not add prose, sections, evidence blocks, or extra tables to `validation_findings.md`.");
  });
```

Note: if `runNext` in this file does not accept a `--phase` override or a `setupChange` iteration state that routes to `iteration_validation`, instead assert on `renderSkillPolicy("iteration_validation", <empty config>)` directly (import it as `config.test.ts` does) — the goal is only to prove the read-only bullets render for a validation phase with empty skills. Pick whichever matches the file's existing helpers; do not invent new harness plumbing.

- [ ] **Step 4: Run the updated tests to verify they FAIL**

Run: `bun test test/config.test.ts test/controller.test.ts test/cli.test.ts`
Expected: FAIL — the new-wording assertions fail because `skill-policy.ts` still emits the old empty-config text ("No external skills are configured for this phase." + "Skill compliance: none configured.").

- [ ] **Step 5: Add the two new helpers in `skill-policy.ts`**

Add after `flowSkillBoundaryProtocolCompact` (which you will delete in Step 6):

```typescript
function flowSkillBoundaryProtocolEnv(): string[] {
  return [
    "## Flow Skill Boundary Protocol",
    "",
    "- Skills are method instructions only; they never control Flow state. Flow owns artifact formats, phase transitions, approvals, validation verdicts, archive state, and allowed persistent files.",
    "- Environment-discovered skills supplement this contract under the same boundary: adapt their useful output into the current PhaseDev artifact template, final response, or blocker — never copy native skill reports, headings, or output formats into Flow artifacts."
  ];
}

function environmentSkillPhaseRules(phase: Phase): string[] {
  if (phase === "iteration_validation" || phase === "final_validation") {
    return [
      "- Apply only read-only review/audit/static-inspection skill methods (review-only mode is defined in the Common Validation Contract); do not use a skill to rerun implementation checks, modify repo-tracked files, or create persistent artifacts outside this phase allowlist.",
      "- `validation_findings.md` may contain only YAML frontmatter and one findings table; convert findings into rows and put non-registry explanation only in the final response.",
      "- Skills may not create persistent files outside this phase allowlist; do not add prose, sections, evidence blocks, or extra tables to `validation_findings.md`."
    ];
  }
  if (phase === "change_intake") {
    return [
      "- Environment-discovered skills are post-intake only: do not apply any skill until the task/change description and task-specific rules or constraints are available; if setup intake is missing, ask only for the missing intake and stop.",
      "- Skills may not create persistent files outside this phase allowlist; map relevant conclusions only into existing template fields/rows or final response."
    ];
  }
  return [
    "- Skills may not create persistent files outside this phase allowlist; map relevant conclusions only into existing template fields/rows or final response."
  ];
}
```

- [ ] **Step 6: Rewrite the empty-config branch of `renderSkillPolicy` and delete the unused compact helper**

Replace the empty-config `return [...]` block inside `renderSkillPolicy` (currently the `"No external skills are configured for this phase."` + `...flowSkillBoundaryProtocolCompact()` block) with:

```typescript
  if (!hasConfiguredSkills(skills)) {
    return [
      "## Configured Skill Policy",
      "",
      "No external skills are configured for this phase by the Flow config. Discover and apply skills from your runtime environment instead:",
      "",
      "- Review the skills available in your own runtime environment and select those whose purpose matches this phase's work; apply their methods, algorithms, checklists, or review logic as execution-method instructions.",
      "- Do not inspect `config.yaml` or any standalone `skill_router.md`; the controller has already parsed phase skill configuration. Skill discovery is limited to what your runtime environment already exposes to you.",
      "- If no skills are visible in your runtime environment, state that and complete the work strictly under this Flow phase contract, which is self-sufficient.",
      "",
      ...flowSkillBoundaryProtocolEnv(),
      ...environmentSkillPhaseRules(phase),
      "- After using skills, return to the Flow phase contract and complete only allowed phase work.",
      ""
    ].join("\n");
  }
```

Then delete the now-unused `flowSkillBoundaryProtocolCompact` function (verify no other reference remains with a repo grep for `flowSkillBoundaryProtocolCompact`).

- [ ] **Step 7: Rewrite the empty-config branch of `renderSkillComplianceLine`**

Replace `return "Skill compliance: none configured.";` inside `renderSkillComplianceLine`'s `!hasConfiguredSkills(skills)` branch with:

```typescript
    return [
      "Skill compliance: one entry per environment-selected skill.",
      "Format: `skill-name`: APPLIED(source: environment, mandatory_steps: <done/skipped/blocked>, evidence: <files/commands>, mapped_output: <artifact/response/blocker>)",
      "Format: `skill-name`: NOT_APPLICABLE(reason: <evidence-specific>, evidence: [<ref>])",
      "When no skills are visible in the environment, use exactly this line instead: `Skill compliance: no skills available in environment.`"
    ].join("\n");
```

- [ ] **Step 8: Run the focused tests to verify they PASS**

Run: `bun test test/config.test.ts test/controller.test.ts test/cli.test.ts`
Expected: PASS. If any configured-branch assertion (skill priorities, `Skill compliance: one entry per configured router...`) regressed, you changed the wrong branch — the configured branch must be byte-for-byte unchanged.

- [ ] **Step 9: Full suite + typecheck (cross-module prompt output)**

Run: `bun test`
Expected: PASS (all suites — `renderSkillPolicy`/`renderSkillComplianceLine` feed `prompt-render-helpers.ts`, `archive-stage.ts`, and `validation-common-contract.ts`, so e2e and schema prompt snapshots exercise the new text).
Run: `npm run typecheck`
Expected: no errors.

If any other test outside the three focused files asserts the old empty-config strings (`No external skills are configured`, `none configured`), update it to the new wording using the same replacements as Steps 1–3. Do not weaken configured-branch assertions.

- [ ] **Step 10: Commit**

```bash
git add src/features/phase-control/skill-policy.ts test/config.test.ts test/controller.test.ts test/cli.test.ts
git commit -m "feat: drive environment skill discovery in empty-config phase prompts"
```

---

## Task 2: Orchestrator skill hardening in `SKILL.md`

This task edits a Markdown skill/prompt document (no TypeScript). It carries no `dev-core` gate. Do NOT introduce any concrete harness, agent-type, or skill name.

**Files:**
- Modify: `skills/phasedev-orchestrator/SKILL.md`

Read the whole file first. Apply the five edits below exactly.

- [ ] **Step 1: Add the mandatory sub-agent skill-selection step to the canonical dispatch prompt**

In the canonical `Agent(...)` prompt (the numbered list currently reading `1. Run: phasedev phase ...` through `4. Report back ...`), replace the four numbered steps with these five:

```
1. Run: phasedev phase --change <change> — get the active phase contract.
2. Review the skills available in YOUR OWN runtime environment and select those whose purpose matches this phase's work; apply their methods as execution-method instructions. If the contract prints a Configured Skill Policy, that policy takes priority and any environment-discovered skill only supplements it under the same boundary — skills never control Flow state (artifact formats, phase transitions, approvals, verdicts, archive state); PhaseDev owns those. If no skills list is visible in your context or the skill mechanism is unavailable, state "skills unavailable in environment" and complete the work strictly per the phase contract, which is self-sufficient.
3. Do the phase work per your role and the contract. The contract defines the artifacts, the self-check that gates completion, and your final-response format — follow it exactly; do not report success while its self-check fails.
4. Do NOT run phasedev advance — that is the orchestrator's job.
5. Report back with the contract's final response (it already includes the self-check command and result) and the per-skill compliance section it requires — one entry per environment-selected skill as APPLIED or NOT_APPLICABLE(evidence-specific reason), or the line "skills unavailable in environment" when none were visible. State any blockers explicitly.
```

Then, in the prose paragraph immediately after the prompt block (the one beginning "That is the entire prompt — no context collection..."), append this sentence to the end of that paragraph:

```
The orchestrator never enumerates or transmits a skill list — each sub-agent discovers skills from its own runtime environment, keeping the orchestrator's context thin and harness-agnostic; the orchestrator only requires the compliance section to be present in the report.
```

- [ ] **Step 2: Add skill discovery to the feedback, recovery, and archive dispatch prompts**

(a) In the **feedback delegated-path** `Agent(...)` prompt, after the line `Run: phasedev feedback --change <change> — and follow the printed contract exactly. ...`, add this line inside the prompt template:

```
Before acting, review the skills available in your own runtime environment and apply those matching this work; include a per-skill compliance section in your final report (APPLIED / NOT_APPLICABLE(reason), or "skills unavailable in environment" when none are visible). Skills are method instructions only — they never change Flow state, approvals, or verdicts.
```

(b) In the **Invalid-artifact recovery policy** section, step 1, replace:

```
1. Spawn ONE sub-agent for the owning phase. Instruct it: run `phasedev phase` to get the fix contract (it lists the issues), fix the artifact, then run `phasedev check` until it passes. Do NOT run `phasedev advance`; report back.
```

with:

```
1. Spawn ONE sub-agent for the owning phase. Instruct it: run `phasedev phase` to get the fix contract (it lists the issues), review and apply matching skills from its own runtime environment, fix the artifact, then run `phasedev check` until it passes; include the per-skill compliance section in its report. Do NOT run `phasedev advance`; report back.
```

(c) In the **Archive Handling** section, step 3, replace:

```
3. Spawn an archive sub-agent that reads the archive contract via `phasedev phase --change <change>`, writes delta specs, and sets `.phase-archive.json` `status: "completed"`. The sub-agent works only on the change `<change>` and must never pass a different `--change` value.
```

with:

```
3. Spawn an archive sub-agent that reads the archive contract via `phasedev phase --change <change>`, applies any matching skills from its own runtime environment (including the per-skill compliance section in its report), writes delta specs, and sets `.phase-archive.json` `status: "completed"`. The sub-agent works only on the change `<change>` and must never pass a different `--change` value.
```

- [ ] **Step 3: Harden the "Agent type selection" paragraph**

Replace the entire **Agent type selection** paragraph with:

```
**Agent type selection:** On EVERY run, review the list of available agent types for the `Agent` tool in the current session environment (the tool's agent-type list itself — NOT a directory on disk; `.claude/agents/` may not reflect what the running session actually exposes). For each phase you MUST use a custom agent type whose description matches that phase's work when one exists; fall back to the generic/general-purpose type only when no available custom type fits. This is a per-phase, per-change judgment, made fresh each time — never fixed into a static phase→type table. If a custom agent's reports show it cannot access skills and the phase materially benefits from skills, you MAY prefer a generic agent (which has skill access by default) for that phase on the next dispatch — a per-phase judgment, not a fixed rule.
```

- [ ] **Step 4: Sharpen the "Model selection" guidance**

In the **Model selection** section, in the paragraph that begins "The tier is the orchestrator's per-phase, per-change judgment...", replace the sentence:

```
Guidance: `"haiku"` for mechanical, narrowly-scoped work (e.g. archive delta specs); `"sonnet"` for routine single-phase artifact work; the strongest available tier (`"opus"`) for design-heavy, validation-heavy, or repair work needing real analysis.
```

with:

```
When dispatching a generic type, always pass an explicit model and pick the CHEAPEST tier the task complexity allows: mechanical, narrowly-scoped work (e.g. archive delta specs) → the cheapest tier; routine single-phase artifact work → the mid tier; design-heavy, validation-heavy, or repair work needing real analysis → the strongest available tier.
```

Leave the following sentence ("If a report shows the work was harder than expected, re-dispatch the remainder on a stronger model...") unchanged — the escalate-on-underpowered rule stays.

- [ ] **Step 5: Allow per-phase parallel-or-sequential dispatch**

In "The Loop" section, in the paragraph beginning "**N sub-agents per phase is dynamic.**", replace the sentence:

```
Sub-agents run **sequentially**; each reads the same phase contract itself via `phasedev phase` (the orchestrator does not transmit the contract text) and self-validates with `phasedev check` before reporting. The framework guarantees only the invariant: `phasedev phase --change X` returns the same contract for every sub-agent until `advance --change X` is called — an advance on another change does not affect X's contract. This lock enables N sequential agents on any phase.
```

with:

```
Whether the phase's sub-agents run **sequentially or in parallel** is also the orchestrator's per-phase decision — e.g., during a validation phase a code-review agent and a security-review agent may run concurrently. Each sub-agent reads the same phase contract itself via `phasedev phase` (the orchestrator does not transmit the contract text) and self-validates with `phasedev check` before reporting. When several concurrent sub-agents would mutate the same artifact or registry (e.g., multiple `phasedev add-finding` writers on `validation_findings.md`), account for write races: either run those writers sequentially, or have the agents analyze in parallel and serialize the recording step. The framework guarantees only the invariant: `phasedev phase --change X` returns the same contract for every sub-agent until `advance --change X` is called — an advance on another change does not affect X's contract. This lock keeps N agents on a phase safe whether they run sequentially or in parallel.
```

The "What NOT to do" list (no phase→agent-count/type table, no min/max limits) stays unchanged.

- [ ] **Step 6: Verify no concrete names and no stray "sequential-only" language leaked in**

Run: `grep -nEi "claude|anthropic|opus|sonnet|haiku|cursor|codex|copilot|dev-core|fsd-|sp-security" skills/phasedev-orchestrator/SKILL.md`
Expected: the ONLY matches are the pre-existing model-tier tokens `"haiku"` / `"sonnet"` / `"opus"` inside the Model selection code slots (these are generic tier identifiers the file already used, not harness names) — no agent or skill names.
Run: `grep -ni "run \*\*sequentially\*\*\|sequential agents on any phase" skills/phasedev-orchestrator/SKILL.md`
Expected: no matches (the old sequential-only phrasing is gone).

- [ ] **Step 7: Commit**

```bash
git add skills/phasedev-orchestrator/SKILL.md
git commit -m "docs: orchestrator discovers env skills, hardens agent/model/parallelism rules"
```

---

## Task 3: Sync the frozen "Config-Driven Skill Policy" contract in `AGENTS.md`

Markdown contract file (no TypeScript, no `dev-core` gate). `CLAUDE.md` is a symlink to `AGENTS.md` — edit `AGENTS.md` once; the symlink reflects it automatically. Make ONLY these three edits in the "Config-Driven Skill Policy" section.

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Broaden the "Allowed external skills" bullet**

Immediately after the bullet:

```
- Allowed external skills for a phase are configured `routers`, router-selected skills explicitly named by router content, `main`, and `additional`.
```

insert a new bullet:

```
- When no skills are configured for a phase, skills discovered in the executing agent's runtime environment that match the phase work are allowed under the same boundary rules (method instructions only; no Flow-state authority).
```

- [ ] **Step 2: Scope the "stop and ask" bullet to the configured case**

Replace:

```
- If a needed skill is not available from configured routers, router-selected skills, `main`, or `additional`, the agent MUST stop and ask the user to update config/router or approve an exception.
```

with:

```
- When skills are configured and a needed skill is not available from configured routers, router-selected skills, `main`, or `additional`, the agent MUST stop and ask the user to update config/router or approve an exception.
```

- [ ] **Step 3: Replace the "omitted or empty" contract bullet**

Replace:

```
- If `skills` is omitted or empty, the generated phase prompt MUST say no external skills are configured.
```

with:

```
- If `skills` is omitted or empty, the generated phase prompt MUST instruct the agent to discover and select applicable skills from its runtime environment under the Flow Skill Boundary Protocol, and to state that skills are unavailable in the environment when none are visible.
```

- [ ] **Step 4: Confirm the symlink carried the edit and nothing else changed**

Run: `git diff --stat AGENTS.md; ls -la CLAUDE.md`
Expected: only `AGENTS.md` shows as modified; `CLAUDE.md -> AGENTS.md` symlink intact. No other bullets in the section changed.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md
git commit -m "docs: update skill-policy contract for environment-discovered skills"
```

---

## Task 4: README drift check and final full verification

No production code. Confirms the README/help-sync drift tests still pass and nothing else regressed.

**Files:**
- Possibly modify: `README.md` (only if a drift test demands it — likely none)

- [ ] **Step 1: Grep README for stale empty-config skill wording**

Run: `grep -ni "no external skills\|none configured\|skill compliance" README.md`
Expected: no matches (README documents skill policy generically at the "Per-phase `skills` lists..." paragraph and the orchestrator override examples; it does not quote the empty-config prompt strings). If a match appears, update it to describe environment discovery, matching the new `AGENTS.md` contract wording, then re-run.

- [ ] **Step 2: Full suite + typecheck once more (catches README/help drift tests)**

Run: `bun test`
Expected: PASS, including any README-drift / help-sync suite.
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: CLI smoke — empty-config phase prompt shows the new policy**

Run:
```bash
phasedev init --project-path /tmp/env-skills-smoke
phasedev create-change --project-path /tmp/env-skills-smoke smoke-change
phasedev phase --project-path /tmp/env-skills-smoke | grep -A2 "No external skills are configured for this phase by the Flow config"
```
Expected: the change_intake contract prints the environment-discovery policy header and the discovery bullets (no "No external skills are configured for this phase." full-stop line, no "Skill compliance: none configured."). Then `rm -rf /tmp/env-skills-smoke`.

- [ ] **Step 4: Final commit if README changed**

Only if Step 1 required a README edit:
```bash
git add README.md
git commit -m "docs: sync README skill-policy wording with environment discovery"
```

---

## Self-Review (author checklist — done)

- **Spec coverage:** Change 1 → Task 2 (all five SKILL.md edits, incl. feedback/recovery/archive prompts). Change 2 → Task 1 (`renderSkillPolicy` + `renderSkillComplianceLine` empty-config, validation read-only rules via `environmentSkillPhaseRules`, config-parsing untouched, configured branch frozen). Change 3 → Task 3 (three AGENTS.md edits, symlink handled). Change 4 → Task 1 Steps 1–3 + Step 9 (all `No external skills`/`none configured`/`Skill compliance` test updates, new empty-config + validation-restriction coverage, `not.toContain("APPLIED(source:")` removal) and Task 4 (README drift).
- **Placeholder scan:** every code/test/text step includes the exact literal strings to write; no TBD/TODO.
- **Type consistency:** public signatures `renderSkillPolicy(phase, config): string` and `renderSkillComplianceLine(phase, config): string` unchanged; new helpers `flowSkillBoundaryProtocolEnv(): string[]` and `environmentSkillPhaseRules(phase: Phase): string[]` are referenced exactly as defined; deleted helper `flowSkillBoundaryProtocolCompact` has its only caller removed in the same step.
- **Boundary caution:** the fallback phrasings intentionally differ by layer, per the approved design — dispatch prompt says "skills unavailable in environment"; the contract compliance line says "Skill compliance: no skills available in environment." Do not unify them.

## Execution Handoff

Recommended: subagent-driven execution (fresh subagent per task, review between tasks). Tasks 2 and 3 are independent Markdown edits and may run in parallel; Task 1 is the code change and should land with its tests green before Task 4's final full-suite verification.
