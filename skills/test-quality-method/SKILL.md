---
name: test-quality-method
description: Use when auditing whether existing tests actually protect behavior — judging assertion strength, oracle independence, and real coverage of a test suite, as opposed to writing tests or verifying task completion.
version: 1.0.0
compatibility: universal
metadata:
  source: distilled
---

# Test Quality Method

## Purpose

The auditor's discipline for answering: what behaviors does the production file actually own, which of them are genuinely tested, and what single missing test would improve confidence the most. Exists to catch coverage theater — suites that are green while protecting nothing. A green suite is not evidence of quality.

## Auditor Stance

- **Production-first and contract-blind.** Read the production file fully FIRST and build the behavior inventory from source. Only then read the test file. Do not read the test author's plan, self-evaluation, or prior findings before your own judgment — do not inherit the writer's plan. If that isolation is unavailable, do not claim a blind audit happened.
- **Evidence or nothing.** Every judgment cites file:line or a specific quote. "Tests are thorough" is not evidence. Never evaluate from memory — read the actual files.
- **Scope: the touched surface**, not the whole suite. Pair every test file with its production counterpart; a test without a source is an orphan finding. Sibling test files for one production file are judged together.
- Do not silently audit incorrect production behavior: dead guards, code contradicting its comments, validation gaps get flagged — one test flagging a problem is worth more than 50 tests legitimizing it.

## Coverage Inventory

Enumerate every behavior the production file owns: branches (if/else/switch/ternary/early return), error paths (throw/reject/catch), fallbacks (defaults, empty/loading/error states), side effects (logging, mutation, dispatch, storage), callback and prop forwarding, accessibility output, async state transitions, delegation contracts. Classify ownership honestly: a thin delegator is audited on its forwarding contract, not downstream logic; a barrel/re-export file owns nothing; "delegated" is for genuine forwarding, never for "hard to test".

For each inventory row, map the strongest test evidence: fully proven by a behavioral assertion; partially proven; not proven; structurally asserted only (presence/markup/mock shape without runtime behavior); reachable only by violating a production constraint; genuinely unreachable (dead defensive guard — recommend remove-or-annotate, not a test); or not applicable.

- "Rendered something" is not "proved the fallback path" — that is structural only.
- An unproven owned error path, side effect, or forwarding contract is a gap regardless of how green the suite is.
- Name the **highest-value missing test** — one concrete test, and verify it is REACHABLE under production constraints before demanding it.
- Do not fail a thin delegator for not testing downstream business logic; pass-through proven plus forwarded args verified is full coverage for it.

## Oracle Independence

For each expected value, verify its source: spec/requirements (best); manual calculation from business rules as a literal — `220`, not `100 * 2 * 1.1` (good); known reference data (good); inverse operation like `decode(encode(x)) === x` (good); **copied from the implementation — reject**. Rejected sources, verbatim: "I ran the function and it returned X"; "the code does X * Y so I expect X * Y"; "the mock returns X so I check for X".

Two questions for every exact assertion: Where did this expected value come from? Would changing the implementation change it — and if the test would then be wrong, it tests implementation, not behavior.

For financial and algorithmic code derive expected values from two independent sources; disagreement is flagged before asserting, not resolved silently.

Exception — pass-through delegation: when the method's contract IS "return exactly what the delegate gives", asserting the mock's return value is the behavioral test — but only combined with verifying the forwarded args, and only when the body is a bare delegation with no transformation.

## Assertion Strength

Rate detection power: (1) existence — catches almost nothing; (2) structural/shape; (3) exact value; (4) interaction with exact args; (5) semantic — verifies computed output. Do not score a file by assertion-level percentages. Owned behavior needs a causal, oracle-independent assertion at value or semantic strength; existence-only and shape-only assertions are supporting evidence, not sufficient proof. Strength and provenance are orthogonal: an exact-value assertion whose expected value is echoed from setup still fails the oracle check.

