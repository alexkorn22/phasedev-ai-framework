# Quality Checklist — Check Meanings, N/A Validity, Focus by Code Type

Checklist meanings only; there is no score arithmetic. Each check is answered 1 (proven, with file:function:line), 0 (violated or unproven), or N/A (precondition inactive — one-sentence justification required). A stack-mismatched check is out-of-scope, not N/A. N/A requires the same evidence rigor as a 0 (cite the negative search); checks core to the file's code type can never be N/A — fix the classification instead. Report per-file results, never aggregated across files.

## Checks

**Types.** Unions/enums/branded types where plain string/number is too loose; explicit return types on public functions; no implicit any, no `as unknown as X`, no unjustified non-null assertions.

**Validation (critical).** Input validated at every boundary: required fields, format/range/allowlist, runtime schema at the entry point. Identity validators (`(v) => v`, bare casts after `.json()`) validate nothing.

**Security-critical.** Auth guards paired with query-level tenant scoping (guard alone is insufficient); zero sensitive data in logs, errors, response bodies, headers, or query params. Deeper security classes belong to the security review pass.

**Resources (critical).** No unbounded memory growth from external data — pagination, streaming, batching; all queries bounded; listeners/timers/observers cleaned up; caches have TTL or invalidation; queues and fan-out bounded; deterministic release on every exit path, not just the happy path.

**Errors (critical).** Infrastructure failures handled: no empty catch, timeouts on outbound calls, response status checked before parsing, no infra details leaked. Silent-failure hunt: errors converted to null/defaults without context, dangerous fallbacks that hide real failure, lost stack traces, generic rethrows, missing rollback around transactional work.

**Data.** Multi-table mutations in transactions with FK order respected; nullables guarded; monetary values in exact arithmetic (actual currency only — indices and ratios are N/A); a single canonical source per data point; multi-store writes have a NAMED consistency mechanism (outbox, saga, reconciliation) with the partial-failure path exercised.

**Structure.** Size within thresholds (see size-thresholds.md — auxiliary signal); no magic values; no dead code (commented-out old implementations are dead code; explanatory comments and documented workarounds are not); no duplicated logic — procedure: list methods over 20 lines, find blocks sharing 10+ structurally identical lines; count identical try/catch/handler patterns, 5+ repetitions fail regardless of block size; beware "each block is only 3 lines" — total duplicated lines matter; new code follows existing project patterns ("special snowflake" is a violation).

**Async/Concurrency.** Every async call awaited or explicitly fire-and-forget with a catch; no sequential await where batch suffices; no N+1; no check-then-act races — mutations idempotent or CAS-protected; cancellation propagated, not re-created mid-chain; every spawned task has an owner that joins or aborts it; shared mutable state race-free by construction and proven by tooling — a review opinion is not proof, the race detector is.

**Contract.** Request AND response shapes runtime-validated; API changes additive or versioned with a deprecation path.

**Observability.** Structured logger with context, correct levels: error for unrecoverable failures, not validation; validation failure logged as error is a violation.

**Distinguishing adjacent findings:** deleting one of two fields loses information → dual source of truth; both merely inconsistent style → magic values/style.

## N/A validity — the traps

- "It's simple" — if it accepts user input, validation applies. "Internal service" — if it touches user-scoped data, scoping applies.
- "Small dataset" — external data size is never guaranteed. "Low traffic" — races happen at any traffic.
- "Types are enough" — types vanish at runtime. "One listener" — 1 listener × 1000 mounts = 1000 listeners.
- "Legacy" / "it's better this way" — not valid excuses; consistency beats preference.
- "Input is trusted" — provenance, not trust, decides. "Auth middleware covers it" — that is authentication, not per-operation authorization.
- Pure-computation files still get audited: return types, guarded casts, size, money arithmetic — "no DB" exempts only the DB checks.
- Test utilities/mocks/fixtures are audited as production code, with auth/log/query checks N/A unless they implement the real thing; do not force service expectations onto helper factories.

## Focus checks by code type

| Code type | Watch for |
|---|---|
| Service | status-as-string, missing validation, guard without query filter, unhandled DB errors, duplication, float money, N+1, dual-store sync, TOCTOU, stale cache, log levels |
| Controller | missing DTO, auth bypass, PII in error, magic codes, dead endpoints, missing response schema, breaking API change |
| UI component | unbounded list, null crash, oversized file, dropped promise, listener leak, pattern inconsistency |
| ORM/DB | unbounded queries, missing LIMIT, wrong delete order, null column, N+1, stale cache |
| Orchestrator | all-IDs-in-memory, no error handling, no transaction, dropped promises, inverted timeouts |
| Hook | unbounded spread, no abort handling, oversized body, missing cleanup |
| Pure | stringly-typed, no return type, null edge case, magic numbers, float money |

## Common false positives — skip unless codebase-specific evidence exists

- "Consider adding error handling" where the caller or framework handles it (error middleware, boundaries, upstream catch).
- "Missing input validation" on an internal function whose callers validate — trace at least one caller first.
- "Magic number" for well-known constants (HTTP codes, 1000 ms, 1024, index 0/−1) and single-use locals with a clear name.
- "Function too long" for exhaustive switches, config objects, test tables, generated code — length is not complexity.
- "Missing docs" on self-describing internal helpers; "prefer const" without reading the whole function.
- "Possible null dereference" where the type is narrowed or a guard is in scope — trace type flow, don't pattern-match on `?.`.
- "N+1" on fixed small cardinality or batched paths; "missing await" on intentional fire-and-forget (look for `void` or a comment).
- Suggesting a stack change ("should use TypeScript") — match the project's language.
- "Hardcoded value" in test fixtures and examples — tests should have hardcoded expectations.
- Security theater: noncryptographic randomness in animation/jitter/sampling; code-loading primitives in an explicit plugin surface.
- "Hardcoded secret" matches on comment lines, `.env.example` placeholders, test fixtures, obvious placeholder tokens — a real finding is an assignment to a live config value.

The test for all of these: would a senior engineer on this team actually change this in review? If no, skip.
