---
name: tdd-method
description: Use when implementing a behavior you have decided to cover with a test — to run the red-green-refactor cycle correctly. Batch size is owned by the host flow; this skill governs the cycle mechanics only.
version: 1.0.0
compatibility: universal
metadata:
  source: distilled
---

# TDD Method

## Purpose

The mechanics of the red-green-refactor cycle: write the test first, prove it fails for the right reason, implement exactly enough to pass, refactor without changing behavior.

## Scope

This skill governs HOW to run the cycle once a behavior has been chosen for test coverage. It does not decide WHAT to cover — test selection is governed by the project's testing discipline (a test earns its place only if it can fail for a real behavioral reason). Where a behavior is deliberately not covered by a test, this cycle does not apply.

## The Cycle

**RED — a failing test first.**

- Write a test that describes the behavior you are about to implement, then run it.
- Confirm the new test fails — and fails for the right reason: missing function, wrong return value — not a syntax error, import failure, broken test setup, or an unrelated regression.
- A valid RED is either runtime (the test target compiles, the test is actually executed, and it fails on the intended behavior) or compile-time (the test newly instantiates or exercises the missing code path, and the compile failure is itself the intended signal). A test that was only written but not compiled and executed does not count as RED.
- If the test passes immediately, something is wrong: either the behavior already exists (you do not need to write code) or the test is not testing what you think it is. Investigate before proceeding.
- Do not edit production code until the RED state is confirmed.
- For a bug fix: RED is a test that reproduces the bug; GREEN is the fix that makes it pass.

**GREEN — minimal implementation.**

- Write only enough production code to make the failing test pass.
- Rerun the same test target; confirm the new test passes AND all existing tests still pass. If existing tests break, fix the regression before proceeding.
- Do not add functionality beyond what the test requires. If you need more behavior, go back to RED and write another test first.

**REFACTOR — behavior-preserving cleanup.**

- Only after a valid GREEN. Look for duplication, unclear naming, or structural improvements in both production and test code.
- Run the suite after: all tests must still pass — the refactoring must not change any behavior. If it does, undo it: either make it behavior-preserving, or go back to RED and write a test for the new behavior first.
- Pure refactoring where existing tests already cover the behavior and remain green needs no fresh RED.

Then repeat: RED for the next behavior, GREEN to implement it, REFACTOR to clean up.

## Red Flags

| Signal | What it means | Action |
|---|---|---|
| Test passes on first run | Not testing new behavior | Investigate: does the behavior already exist? Is the assertion right? |
| "The existing tests cover this" | May be true — verify it | Run the existing tests with the new code removed. If they pass, the behavior is NOT covered — write a test. |
| Test exists but never ran red | GREEN without RED — the test may be vacuous | Delete the production code temporarily, confirm the test fails, then restore. |
| "I'll write the tests after" | Deferred testing disguised as pragmatism | For a behavior chosen for coverage, the test comes first. |
| Refactor makes a test fail | REFACTOR violated its constraint | Undo. Either a behavior-preserving version, or a new RED first. |

## Iteration Boundary — Yield to the Host Flow

The red-green-refactor cycle governs HOW you implement one behavior. HOW MANY items you run is owned by the host flow, not this skill. Inside an approved batch, continue item-to-item without artificial pauses — but stop the moment the host flow's boundary stops you.

In PhaseDev's implementation phase the boundary is one iteration: the phase contract authorizes exactly the current iteration, then requires a transition through `phasedev advance` before the next. Do not continue into the next iteration in the same run, even though the full plan map is visible — implement the current iteration, then stop and report it ready for validation. Future iterations are boundary context, not authorization.

Stop when: the host flow's boundary is reached (one iteration, in PhaseDev); every item in the authorized scope reached a terminal state; the user explicitly interrupts; or a genuine blocker requires a decision only the user can make.

## Completion Condition

The cycle for a behavior is complete when its test was seen red for the right reason, then green with all existing tests passing, and any refactoring left the suite green. A batch is complete when every item in the host-flow-authorized scope reached a terminal state.
