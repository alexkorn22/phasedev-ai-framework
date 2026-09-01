---
name: verification-method
description: Use when verifying that work is actually complete — checking an implementation, validating claims of "done", "fixed", or "passing" — and when proving that declared-untouched files really were left alone.
version: 1.0.0
compatibility: universal
metadata:
  source: distilled
---

# Verification Method

## Purpose

Iron law: no completion claims without fresh evidence from the actual system. Never state that something works, passes, is fixed, or is complete unless you have run a verification command in this session and read its output. Prior knowledge, memory of previous runs, and logical deduction are not substitutes for fresh evidence.

This applies to every claim: "tests pass", "build succeeds", "the bug is fixed", "the feature works", "no errors". It does not apply to analysis-only outputs (audit reports, design documents) where the claim is about findings, not system state. It also yields, without conflict, to an execution-restricted context — a phase or role whose contract forbids reruns and owns the allowed execution surface.

## Execution-Restricted Context — Review-Only Evidence

In a PhaseDev validation phase (iteration validation 6A, final validation 6B) the phase contract — not this skill — owns the execution surface: 6A forbids reruns entirely and validates through review methods; 6B runs exactly one `full` gate and forbids every other execution. Honoring that boundary IS applying this method: never demand a rerun the phase forbids, and never report `mandatory_steps: skipped` as a defect — the fresh evidence you cite is the evidence the phase allows (the single `full` gate output in 6B; the review-method conclusions and the existing Check Evidence in 6A). State which phase-allowed evidence backs each claim.

## The Five Steps

**1 — IDENTIFY.** Determine which command or check would prove your claim true. Be specific:

| Claim | Verification |
|---|---|
| "Tests pass" | The project's actual test command |
| "Build succeeds" | The build / type-check command |
| "The bug is fixed" | The exact reproduction steps from the bug report |
| "Lint clean" | The lint command |
| "Feature works" | A test or manual check that exercises the feature |
| "File is valid" | Read the file, confirm syntax and structure |

**2 — RUN.** Execute the command fresh — do not rely on cached results. If the command was run before a code change, it must be run again after. If an execution-restricted context forbids this run, do not run it — cite the phase-allowed evidence instead (see "Execution-Restricted Context").

**3 — READ.** Read the complete output and the exit code. Do not skim. Look for: non-zero exit codes; failed test counts (even if some pass); warnings that indicate problems; error output after apparent success lines.

**4 — VERIFY.** Confirm the output actually supports the claim. "3 passed, 1 failed" does NOT support "tests pass". "Compiled with warnings" does not support "build succeeds" if warnings are errors in CI. A test passing does not mean the bug is fixed if the test does not reproduce the bug.

**5 — CLAIM.** Only then make the claim — with the evidence: `Tests pass: <command> exited 0, 47 passed, 0 failed.`

## Red Flags

| Red flag | What is actually happening |
|---|---|
| "Tests should pass" | You have not run them |
| "This should fix the issue" | You have not verified it does |
| "I believe this is correct" | You have not checked |
| "Based on my earlier run..." | That run was before the latest changes |
| "No errors expected" | Expectation is not evidence |
| "The implementation is complete" | Complete = verified, not just written |
| Skipping verification because "it's a small change" | Small changes break things too |
| Verifying one file when three changed | Partial verification is not verification |

## What "Done" Means

A task is not done because code is committed, unit tests passed, or a reviewer said "compliant". It is done when the promised behavior can be demonstrated to actually work, with evidence. Tests are an implementation detail of the proof — a passing unit test on a misunderstood requirement proves nothing.

- **No proof — no completion.** Every acceptance criterion carries a declared proof; run it. A criterion that cannot be verified as stated is escalated, not replaced with an improvised weaker check.
- **A failed proof blocks; it is not a warning.** Never relabel a WARN as PASS; never silently accept.
- **Deterministic preferred.** Use an LLM judge only when no deterministic check expresses the criterion — and then demand a binary VERIFIED-or-BROKEN answer with a one-sentence justification.
- **Proof surfaces:** pure logic → run with spec inputs, assert outputs; API → real call against a running service; DB/migration → run on a test DB, assert schema and data invariants; data jobs → before/after invariants on a sample; UI → drive the real interface, assert state plus artifact; integration → trigger upstream, observe downstream; config → load it, assert dependent code reads expected values. Favor the most concrete surface reachable.
- **Whole-feature smoke is mandatory** when there is a main user flow: per-part proofs cannot detect cross-part structural defects. Allocate the smoke twice — once at the end of all work AND once inside a part's test suite, so a breaking change fails the moment it lands, not after everything is "done".

