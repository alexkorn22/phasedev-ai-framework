---
name: acceptance-criteria-method
description: Use when turning a feature request, task, or spec into verifiable acceptance criteria — before or alongside implementation planning — or when reviewing existing criteria for vagueness and gaps.
version: 1.0.0
compatibility: universal
metadata:
  source: distilled
---

# Acceptance Criteria Method

## Purpose

Turn ambiguous or high-impact changes into scoped, verifiable acceptance criteria. A criterion earns its place only if a concrete observable outcome, a prohibited side effect, and a named verification method let two people independently agree on whether it was met.

## When to Use

- The expected outcome of a request is not yet observable or testable.
- Writing acceptance criteria for a spec or plan, or reviewing existing ones.
- Not for trivial edits or requests whose acceptance conditions are already clear.

## Two Sources of Truth — Never Mix Them

- Inspect the repository, documentation, schemas, and test infrastructure for technical facts before asking any question. The repository tells you how the system behaves today.
- Do not infer product or business constraints from code. Business rules, compliance and regulatory obligations, contractual SLAs, pricing, data-retention policy, prioritization, and target users cannot be read from a repository. Treat them as unknown until the user supplies them or an authoritative product artifact states them. Record them as assumptions flagged for confirmation, never as discovered facts.
- Record discovered facts separately from user-provided assumptions. Verify numeric counts and existence claims before repeating them as fact; if a claim cannot be verified quickly, label it as inferred or estimated.
- The trap, concretely: "free tier is limited to 100 exports per month" found in code is NOT a discovered fact — a per-tier limit is a business rule to confirm.

## Interviewing

- Ask only questions whose answers are required and cannot be safely inferred. In PhaseDev intake / prompt checkpoints, batch 1-3 concise, related questions in a single stop to respect turn limits; in interactive interview mode, ask one focused topic at a time. When asking the user to choose, present at least two named alternatives with brief trade-offs and why the answer matters. If only one option is viable, record the decision with rationale instead of asking for a rubber stamp.
- When the user adds scope mid-dialogue, acknowledge it explicitly, re-confirm the updated problem statement, and decide together whether it belongs in this scope or a follow-up.
- A request spanning multiple independent subsystems is decomposed first — one scope at a time. Covering everything at once produces vague criteria that cannot drive implementation.
- Do not block implementation by default: require explicit confirmation only when an unresolved decision could create material security exposure, data loss, irreversible migration, contract breakage, meaningful cost, or destructive external action.

## Scope Before Criteria

State: the goal as one sentence describing an outcome, not an implementation choice; what is in scope; tempting adjacent work explicitly out of scope — distinguishing deferred-to-later from permanently excluded; assumptions not yet proven; blocking decisions that materially affect safety or behavior.

## Writing a Criterion

A single declarative sentence of user-observable or system-observable behavior, carrying:

- Scenario or starting condition.
- Action or trigger.
- Expected observable behavior.
- Prohibited side effect, when meaningful.
- Verification method — automated test, integration check, manual UX review, accessibility check, security review, operational check, or stakeholder acceptance — with a safe environment named when verification could affect data, services, cost, or secrets.

Rules:

- No words like "correctly", "securely", "fast", "intuitive", "robust" without defining observable evidence or recording them as a human-review judgment. If the behavior cannot be described without "should work" or "looks right", the criterion is too vague — tighten it.
- Pass/fail must be command-observable; no "it works" prose. The proof — the smallest deterministic procedure that exhibits the behavior — is written alongside the criterion, not invented later. Ask: what artifact would a skeptic accept?
- Tests are an implementation detail of the proof, not the proof itself; and tests are evidence, not truth — allow manual verification where automation cannot establish the outcome.
- A negative, uniqueness, or idempotency criterion is proven by a deliberately seeded conflict, not a happy path — a happy-path-only proof lets a silent-drop implementation pass.
- A subjective-judgment criterion without a numeric target is too vague.
- Criteria must be specific ("handles errors gracefully" is too vague; "returns 400 with validation details when email is missing" is specific), testable, independent of each other, and realistic for the codebase. Criteria and tests are not required to map one-to-one.
- Never include real secrets, credentials, personal data, or sensitive production payloads in criteria, fixtures, or examples — use redacted or synthetic values.
- A criterion covering the main user flow is additionally flagged for an end-to-end (whole-feature) proof, not only per-part proofs.

## Coverage — Only Categories That Apply

Happy path; validation (malformed or boundary input rejected without mutation); authorization/privacy (denied access, no sensitive disclosure); persistence/migration (backward read, rollback); compatibility (existing contracts and fixtures remain valid); failure recovery (no partial state, clear retry or degraded behavior); idempotency/concurrency (no duplicate side effect, valid final state); performance (defined measurement conditions and threshold); UX/accessibility. Skip clearly irrelevant categories — but say which and why.

Edge cases cover input validation; failure modes cover system resilience — what happens when components and dependencies fail during operation. Both are needed; being excellent at one does not cover the other. For each failure mode name: detection, impact radius, user-facing symptom, recovery, data consistency, detection lag. Generic answers ("falls back", "retries") that could be copy-pasted for any dependency are valueless. Not every failure mode needs mitigation — record an explicit accept-the-risk decision per mode instead of mitigating everything or nothing.

An edge-case claim cites evidence (file:line or a pattern showing it is a real concern), not a hypothesis. "Stated requirements appear complete for this scope" is a valid finding.

## Ship vs Success

Separate ship criteria (the feature is broken, confusing, or unsafe without them) from success criteria (measurable evidence the stated goal is achieved). All ship criteria can pass while success criteria fail — infrastructure works but value is not delivered. Both tiers must be present, and every success criterion names its measurement: a specific script, metric, or comparison producing a numeric or pass/fail signal. "Looks good" is not validation.

## Revision

When a criterion cannot be satisfied due to an architectural, platform, or external constraint discovered during implementation, do not silently drop or work around it: update the criterion, state the constraint, adjust scope or verification method, and re-present the change before continuing.

## Reviewing Existing Criteria

Review instead of restarting discovery: find missing scope boundaries, unverifiable requirements ("the system shall be fast"), silent assumptions, and contradictions. Flag only what matters — would an implementer following this literally build the wrong thing, or get stuck and need clarification? Stylistic preferences are not findings. "The spec is vague" is not actionable; "item 3: 'system responds quickly' — no latency threshold defined" is. An empty open-questions list is only valid if the ambiguities are actually resolved — watch for decisions that are still open questions in disguise.

## Checklist Before Returning

- Every required criterion has a scenario, an observable expected result, and a named verification method.
- All vague terms replaced with observable evidence or marked as human judgment.
- Product/business constraints listed as supplied or assumed — none silently inferred from code.
- Scope explicit; out-of-scope named; deferred distinguished from excluded.
- Blocking decisions limited to choices that affect safety or correctness, not preferences.

## Completion Condition

The criteria set is complete when every required behavior is stated so that two people would agree whether it was met, every criterion carries its proof, business constraints are confirmed or flagged as assumptions, and remaining blockers are explicitly listed.
