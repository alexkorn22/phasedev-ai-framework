---
name: code-review-method
description: Use when reviewing code changes and producing findings, when approving or rejecting work against quality criteria, or when triaging review feedback — yours or someone else's — with technical rigor.
version: 1.0.0
compatibility: universal
metadata:
  source: distilled
---

# Code Review Method

## Purpose

The reviewer's discipline for findings that are real, evidenced, and honest. Manufactured findings, filler nits, and hypothetical edge cases without a trigger are the primary failure mode of LLM reviewers; the second is missing what matters. This method guards both flanks at once.

## Review Stance

- Read-only: report, do not fix. Read the changed files IN FULL plus surrounding context — imports, callers, tests — not just the diff hunks. Many apparent issues are already handled one frame up or guarded by a type.
- Read project conventions first; they override general rules when they conflict. Do not flag what matches the codebase's established patterns — when in doubt, match what the rest of the codebase does.
- Never review from memory, and never trust someone else's scores — re-derive your own assessment from the code.
- If you wrote any of the code under review, disclose it: self-review carries anchoring bias.
- A truncated review is not full coverage — split, review each part, aggregate.

## Every Finding Requires Evidence

- Evidence format: `file_path:line_number` or `file_path:function_name:line_number`. Findings without evidence are discarded — "I believe there may be an issue" is not a finding. Never fabricate paths or line numbers to fill the requirement.
- A high-severity finding carries three things: the exact snippet and line; the specific failure scenario — input, state, and outcome; and why existing guards (types, validation, framework defaults) do not catch it. Cannot produce all three — demote or drop.
- Show what, not whether: "query is scoped" is a claim; the WHERE clause quoted is evidence. All paths, not one: 7 queries means confirm all 7. Vague = not verified.
- Scoring absence needs negative evidence: identify the project's actual API first, document the exhaustive search, use the right baseline.
- Do not claim completeness — state what you actually checked. Severity and confidence numbers are self-attested: cite the evidence, not the process that produced them.

## Confidence Model — the Pre-Report Filter

Rate each finding 0–100. Factors, as guidelines not arithmetic: matches a critical-class check +25; concrete reproduction scenario +20; user-visible or money/auth/data impact +15; theoretical only with no reproduction path −20; covered by existing tests −15; intentional author choice evidenced by comment or commit −15.

- **51–100** — report, with the contributing factors stated. In PhaseDev validation phases, register findings that require tracking into `validation_findings.md` via `phasedev add-finding` with appropriate severity (`MUST-FIX`, `RECOMMENDED`, `NIT`).
- **26–50** — do not report in the findings table; record for later in the review text with a low-confidence mark.
- **0–25** — discard: likely hallucination or insufficient evidence.

Above 25, nothing is dropped silently — every finding lands in the report or the record. Two findings duplicating the same file:line and issue merge into the one with more evidence; on a severity disagreement, the higher severity wins. In PhaseDev, do not register sub-50 confidence observations into `validation_findings.md`.

Exceptions that bypass the filter:
- A finding sourced from a critical-class check failure or a deterministic tool is reported regardless of the score — otherwise the filter buries exactly what must block.
- Confidence measures how sure you are, not how important the issue is. A critical-class finding at low confidence is verified, then reported or refuted with evidence — never dropped for the score alone.

Before writing any finding, four questions; any "no" downgrades or drops it: Can I cite the exact line? Can I describe the concrete failure mode — input, state, bad outcome? Have I read the surrounding context? Is the severity defensible? (A missing docstring is never high severity; severity inflation erodes trust faster than missed findings.)

## Calibration — Both Flanks

- **Zero findings is a valid and expected result.** A clean review is a valid review; do not manufacture findings to justify the invocation, and do not withhold approval to appear rigorous.
- **Fight leniency too.** Do not talk yourself out of issues you found ("it's minor, probably fine"); no points for effort or potential.
- **Clean on a large diff is suspicious.** Zero findings on a 150+ line diff warrants a note about a possible false negative — one reviewer finding nothing is not proof of correctness.

## Severity and Disposition

