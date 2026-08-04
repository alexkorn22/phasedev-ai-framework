---
name: spec-delta-method
description: Use when extracting behavioral specifications from existing code, recording spec deltas after a change lands, or keeping a living spec corpus in sync with the implementation.
version: 1.0.0
compatibility: universal
metadata:
  source: distilled
---

# Spec Delta Method

## Purpose

Mine what the code actually enforces into behavioral specs, and keep those specs alive: anchored to the code, verifiable for freshness, and cheap to update with deltas when behavior changes. The output becomes the baseline truth that future change-deltas reference.

## The Model — Two Block Types, No Chapters

A spec is not a document organized by type — it is a flat list of behavioral assertions. Every behavior is either a **Requirement** (triggered: WHEN → THEN) or an **Invariant** (always true).

| Requirement | Invariant |
|---|---|
| "When user submits order, system creates order record" | "Account balance must always equal sum of transactions" |
| "When stock is insufficient, return error INSUFFICIENT_STOCK" | "Inventory quantity must never be negative" |
| Has at least one scenario | Has no scenarios; may carry a verifying-test reference |
| Triggered by an action or event | True at all times, regardless of triggers |

No type chapters — no "API Contracts", "Business Rules", "State Machines" sections. A consumer greps by entities and enforcement points, not by chapter titles; classification chapters add noise, not signal. Every Requirement has at least one scenario; Invariants have none.

## Mining Sources

Capture every behavioral assertion, in any order, from: public function signatures (inputs, outputs, error conditions, side effects); service-layer guard clauses that throw or return early on domain state; status-transition code — every path that changes an entity's status; domain-level validation beyond schema ("start date before end date"); pure calculation functions with domain inputs; authorization checks — role gates, ownership checks, rate limiters; assert statements and database constraints; event emissions and side effects after a behavior completes; saga/compensating rollback logic.

Do not skip a behavior because it doesn't fit a category: if the code enforces something, it goes in the spec.

## Metadata — What Makes a Spec Alive

For each behavior record what is known; if a field cannot be determined, leave it out — never guess:

- **entities** — the domain objects involved, named as they appear in code.
- **enforced** — where in code the behavior is checked, precise enough to jump to (file + method).
- **test** — the existing test covering it, if any.
- **id** — a stable anchor derived from the most upstream enforcement point. It MUST NOT change when the human-readable name changes: it is what future modified-deltas match by — name matching breaks on every rename.
- **depends_on / triggers** — only relationships directly traceable in code as synchronous call chains, within the same capability. Never guess cross-module or event-driven async dependencies — they are not statically traceable.

A Requirement without an enforcement point is a promise with no accountability. Metadata must stay machine-parseable (one key–value per line) — an unsearchable spec is a dead spec.

Every spec records when and against which commit it was last verified against the code — the anchor that makes freshness checks possible. Consumers check that freshness before trusting the spec.

## Scope and Organization

- A capability is a cohesive cluster of related entry points and their backing modules; name it plainly and give it one spec file. A spec exceeding ~500 lines means the capability is too broad — split it.
- Do not mine every module at once — spec rot starts when specs outpace usage. Start with the capabilities actually in use.
- Do not write specs for generated code or vendored dependencies.

## Guardrails

- **Never invent behavior.** If the code does not clearly express a contract, record an explicit uncertainty note with the reason — never create a Requirement from guesswork, and never guess because the code is hard to read.
- **Cross-validate against callers.** A docstring says "returns User | null" but every caller null-checks: the Requirement is what callers rely on, not what the docs claim. Copying docstrings without checking callers produces fiction.
- **Flag, don't fix.** A miner is not a refactorer: code inconsistencies discovered while mining are recorded as uncertainties, not patched.

## Deltas — Syncing Specs with Landed Changes

Every spec is a baseline for future deltas. When a change lands:

- Record the behavioral difference as additions, modifications, and removals against the existing spec — matching modified behaviors by their stable id, never by display name.
- Keep the structure flat so delta operations stay cheap.
- Search related specs for ripple effects: a changed behavior that other specs' dependencies or triggers reference must be reconciled, not left contradicting.
- An ambiguous divergence — where code and spec disagree and the intended behavior is not decidable from the code — is escalated as an explicit uncertainty for a decision, never silently resolved in either direction.
- Update the verification anchor (timestamp + commit) for every spec actually re-checked, and only for those.

## Red Flags

- Type-classification chapters instead of a flat assertion list.
- Describing file structure instead of behavior ("has a controllers/ folder").
- Requirements without entities or an enforcement point.
- Docstrings copied without caller cross-validation.
- Dependencies recorded for async or cross-module relationships on a guess.
- Mining everything at once, or specs for generated/vendored code.

## Completion Condition

Mining or syncing is complete when every enforced behavior in scope is captured as a Requirement or Invariant with its known anchors, every unknown is an explicit uncertainty rather than a guess, deltas are matched by stable ids, ripple effects across related specs are reconciled or escalated, and the freshness anchors reflect exactly what was re-verified.
