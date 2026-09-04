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

## The Model — Requirements With Scenarios

A spec is a flat list of behavioral assertions called Requirements. Every Requirement carries at least one Scenario (WHEN → THEN). There is one block type only — no Invariant type, no type chapters ("API Contracts", "Business Rules", ...). An always-true assertion (an invariant the code enforces) is written as a Requirement whose scenario states the invariant condition. A consumer greps by capability name and requirement name, not by chapter; classification chapters add noise, not signal.

The on-disk format is fixed by the archive linter (`phasedev check-archive`) and the phase 7 contract — both below. Match it exactly; do not invent metadata blocks, id fields, or a separate block type.

## Mining Sources

Capture every behavioral assertion, in any order, from: public function signatures (inputs, outputs, error conditions, side effects); service-layer guard clauses that throw or return early on domain state; status-transition code — every path that changes an entity's status; domain-level validation beyond schema ("start date before end date"); pure calculation functions with domain inputs; authorization checks — role gates, ownership checks, rate limiters; assert statements and database constraints; event emissions and side effects after a behavior completes; saga/compensating rollback logic.

Do not skip a behavior because it doesn't fit a category: if the code enforces something, it goes in the spec.

## Spec Format — Match the Archive Linter

The archive linter accepts exactly these section headings and no others:

- `## ADDED Requirements`
- `## MODIFIED Requirements`
- `## REMOVED Requirements`
- `## RENAMED Requirements`

Inside them, every requirement starts with `### Requirement: <name>` and a normative `The system SHALL ...` (or `MUST`). Every scenario starts exactly with `#### Scenario: <name>` and lists `WHEN` / `THEN` steps. `MODIFIED` carries the full updated requirement, not a patch. `REMOVED` gives a `Reason:`. `RENAMED` gives `Renamed to:`. Use only the sections a change needs.

There are no metadata blocks (no `entities`, `enforced`, `test`, `id` key–value lines) and no stable-id field — a modified requirement is matched by its requirement name within the capability. A capability is one directory `specs/<capability>/spec.md`; the directory name is the join key across delta and live spec.

Capability, enforcement, and test references still matter as EVIDENCE for the miner — record them in the requirement's prose or scenario steps (e.g. "enforced in `orders.service.create`"), never as a separate metadata block — neither the linter nor the phase 7 contract accepts metadata blocks.

## Scope and Organization

- A capability is a cohesive cluster of related entry points and their backing modules; name it plainly and give it one spec file. A spec exceeding ~500 lines means the capability is too broad — split it.
- Do not mine every module at once — spec rot starts when specs outpace usage. Start with the capabilities actually in use.
- Do not write specs for generated code or vendored dependencies.

## Guardrails

- **Never invent behavior.** If the code does not clearly express a contract, record an explicit uncertainty note in the requirement's prose — never create a Requirement from guesswork. Phrase uncertainty without the words the archive linter rejects (`TBD`, `TODO`, `unknown`, `clarify later`, `to be decided`): prefer "needs human verification" with the reason.
- **Cross-validate against callers.** A docstring says "returns User | null" but every caller null-checks: the Requirement is what callers rely on, not what the docs claim.
- **Flag, don't fix.** A miner is not a refactorer: code inconsistencies discovered while mining are recorded as uncertainty notes, not patched.

## Deltas — Syncing Specs with Landed Changes

Every spec is a baseline for future deltas. When a change lands:

- Record the behavioral difference under `## ADDED Requirements` / `## MODIFIED Requirements` / `## REMOVED Requirements` / `## RENAMED Requirements` — matching modified behaviors by their requirement name within the capability directory, never by an invented id.
- Keep the structure flat so delta operations stay cheap.
- Search related specs for ripple effects: a changed behavior that other specs' dependencies or triggers reference must be reconciled, not left contradicting.
- An ambiguous divergence — where code and spec disagree and the intended behavior is not decidable from the code — is escalated as an explicit uncertainty for a decision, never silently resolved in either direction.
- Update the verification anchor (timestamp + commit) for every spec actually re-checked, and only for those.

## Project Knowledge & Anti-Patterns Mining

During archive or spec sync, in addition to behavioral specs, mine project-specific engineering lessons and traps from resolved findings in `validation_findings.md`.

### How to Distinguish Systemic Errors from Local Noise:
Do NOT mine trivial mistakes into repository memory. Follow these explicit categorization rules:

1. **Noise / Local Glitches (DISCARD - do NOT record in memory)**:
   - Formatting and linter nits (`Severity: NIT`).
   - Simple typos, forgotten single imports, rename oversights, or one-off off-by-one errors.
   - Minor omissions that required only a single local line fix without altering conceptual design.

2. **Systemic Design & Architecture Errors (Record in `knowledge/antipatterns.md`)**:
   - **Class**: `Class: design` or `Class: security` with `Severity: MUST-FIX`.
   - **Root Cause**: The agent made an invalid assumption about architectural boundaries (e.g., leaking DB logic into API handlers, introducing circular dependencies, violating clean architecture, failing to isolate tenancy).
   - **Trigger**: Any finding where fixing required changing the data flow, contract boundaries, or interface design across multiple files.

3. **Systemic Coding & Framework Errors (Record in `knowledge/antipatterns.md`)**:
   - **Class**: `Class: implementation` with `Severity: MUST-FIX` or `RECOMMENDED`.
   - **Recurrence**: Similar defects occurred more than once across iterations or reviews (e.g., 2+ findings related to unhandled promise rejections, unclosed db connections, or mutation of shared state).
   - **Framework Gotchas**: The mistake arose from a non-obvious API constraint, runtime behavior, or hidden framework invariant (e.g., ORM query batching quirks, subtle transaction rollback rules, event listener leaks).

4. **Phase-Specific Process Traps (Record in `knowledge/phases/<phase>.md`)**:
   - **Class**: `Class: plan` (e.g. slicing iterations with hidden dependencies), `Class: test` (e.g. testing mocks instead of reality, flaky timeouts, sandbox path restrictions), or `Class: requirements` (missed PRD edge cases).

### Required Memory Entry Format:
Each entry must follow this concrete, water-tight structure:
- **[Component / Subsystem]**:
  - *Context*: Triggering scenario or task.
  - *False Assumption (Anti-Pattern)*: What the agent incorrectly assumed or implemented.
  - *Failure Evidence*: Finding ID (`F#`) and the observed defect.
  - *Preserved Invariant (Correct Pattern)*: The mandatory rule to follow in future phases.

## Red Flags

- Type-classification chapters instead of a flat assertion list.
- Describing file structure instead of behavior ("has a controllers/ folder").
- Requirements without entities or an enforcement point.
- Docstrings copied without caller cross-validation.
- Dependencies recorded for async or cross-module relationships on a guess.
- Mining everything at once, or specs for generated/vendored code.

## Completion Condition

Mining or syncing is complete when every enforced behavior in scope is captured as a Requirement (with at least one Scenario) in the archive-linter format, everything that could not be determined from the code is recorded as an explicit uncertainty note rather than a guess (worded without the linter's banned tokens), deltas are matched by requirement name within the capability, ripple effects across related specs are reconciled or escalated, and every produced spec would pass `phasedev check-archive`.
