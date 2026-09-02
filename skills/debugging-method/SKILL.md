---
name: debugging-method
description: Use when investigating any bug, failing test, build error, or unexpected behavior — before proposing a fix — to reach a confirmed root cause through reproduction, baseline, and bounded hypotheses.
version: 1.0.0
compatibility: universal
metadata:
  source: distilled
---

# Debugging Method

## Purpose

A disciplined process for turning a bug report, error message, or unexpected behavior into a confirmed root cause, a verified fix, and a permanent regression test. Proving the bug exists first is what separates a fix from a tweak.

## The Phases

REPRODUCE → MINIMAL REPRO → BASELINE → DIAGNOSE → FIX + VERIFY.

**1 — Reproduce.** Establish a clear, reproducible failure. Gather: expected behavior; actual behavior; exact reproduction steps; scope (always, intermittently, all users, or specific conditions?); timeline (when did it start — config change, dependency update?). If reproduction is inconsistent, flag a potential race condition, environment dependency, or test-order dependency.

**1.5 — Minimal repro.** A stack trace proves an error occurred at some point — it does not prove the error is reproducible right now. Run the failing test or hit the failing endpoint. Reproduces → continue. Doesn't → the trace may be from a different state (stale data, previous build); go back and re-gather. Intermittent → run 3 times to confirm flakiness, proceed with a flaky flag. Skip this phase only when the failure is self-evident (a type error visible in code, a compilation failure).

**2 — Baseline.** Before changing anything, determine whether this is a new regression or a pre-existing problem: run the existing tests for the affected area (any already failing?). Record the baseline: N passing, M failing; regression YES / NO (pre-existing) / UNKNOWN.

Then narrow, in order, stopping when the failure point is found: the full error trace, not just the last line — the root cause is usually earlier in the chain; logs around the failure time; dependencies and configuration; environment comparison (works in one env, fails in another — find the difference); binary search along the code execution path.

**3 — Diagnose.** Trace the execution path from entry point to failure. Form at most 3 hypotheses, ordered by likelihood; for each, name the evidence that would confirm or rule it out, and gather it — each "why" is verified with data, not opinion. If 2 hypotheses fail, pivot: re-read the code path from scratch, add logging, or widen the search — do not keep guessing in the same direction. The root cause is a specific line, condition, or assumption — distinguish it from symptoms, and confirm the suspected cause explains ALL observed symptoms. Treat a root cause as confirmed only when 2+ independent signals agree (e.g. temporal match + code overlap + reproduction); on a single signal, do not take risky actions. When causes interact, name every contributing cause — a single-chain "why" ladder hides interactions.

**4 — Fix + verify.**
- Apply the minimal fix at the root cause only — no refactoring adjacent code, no unrelated fixes.
- Check side effects (other callers, the function's contract) and edge cases (null, empty, concurrent, high-load).
- Run the tests for the affected area, then compare with the baseline: no new failures may appear.
- Re-run the exact original reproduction. If the bug still occurs, the diagnosis was wrong — return to phase 3; do not keep patching.
- Write a regression test that recreates the exact triggering condition, asserts the correct behavior, and would have caught this bug if it had existed before the original code was written. If the honest test would be red on current code mid-way, do not weaken the assertion and do not park the bug: pin current behavior with a characterization test, fix, then flip it to the corrected contract.
- Add defense in depth where it makes sense — entry-boundary guard, business-logic invariant, environment check at startup, instrumentation that makes this failure class visible — so a similar bug fails loudly and early instead of silently propagating.

## Error-Type Playbook

| Error type | Most common root causes |
|---|---|
| undefined / null | Missing null guard, wrong property key, async timing issue |
| Wrong value | Off-by-one, unit mismatch, stale cached data |
| Permission denied | Auth context not propagated, access rules misconfigured, missing query filter |
| Timeout | N+1 query, missing database index, unbounded loop |
| Flaky / intermittent | Race condition, shared global state, test-order dependency |
| Works in dev, fails in prod | Missing env variable, production data edge case, timezone difference |

Surface-specific narrowing sequences (API, frontend, database, async): see `references/domain-playbooks.md`.

## Regression Diagnosis Track

For regressions where previous behavior was expected to work:

- Write a minimal automated test that reproduces the failure on current code.
- Analyze the code path against the requirement or design contract to locate the broken invariant.
- Fix the root cause and ensure the newly added test passes alongside the full test suite.

## Build Errors

- Goal: a passing build with minimal changes — no refactoring, no architecture changes, no improvements.
- Collect ALL errors first; group by file; fix in dependency order (imports and types before logic).
- One error at a time: read the context, diagnose the root cause, apply the smallest fix, re-run. A new error after a fix is a fresh diagnosis, not a batch. A single root cause often produces multiple error messages — after fixing, scan for the same pattern elsewhere.
- Never suppress to go green: no type-check escapes, lint-disable comments, or skipped checks without a documented reason why the rule is genuinely inapplicable. Fix the root cause, not the symptom. If the error indicates a real architectural problem, stop and report — do not paper over.
- Stop and escalate when: the same error persists after 3 attempts (a deeper issue); a fix introduces more errors than it resolves; the fix requires architectural changes; a missing external dependency needs the user's decision.

## When You Are Stuck

Retrying the same action with slightly different wording is not debugging. In order: restate the real objective in one sentence; verify the world state (files, branch, processes) instead of trusting memory; shrink the failing scope to one command, file, or test; run one discriminating check — is the failure deterministic or transient, and what is the smallest reversible action that would validate the diagnosis? Only then retry.

## Red Flags

- Fixing without reproducing first, or "fixed" without re-running the original reproduction.
- Re-running a pipeline until a transient green appears, instead of recording the failure and why it went away.
- A "root cause" that is the problem statement reworded, or "human error" — why did the system allow the error?
- "Cannot reproduce" treated as "does not exist".
- Guessing in the same direction after two failed hypotheses.
- Touching risky areas (migrations, auth, contracts, money) with batched fixes — there, one fix at a time, tests after each, immediate revert on breakage.

## Completion Condition

Debugging is complete when the root cause is named at a specific file and line and explains all observed symptoms, the original reproduction is confirmed resolved, no new failures appeared against the baseline, and a regression test pins the behavior.
