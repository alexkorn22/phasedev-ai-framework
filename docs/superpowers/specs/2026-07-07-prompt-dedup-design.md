# Prompt & Orchestrator Skill Deduplication — Design

Date: 2026-07-07
Status: draft (awaiting user review)

## Goal

Remove duplication in `skills/phasedev-orchestrator/SKILL.md` and the `templates/*.md` phase prompts, and fix one misleading orchestrator rule — **without changing the meaning of any prompt contract or any framework flow behavior**.

This is a wording/structure change only. Per CLAUDE.md, "Prompt templates by meaning" is a frozen contract; the user approved these intentional wording updates in the current conversation (2026-07-07). No routing, state, YAML-key, verdict, or approval semantics change.

## Non-Goals (explicitly out of scope)

- No changes to `src/` behavior: routing (`flow-route.ts`), validators, state handling, CLI commands.
- No unification of the per-phase "Context retrieval protocol / Context budget" sections (phases 2, 3, 4, 5, 6R) — their specifics are intentional; only their skeleton wording stays as-is.
- No compression of the Check Evidence rules inside `validation_common.md` (low benefit, nonzero risk).
- No changes to `templates/init.md` (its redundancy is deliberate anti-injection hardening).
- No changes to artifact templates in `templates/artifacts/*`.

## Approach

Four independent waves, each separately testable and committable. Deduplicate **at the source** (shared constants injected via the existing template-variable mechanism in `prompt-render-helpers.ts`), never by silently dropping a rule: every removed repetition must either move into a shared partial or become a short cross-reference.

---

## Wave 0 — Fix misleading SKILL.md rule (bugfix, do first)

`SKILL.md` Important Rule 3 currently reads:

> **NEVER run `phasedev advance` yourself** — the orchestrator does.

The Important Rules are addressed to the orchestrator, which MUST run `advance` (per The Loop). The rule means sub-agents must not. Reword to:

> **Sub-agents NEVER run `phasedev advance`** — only the orchestrator calls it, after sub-agents report passing self-checks.

No other change in this wave.

## Wave 1 — SKILL.md compression (~35–40% shorter)

Target: merge the three loop descriptions, unify the two sub-agent prompt blocks, and replace restated rules with cross-references. All invariants keep exactly one canonical location.

### 1.1 Merge loop sections

Merge `## The Loop`, `## N Sub-Agents Per Phase`, and `## Phase-Driven Actions` into a single `## The Loop` section containing:

- the 3-step loop (check → advance-or-spawn → verify), stated once;
- the dynamic-N invariant, stated once: N sub-agents per phase is the orchestrator's per-phase per-change decision; `phasedev phase` returns the same contract for every sub-agent until `advance`;
- the "What NOT to do" list compressed to two bullets (no phase→agent-count/type table anywhere; no static per-phase counts or min/max limits in config/code/SKILL.md);
- the advance-refusal dispatch (invalid_* / *_approval / archive_readiness_blocked → spawn on current phase; success → spawn on new phase), stated once.

Route-kind tokens (`invalid_*`, `*_approval`) must keep appearing in backticks somewhere in SKILL.md — `test/skill-md-drift.test.ts` requires at least one and validates each against `flow-route.ts`.

### 1.2 Single sub-agent prompt

Replace the two near-identical blocks ("Role prompt block" + "Base sub-agent prompt") with one canonical prompt template that has two optional slots:

- optional goal line (change_intake only, unchanged semantics);
- optional role line: `Your role: <...>. The contract describes the ENTIRE phase; your role covers only your part — do not do others' work.`

The numbered steps appear once (current Base prompt steps 1–6, which are the superset). Surrounding guidance ("no context transmission", "sub-agent owns validation") collapses to one paragraph after the prompt.

### 1.3 Replace restatements with references

- Invalid-artifact recovery: canonical in its own section; Termination ("No progress"), Error Handling row, and Important Rules refer to it by section name instead of re-describing it.
- Auto-approval: canonical in `## Auto-Approval`; Initialization, Termination, and Error Handling refer to it.
- Sub-agent self-validation duty: canonical in the prompt steps + one paragraph (1.2); remove the other ~3 restatements.
- `npx/bunx/npm run` ban: canonical in `## Command Invocation` and (mandatory, unchanged) inside the sub-agent prompt text; Important Rules entry becomes a one-line pointer.

### 1.4 Trim the command list

Keep only commands the orchestrator itself runs or injects: `create-change`, `phase`, `check`, `advance`, `approve`, `add-finding`, `feedback`, `status`, `config`. Replace `reopen-finding`, `resolve-finding`, `set-verdict` with one line: sub-agent-facing findings commands are documented by `phasedev help` and the phase contracts. Command semantics for `add-finding` (auto-ID, file creation, verdict correction) stay **only** in the command list entry; the User Feedback fast-path section refers to it instead of repeating it.

### 1.5 Important Rules

Keep the list, but each rule that has a canonical section becomes one line with a pointer, not a paraphrased second copy. Rule 3 already fixed in Wave 0.

## Wave 2 — Shared template partials (mechanical, meaning-preserving)

All three items reuse the existing injection mechanism: a `const` in `prompt-render-helpers.ts` passed to `renderPhaseTemplate` (same pattern as `PATH_RESOLUTION_RULE` / `SELF_CHECK_FALLBACK`).