- **MUST-FIX** — confirmed bug, security issue, data loss, critical-class check failure: blocks acceptance. Unresolved, it changes the completion claim — the work is not "complete".
- **RECOMMENDED** — maintenance risk, degraded reliability: acceptance discouraged.
- **NIT** — style/readability, no functional impact: fine as-is; list nits subordinated, never inflated.
- A structural-refactor finding (extract a module, split a god-file, invert a dependency) is deferred with a concrete recipe — target shape and ordered steps — never left as vague "consider refactoring" and never blocking an unrelated change.
- Pre-existing issues (not introduced by this change): critical classes are always reported, capped at RECOMMENDED; a finding the diff *caused* in an untouched file — a broken caller, a consumer of a removed export — is fully in scope. "Pre-existing" is a triage label, not a reason for silence.
- When reviewing a range: check the file has not already changed past the reviewed range before reporting — read the current state, drop findings that no longer exist.

## False Positives — Verify, Then Dismiss

An unverified "probably FP" is a skipped finding; each dismissal names its class and evidence. Recurring classes: claims a declared type already disproves; re-raises of settled facts (fixed at HEAD, present lockfile); tool artifacts (mangled tokens, escaping miscounts); "missing validation" where callers validate; "magic number" for well-known constants; "possible null" where the type is narrowed; "N+1" on fixed small cardinality; "missing await" on intentional fire-and-forget; hardcoded values in test fixtures; noncryptographic `random` in noncryptographic context; incidental typing/compiler/import adjustments that are necessary consequences of the change and introduce no new feature behavior or risk. Full checklist plus the "would a senior engineer actually change this?" test: `references/quality-checklist.md`.

After a fix, a re-raised finding with the same location and root cause that the regression test disproves is a false re-raise — noise, not non-convergence. A stated, evidence-backed context block (schema facts, global middleware, absent-by-design concepts) may only be reopened by citing contradicting code — and every line in it must itself carry evidence, or the block suppresses real findings on author confidence alone.

## What to Check

Seven lenses: correctness (logic, off-by-ones, null handling, edge cases, races); type safety — and type design: do types make illegal states unrepresentable, are invariants enforced or escape-hatched; silent failures — empty catches, errors converted to defaults, `.catch(() => [])`, lost stack traces, log-and-forget; pattern compliance with the project; security-sensitive surfaces (hand to a security-focused pass when auth/payment/crypto/migrations appear); performance (N+1, unbounded reads); completeness (missing tests and error paths). Per-check meanings, N/A validity, and code-type focus areas: `references/quality-checklist.md`. Numeric size thresholds as an auxiliary signal — not authoring rules: `references/size-thresholds.md`. For AI-generated changes, weight behavioral regressions, trust boundaries, and quiet architecture drift first.

## Receiving and Answering Findings

- Verify the premise before accepting the conclusion: read the actual code at the cited line — reviewers reference stale code, wrong lines, misread logic.
- Fix when the finding is a real bug, a missing edge case, or a clarity gain aligned with project patterns. Push back — with a specific technical reason — when the suggestion breaks callers, violates YAGNI, is wrong for this stack, duplicates existing logic, or conflicts with a recorded decision. A finding contradicting a stated invariant is never silently applied or silently ignored: verify, then fix or push back citing the invariant.
- No performative agreement — "You're absolutely right!", "Great catch!" signal compliance, not comprehension. No combativeness either; pushback is a neutral technical statement. Acknowledging a genuinely good fix calibrates the loop.
- Trust by source: direct user feedback high; external reviewers standard — verify claims, they may lack context; automated tools and AI reviewers skeptical — hypotheses, not instructions; verify the flagged pattern is a bug and the attack vector reachable, not just theoretically possible.
- After two clean fixes at the same boundary, a newly invented unsupported-input convention needs a live call site to stay above threshold; concrete bypasses with a reachable path are never suppressed by this rule.

## Completion Condition

The review is complete when every changed file was read in full with context, findings above threshold carry location + failure scenario + defensible severity, dismissed candidates carry their verification, nothing above 25 confidence was silently dropped, and the decision follows the findings — including approving cleanly when clean.
