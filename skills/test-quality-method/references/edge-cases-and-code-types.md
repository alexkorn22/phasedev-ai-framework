# Coverage Yardsticks

## Edge cases by parameter type

Apply for standard and complex files; thin wrappers test wiring and error propagation only.

| Parameter type | Edge cases to expect in a complete suite |
|---|---|
| string | empty `""`, whitespace, unicode, max-length, single char |
| number | `0`, negative, `NaN`, `Infinity`, max safe integer, float precision |
| array | empty, single element, duplicates, very large, sparse |
| object | empty, missing keys, extra keys |
| boolean | explicit true/false, truthy/falsy coercion traps |
| Date | invalid date, epoch, timezone/DST edge, far future, exact window boundary (`time === deadline`) |
| optional | `undefined`, `null`, missing key vs present-null |
| enum | each valid value, invalid value, `undefined` |
| paginated list | `total ≠ data.length` (proves total comes from the count, not array length), empty page, partial last page, page beyond total |
| slug/identifier | empty after sanitization, unicode-only, leading/trailing separators, collision with incrementing suffix |
| threshold/rule | exact N, N-1 (must not trigger), N+1; each tier boundary independently for escalating rules |
| side-effect method | exact-args verification in every success test, not-called in every error test |
| enum × enum | cross-product (or all diagonal + boundary transitions) via table-driven tests; hardcoded lists: every member — 4 of 5 is incomplete |
| events | concurrent dispatch, out-of-order, duplicate, event during teardown, rapid-fire |
| time-dependent | fake timers mandatory; exact threshold, threshold-1, threshold+1 |

## What to expect per code type

| Code type | What the tests must cover | Mock strategy |
|---|---|---|
| Orchestrator (app/server wiring) | Middleware ordering invariants, route mounting, auth boundaries (presence + order) | Mock route modules and external-dep middleware as pass-through; keep pure middleware real |
| Service | Business-logic branches, error paths, transaction boundaries, side-effect args | Mock external I/O only; real code for internal deps |
| Controller | Validation (400), auth (401/403), success, error shapes | Mock the service layer; real validation and guards |
| Pure/validator | All branches, edge cases per parameter type | Zero mocks |
| Guard/middleware | No header → expected behavior; wrong header → 4xx; correct header → next() called; ordering | Mock downstream only |
| Hook | Return values, state transitions, side effects, cleanup | Mock external effects |
| Component | Render states (loading/error/empty/data), user flows, callback routing | Mock API calls; real render. A routing decision needs an interaction test proving the right handler fires and the competing one does not — render/label-only assertions never cover it |
| API-call wrapper | Success + error + timeout, retry, response parsing | Mock the HTTP layer; assert transformed output, not raw echo |
| State machine | All transitions, invalid transitions rejected, reset | Zero or minimal mocks |
| ORM/DB | Query results (not query shape), empty results, constraint violations, rollback | Real DB with rollback, or predicate-evaluating fake |

## Private methods

Tested through the public API: 3+ branches in a private method get a dedicated describe named after the behavior (not the method), exercised through the public caller; one branch is covered implicitly; a private method shared by several public methods is tested once, plus a delegation check per caller.

## Complexity calibration

Thin (<50 LOC, ≤3 branches): wiring and error propagation only. Standard: all branches, full edge-case checklist. Complex (>200 LOC or >10 branches): all branches plus combinations; test count is never presented as progress — coverage of the inventory is.