### 2.1 `{{self_check_retry_rule}}`

Phases 1, 2, 3, 4 repeat the paragraph "If the check fails, fix the reported artifact issues in this same phase, then rerun the same command. Repeat until it exits successfully. <phase-specific completion clause>".

- New constant renders the shared two sentences; the phase-specific final clause stays in each template ("Do not ask the user to approve X until this self-check passes." / "Report `Research ready` only after this self-check passes.").
- The `bash`-fenced `{{self_check_command}}` block stays in each template unchanged.

### 2.2 `{{post_verdict_feedback_rule}}`

The identical trailing paragraph in `phase6a` and `phase6b` ("If the user reports a defect after the verdict is written and before `phasedev advance` … `phasedev add-finding` … routes to finding_repair") becomes one constant injected into both templates at the same position (end of Phase completion). Text unchanged, single source.

### 2.3 Drop the duplicated CLI-only sentence in 6A/6B

Both phase templates contain "Write validation result to validation_findings.md using only the embedded Artifact Build Contract … only through the phasedev findings commands … `phasedev check-validation` catches every structural violation" — a summary of rules already fully stated in the included `validation_common.md` (CLI-only mutation, append-only registry) and in the embedded Artifact Build Contract. Replace in both templates with one short pointer: "Record the validation result in [validation_findings.md] per the Common Validation Contract and the embedded Artifact Build Contract below." No rule is lost — both referenced blocks remain embedded in the same rendered prompt.

## Wave 3 — Shared formatting/approval partials

### 3.1 `{{formatting_policy_common}}`

Extract the rules duplicated verbatim between `phase1` and `phase3` Human Review Formatting Policy into one constant:

- "Use one primary human language for artifact prose; keep code identifiers, file paths, commands, and source terms in their original form."
- "If a list grows beyond 7 items, group it by meaningful categories instead of using one long flat list."

Phase-specific formatting rules (tables-first in phase1; emoji markers, Mermaid, frontmatter rules in phase3) stay in their templates. `phase7`'s Visual Formatting Scope is left untouched (different structure, low overlap).

### 3.2 `{{approval_rule}}`

The sentence "The AI agent must not change `approved: false` to `approved: true`; approval is performed by the user." (phase1 Artifact requirements, phase3 Constraints) becomes one shared constant injected in both places.

---

## Test & Verification Plan

Prompt content is pinned by `test/cli.test.ts` (~866 assertions) plus `skill-md-drift.test.ts`, `template-validator-drift.test.ts`, `e2e-flow.test.ts`.

Per wave:

1. Before editing, snapshot rendered prompts for every phase (`phasedev phase` against a fixture project / existing test helpers) to `temp/`; after editing, diff and manually confirm the rendered output is meaning-equivalent (Wave 2/3 diffs should be near-empty except the 6A/6B pointer sentence).
2. Update `cli.test.ts` assertions that pin moved/changed strings — assertions must keep pinning the **rule text** (now from the shared constant), not merely disappear. An assertion may be deleted only if the string it pinned was replaced by a pointer, and a new assertion pins the pointer plus the canonical block's presence in the same rendered prompt.
3. Focused: `bun test test/cli.test.ts test/config.test.ts` and `bun test test/skill-md-drift.test.ts` (Waves 0–1); then full `bun test` + `npm run typecheck`.
4. CLI smoke from CLAUDE.md (`init` / `create-change` / `phase` / `check` / `advance` on a temp project).

## Acceptance Criteria

- SC1: SKILL.md contains exactly one description of the loop, one sub-agent prompt block, one canonical statement each for recovery/auto-approval/self-validation/CLI-invocation; length reduced ≥30%.
- SC2: Important Rule 3 unambiguously forbids **sub-agents** (not the orchestrator) from running `advance`.
- SC3: Rendered phase prompts (all phases) are meaning-equivalent to before; the only removed prose is text duplicated elsewhere within the same rendered prompt or replaced by an in-prompt pointer.
- SC4: Duplicated blocks (self-check retry paragraph, post-verdict feedback paragraph, formatting common rules, approval rule) each exist in exactly one source location.
- SC5: `bun test` and `npm run typecheck` pass; CLI smoke passes.
- SC6: No changes under `src/entities`, `src/features` except `prompt-render-helpers.ts` (+ its imports/tests); no changes to flow behavior, route kinds, state files, or YAML keys.

## Risks & Mitigations

- **Risk: a removed repetition was load-bearing for an agent that reads only part of a prompt.** Mitigation: within any single rendered prompt, every rule remains present (directly or via the shared partial rendered into that same prompt); pointers are only used where the canonical block is embedded in the same output.
- **Risk: test churn hides a semantic regression.** Mitigation: snapshot-diff of rendered prompts per wave (step 1 above) reviewed before updating tests.
- **Risk: SKILL.md drift test breaks if route-kind tokens are trimmed.** Mitigation: keep the advance-refusal dispatch list with backticked tokens in the merged Loop section.
- **Risk: orchestrator behavior change from SKILL.md restructure.** Mitigation: Wave 1 preserves every MUST/NEVER as a sentence (moved, not deleted); a final read-through checks each original imperative against the new text.

## Execution Order

Wave 0 → Wave 1 → Wave 2 → Wave 3, one commit per wave, full suite green before each commit.