## Independence and Honest Gates

- The prover must not be the author of the code, when separate agents are available; a writer's inventory is approved only by an independent validator — the same actor never both generates and certifies.
- Never claim a gate result the checker did not print. Paste the checker's own output; prose summaries are not gate evidence. Claiming a write or action happened requires re-reading its real output — pasting fabricated output is falsification.
- A self-review is not a substitute for a required independent check — "I re-checked it myself" does not stand in for the gate.
- A failed gate is not a prompt to edit the inputs into passing: a missing case means add the work, never shrink the checker's reach.
- **No aggregate scoring.** Report per-item results; aggregates hide individual zeros.
- **Anti-rationalization:** "already fixed" needs a fresh check proving it; "not my scope" is invalid for the target under review; a partial fix is PARTIAL, not done; every N/A needs a one-sentence justification, and mostly-N/A results are a low-signal flag.
- A crashed or aborted verification run produces no pass — a failed run must never count as coverage.
- Infrastructure failures (rate limits, API errors) are retry conditions and nothing else: the gate is delayed, never skipped, never downgraded. The only honest states are still-running or genuinely-complete.
- Do not claim completeness ("I checked everything") — state what you actually checked. Do not claim actions you did not actually perform through real tools.

## Exit-Code Traps

A proof gates on the exit code, so a command whose output reads correct but whose exit code is inverted is a broken gate that reports green:

- `… | grep -c PATTERN` exits 1 when the count is 0 — an "expect zero matches" gate is exactly backwards. Compare the count instead.
- `git diff --exit-code -- <paths>` with no commit-ish compares worktree↔index and passes vacuously once the change is committed. Pin a base commit.
- A pipeline's exit status is the LAST command's unless pipefail is set.
- A filtered test run that matches nothing reports green while verifying nothing — always assert a non-zero passed count. Naming a test filter before the test exists is guessing.

Runnable forms: `references/fence-and-trap-commands.md`.

## Baseline and Pre-existing Failures

Run the suite once at the start and record which tests are already red. A failure that pre-existed the change is pre-existing debt to record, not a regression to block on — only failures the diff introduced block the work. When the suite fails only in files the change never touched: re-run the scoped suite to show the touched surface green, re-run the failing files alone (parallelism produces timeout flakes), and report WARN with that evidence attached — not PASS, and not a silent scope change. File intersection alone is not proof of innocence — a change to a shared util or fixture breaks tests far from the diff.

## Regression Fence

A regression fence converts "I did not change X" from a claim into a check: a set of paths declared BEFORE the work starts that must come out byte-identical to the base commit, verified mechanically at every verification step — not only at the end. A fence derived afterwards from "whatever happens to be unchanged" proves nothing; the fence is a prediction, and verifying it is the test of that prediction. Typical fences: files declared moved-verbatim, a flag-off path, everything outside a review's scope.

- A deleted or newly-appeared fenced file is a violation — both are invisible to a naive "diff is empty" check.
- A finding against an unchanged fenced file is pre-existing debt, not a defect of this diff. But a finding the diff caused in a fenced file — a caller broken by a changed signature — is in scope: that is what makes it a regression. Incidental typing/compiler/import adjustments directly required to satisfy build gates without changing behavior are acceptable.
- Honest limit: the fence proves byte identity, not behavioral identity. It cannot see a changed dependency, migration, or config the file reads. Say so rather than implying the stronger guarantee.

Command forms (blob-hash comparison and its trap): `references/fence-and-trap-commands.md`.

## Completion Condition

Verification is complete when every claim made is backed by a fresh command run and its read output, every declared proof ran with its expected outcome, pre-existing failures are recorded as such with evidence, and every declared fence is verified byte-identical.