Classify and report: STRONG behavioral — keep; WEAK (`toBeDefined`, `toBeTruthy`, typeof) — required-fix: add a value assertion; TAUTOLOGICAL (expected mirrors implementation) — required-fix: replace with a spec-derived literal; DEAD (always-true, silent skip, unreachable) — required-fix: delete and replace. The auditor records each remediation as a finding (class `test`); it does not edit the test file itself — in a PhaseDev validation phase the auditor is read-only, and the implementer performs the remediation under finding repair. If weak, tautological, or dead assertions dominate the file's evidence, flag "rewrite, not patch" in its finding, not rewritten in place.

## Critical Checks — any failure sinks the file

1. Every error-throwing path tested with the specific error TYPE and MESSAGE.
2. All code branches exercised.
3. Tests import the ACTUAL production code, not a local copy.
4. Assertions verify content and values, not just counts or shape.
5. No tautological oracles.

Each pass claim carries a proof line (name the test, quote the assertion, enumerate the branches). No proof — it did not pass. N/A leaves the denominator and never counts as a pass; every N/A gets a one-sentence justification; a mostly-N/A audit is low-signal, not clean.

## Structural Rules

- **Boundary rule:** every numeric threshold N needs three tests — N-1 (must not trigger), N (boundary), N+1. The #1 boundary bug pattern; do not leave it for later review to find.
- **Error paths, both halves:** the correct error is thrown AND the operations after the throw point did NOT run.
- **Side-effect inventory:** every side-effect dependency (audit, email, cache, events) has exact-args verification in every success test and a not-called assertion in every error test — the #1 gap in first-pass suites.
- **Positive anchor:** a test with only negative assertions passes when the function returns nothing. Prove output exists before proving what it excludes.
- **Causal oracle:** the decisive assertion observes state that only the event under test could have produced. An assertion that would pass with the feature deleted is not an oracle.
- **Scoping tests need a real predicate:** a WHERE-ignoring fake invalidates ownership/tenancy tests — the missing-filter leak still passes. Seed two competing rows, assert the non-target row is untouched, or use a real in-memory database.

## Mocks

Priority ladder: real implementation → real with controlled inputs/in-memory DB → lightweight fakes → mocks, last resort, justified only by external I/O, non-determinism, or cost. Mock at the boundary (HTTP client, SDK), not your own services and mappers. A mock needing 10+ stubs or type-cast gymnastics means: use the real class. Every mock is verified positively (exact args) and negatively (not called on failure paths); mock state resets between tests; a mocked module the production code never calls is a phantom implying coverage that does not exist; a permissive catch-all mock means the test tests the mock. When testing dedup/merge, assert WHICH item survived, not the count.

## Quick-Fail Patterns

Any of these fails the oracle check outright: always-true assertion; UI input echo (type 'x', assert 'x'); mock-return echo; opaque dispatch (`typeof fn`); silent conditional skip (`if (empty) return`); wrong hand-built initial state; loading-only state assertions; tautological formula oracle; raw `.length` compare; vague quantity on a known fixture; persistent skips without ticket/expiry; a committed focus marker (`.only`) — silently disables the rest of the suite while CI reports green; retry annotations masking flakiness. Pre-scan signals: zero assertions in a test; fixture-to-assertion ratio over 20:1; a majority of existence-only assertions. Examples and detection greps: `references/quick-fail-patterns.md`. Coverage yardsticks per parameter type and per code type: `references/edge-cases-and-code-types.md`.

## Mutation Probes

Mentally apply five mutations to the production code and name the test that would catch each: negate the main condition; remove a null guard; swap an operator (`>=`→`>`); change a return value; change the error type/message. A mutation no test would catch is a coverage gap — a surviving probe means the suite asserts shape, not behavior; the file is not clean until the probe is killed.

## Fix Discipline

Strengthening only: a "fix" that deletes or weakens an assertion to satisfy the audit is the exact anti-pattern this audit exists to stop. An assertion that fails after strengthening is a PRODUCTION finding routed to remediation, not a test edit. Bounded passes: after the audit-fix-reaudit cycle hits its cap, an honest WARN with the remaining gaps — never a silent pass.

## Completion Condition

The audit is complete when the ownership inventory is built from source, every owned behavior has mapped evidence with file:line, the critical five are proven or failed explicitly, every N/A is justified, and the single highest-value missing test is named and reachable.
