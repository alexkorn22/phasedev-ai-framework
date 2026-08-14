# Size Thresholds — Auxiliary Reviewer Signal

These are reviewer calibration numbers, NOT authoring rules: exceeding one is a signal to look closer, weighed with everything else. They were derived empirically from scored implementation benchmarks; a project's own conventions override them.

Lines measured = executable body lines, excluding blanks, imports, type definitions, and comment-only lines.

## Files

| Category | Limit |
|---|---|
| UI component (single responsibility) | ≤ 200 |
| UI component (page/container with state) | ≤ 300 |
| Hook | ≤ 250 |
| Controller | ≤ 300 |
| Service (≤4 public methods) | ≤ 300 |
| Service (5–8 public methods) | ≤ 450 |
| Service (9+ public methods) | split into two services |
| Guard / interceptor / middleware | ≤ 100 |
| Utility / helper file | ≤ 100 |
| Constants file | ≤ 80 |
| Type definitions / test files / migrations | no limit |

A file exceeding 2× its category limit is an automatic structural failure. An inline sub-component or helper closure ≥50 lines inside a parent component file is a violation regardless of total file size.

## Functions

| Category | Limit |
|---|---|
| Public method | ≤ 50 |
| Private helper | ≤ 30 |
| Controller/request handler | ≤ 25 (delegate to service) |
| Transaction callback | ≤ 60 (lookup + validation + status check + audit + return) |
| Effect body | ≤ 20 (extract logic to a callback) |
| Event handler | ≤ 20 |
| Pure calculation | ≤ 30 |

## Shape limits

Nesting depth ≤ 4; conditions per if ≤ 3 (extract a named predicate); parameters ≤ 5 (options object beyond); chained ternaries ≤ 2; constructor dependencies ≤ 5 (a sixth reads as a god-service); per-component state hooks ≤ 6, effects ≤ 3.

## When to split — and what must NOT move

Split on: category limit exceeded; 9+ public methods (split by domain); 3+ distinct UI sections with independent state; 5+ private helpers (extract a helpers module); types section over ~80 lines.

Counter-rule for stateful boundaries (SDK wrappers, adapters, facades): a split that is "clean" by line count and breaks every consumer is a failed refactor. Keep on the class anything tests call on the instance (or migrate the tests in the same change); keep identity re-exports of contract types at the historical import path; verify reachability at the original path before moving anything.

## Portability

Calibrated on a TS service stack. Function limits carry to any language unchanged — they measure comprehension, not syntax. For file limits, use the project's own convention if one exists; otherwise default to ≤ 400 lines per module with 2× as the automatic failure. Do not stretch UI-component rows onto non-component code.
