---
name: dev-core
description: Use when writing, editing, designing, or reviewing code in any language or stack — features, bugfixes, refactors, tests, config, dev tooling, or specs that directly drive implementation. Also use when deciding where new code belongs, how to structure a change, or whether a new abstraction or layer is warranted.
version: 1.4.0
compatibility: opencode, codex, antigravity, claude
metadata:
  category: engineering
  priority: core
  applies_to: design,coding,refactor,bugfix,review,tests,devops,docs
---

# DEV-CORE - Core Coding Discipline

## Purpose

Language-agnostic coding discipline for implementation work. It targets both failure modes of AI-generated code at once:

- **Spaghetti (under-structure)**: tangled responsibilities, wrong placement, hidden coupling, copy-pasted rules.
- **Over-engineering (over-structure)**: speculative layers, pass-through files, a framework built for a one-off change.

Good code sits between them: the smallest complete change, placed correctly, that the next requirement extends instead of rewrites.

**Strict Enforcement**: All rules in this skill are MANDATORY and NON-NEGOTIABLE whenever this skill is invoked. The agent must strictly enforce every requirement without taking shortcuts, guessing domain logic, or negotiating discipline away.

## Mindset: Code Audience & Zero-Shortcut Imperative

Write code as if it will be reviewed and maintained by a ruthless, exhausted senior engineer who will reject any bloated diff or hidden complexity — write for long-term clarity, not quick compliance. If the change is not obvious, self-explanatory, and surgical on first read, it is unacceptable.

- **Dual Maintainer Compatibility (Human & AI)**: Code is read by both humans (in MRs/code reviews) and future AI agents. It must be explicit, self-contained, and free of hidden coupling or implicit magic so any future maintainer — human or AI — can safely extend it in minutes without a rewrite.
- **Zero Shortcuts**: Never choose a quick patch, dummy fallback, or suppressed check to make a prompt pass. Every change must be engineered for the long-term health of the codebase.

## When to Use

Any implementation-level work: designing changes, writing code, refactoring, bugfixing, writing or changing tests, config, CI, or dev tooling; reviews that lead to concrete changes; specs or docs that directly drive implementation decisions.

Do not use for read-only exploration, summary, or explanation when no implementation-level change is requested.

## Communication Mode

This skill governs internal engineering behavior only.

- Run the discipline silently: no DEV-CORE progress reports, ceremonial summaries, or internal checklists in user-facing output.
- If clarification is required to proceed safely, surface the minimum necessary question — ask it when a user channel exists, otherwise record it in the artifact or final response and stop.
- Executable and config code: English only — identifiers, comments, test names, string literals, logs, errors. Specs and narrative artifacts may use another language when appropriate.

## Priority Rules

1. Repository instructions, architecture docs, existing module boundaries, and nearby code patterns override generic preferences in this skill.
2. Correctness, safety, and security come before style preferences.
3. Type safety, explicit contracts, and defensive boundaries beat clever logic.
4. Readability, simple structure, and clear names come before comments.
5. Small scope beats broad cleanup — but small scope never means partial solution (see Core Rule).
6. Extensibility is required at real boundaries and active axes of change; speculative architecture is prohibited.

## Core Rule: Minimal Scope, Complete Solution & Surgical Mutation

Write the smallest clear change that fully solves the task, fits the surrounding code, lands in the correct architectural place, and remains human-reviewable.

Minimal **scope** is not minimal **effort**:

- Small in reach — touches only what the task requires.
- Complete in substance — solves the problem at its root, handles the edge cases the task implies, contains no stubs, TODOs-instead-of-code, or "main case for now" gaps.
- Surgical mutation — preserve working code, existing abstractions, and nearby patterns. Never rewrite an existing working module or create massive code churn (+1000 lines diff for a minor feature) when a targeted extension point is possible.

A symptom patch that adds a special-case branch for the failing input is not a smaller change; it is a wrong-level change.

Locality in practice — every changed line must connect to the request or to preserving a correct boundary:

- Do not move, rename, or reformat unrelated code; no drive-by fixes or style cleanup of untouched code.
- Remove only dead code created by your own change; preserve unrelated user or teammate changes.

## Think Before Coding

Resolve ambiguity and evaluate system impact before committing to an approach, not after.

- **Ruthless Self-Review**: Before writing code, ask: *"Will this change be clear and surgical for a human reviewer to verify, and easy for the next maintainer to extend without rewriting?"*
- **System Model & Impact Analysis (Theory Building)**: Understand *why* existing code has its current shape before changing it. Assess how proposed changes affect neighbor modules, callers, downstream services, and future roadmap requirements. Never break the system's conceptual model for a quick local hack.
- **Proactive Clarification Gate**: If business requirements, external contracts, or critical edge cases are ambiguous or missing, STOP and surface the minimal necessary question. When you can ask the user directly (main-agent / interactive context), ask it; when you cannot (a PhaseDev sub-agent dispatch has no mid-task user channel), surface the ambiguity in the artifact, your final response, or a blocker, and stop — never guess domain logic or silently proceed on unverified load-bearing assumptions.
- State the assumptions that shape your approach; verify or ask about load-bearing uncertain ones.
- If the request has multiple reasonable interpretations, surface them instead of silently picking one.
- If a simpler approach exists than the one requested, say so and push back when warranted.
- If something is genuinely unclear, stop and name what is confusing rather than guessing.

Keep the process silent (see Communication Mode); make explicit only the material assumptions, tradeoffs, and ambiguities — the ones that change what you build.

## Understand Before Editing

Editing code you have not read produces duplicates and foreign patterns. Minimum analysis before any edit:

- Read the region you are changing **and its callers/consumers**, not just the target function.
- Before adding any helper, utility, or type: search the project for an existing one.
- Before introducing a pattern: find how the project already solves the analogous problem and repeat its way.
- Before changing a signature or contract: find every consumer first, not after something breaks.
- Read the existing tests for the area — they document the expected behavior and the contract.
- Before judging existing code wrong, understand why it has its current shape — it may encode a constraint you have not seen yet.
- In an unfamiliar stack: derive idioms from the surrounding code and the ecosystem's canonical style. The codebase is the source of truth.

## Coding Loop

1. Understand the local code, data flow, and ownership boundary (see Understand Before Editing).
2. Design data shapes, interfaces, and function contracts before writing logic.
3. Make the smallest complete change.
4. Place code where the responsibility belongs, not where editing is convenient.
5. Clean up only the code you touched.
6. Run the most relevant available check (tests, type checker, linter, static analysis).
7. Review the diff against the Exit Checklist.

The loop is proportional to the task: a small fix stays small; a cross-module change still preserves clear boundaries.

---

## Architecture Placement

Before adding files, moving code, or introducing a module, answer internally:

- Which existing layer, module, feature, or boundary owns this responsibility?
- Which dependency direction is allowed here?
- Where would the next similar change be added?

Place code by responsibility, not by convenience. If the project has an explicit architecture, follow it; if not, infer the local architecture from nearby code before editing.

Feature-envy check: a function that mostly reads and combines another module's data belongs to that module — move the function to the data instead of reaching across the boundary.

## Abstraction Calibration

Introduce a new layer, interface, abstraction, module, or file ONLY when at least one observable predicate holds:

1. **Rule of three**: the same *meaning* (not merely a similar shape) is now duplicated a second or third time.
2. **Real axis of change**: this spot has already changed along this axis, or the requirements explicitly name variants ("support X and Y"). "Might need it later" is not an axis.
3. **Unstable boundary**: it isolates an external or unstable system (API, DB, framework, transport) the way the project already isolates such things.
4. **Existing boundary**: the boundary already exists in the project — extend it; never build a parallel one.

No predicate holds → write direct code in the existing place. This gate is what keeps one action from becoming 15 files. It applies to named design patterns too: a pattern is introduced because a predicate holds, never because the pattern has a name — "let's use a Factory/Observer here" is not a justification.

Example: "send a welcome email after signup" gets a direct call in the signup flow — not an `EmailProviderInterface` + factory + config layer. When a second provider actually arrives (predicate 2), building that seam becomes its own small change.

## Extensibility = Seams, Not Layers

"Easy to extend" comes from correct seams and deep modules, not from pre-built extension machinery.

- **Deep modules**: small interface, substantial implementation. Many thin files that forward calls are the opposite.
- **One decision per module**: each module hides one design decision, so a changed requirement changes one place.
- **Localization test**: name the one or two most probable next changes — from requirements and history, not imagination. Each should land in exactly one place. If a changed requirement means a rewrite, the seams are wrong; if adding a trifle means class + interface + factory, there are more layers than axes of change.
- **Interface degradation test**: if extending a unit accumulates boolean flags and parameter bloat, do not add another flag or another layer — restructure the unit. Make the change easy, then make the easy change.

## Two Failure Modes — Steer Between Them

**Under-abstraction (spaghetti):**

- One function, file, or module doing several jobs that each have their own reason to change.
- One logical change smeared across many places (shotgun surgery).
- One business rule copy-pasted into several branches.
- Type-switching conditionals where existing variants already justify polymorphism.
- UI, data access, validation, domain logic, and orchestration mixed without a boundary.
- Hidden side effects, implicit global coupling, dependencies flowing backwards.
- Message chains reaching through foreign structures (`a.b().c().d()`) instead of asking the nearest boundary for what is needed.
- Magic strings or numbers where a named constant or enum states the meaning.

**Over-abstraction (framework disease):**

- A layer with a single implementation and no test or config reason to exist.
- Pass-through methods and transit files that only forward calls.
- Interfaces, generics, factories, registries instantiated exactly once.
- Adding one field forces the same edit through DTO → mapper → interface → service → repository: shotgun surgery caused by layers.
- Helpers used once that add indirection, not clarity.

**Transit-file metric**: after the change, count new or changed files that contain logic versus files that only forward calls. Transit-only files are candidates for collapse.

## Module-Level SOLID

Apply to files, modules, packages, and layers — to prevent architectural spaghetti, never to justify abstraction:

- One clear reason to change per module.
- New behavior through existing boundaries, not by rewriting consumers.
- Same boundary → same contract: inputs, outputs, errors, side effects.
- No fat interfaces consumers only partially use.
- Orchestration depends on stable contracts, not concrete low-level details.
- Composition over inheritance: inherit only for a true is-a with a fully substitutable contract; reuse code through composition or delegation. A hierarchy deeper than two levels is a smell.

## Ubiquitous Domain Language

Name classes, functions, variables, and modules by domain meaning, not technical noise: `CancelSubscriptionAction`, not `SubscriptionManagerHelper`.

These rules are semantic and language-agnostic; take casing and affix idioms from the stack reference and the surrounding code:

- **Generic names are forbidden** for modules, classes, and functions: `utils`, `helpers`, `common`, `Manager`, `processData`, `handleItem`, `temp`, `data2`. A name that could label anything explains nothing — name the responsibility it holds.
- **A boolean name reads as a yes/no question** about its subject; a name that does not answer yes or no does not belong on a boolean.
- **A value with a unit or scale carries the unit in its name**: a timeout, size, or amount states its milliseconds, bytes, or currency — the reader must never guess.
- **A function name starts with the action it performs and covers everything it does**: a function doing more than its name promises is misnamed or doing too much.

## Function-Level Readability

Modules decide structure; functions decide readability. These are observable triggers, not taste — when one fires, restructure before finishing:

- **Nesting deeper than two levels** → flatten with guard clauses or extract the inner block as a named step.
- **A boolean flag parameter that switches behavior** → split into two functions named for each behavior; a flag is two responsibilities sharing one signature.
- **More than four parameters** → group them into a single typed parameter object.
- **The same group of parameters traveling through several signatures together (data clump)** → introduce a type for the group; it is an undeclared domain concept.
- **Orchestration mixed with low-level detail in one body** → extract the detail into named steps so the function reads at a single level of abstraction, top to bottom.
- **A function that both answers a question and mutates state** → split it into a query and a command (command–query separation); an atomic operation that must do both (pop, check-and-set) carries both actions in its name.
- **A compound condition or expression the reader must decode** → extract it into a named predicate or explaining variable.

Pass condition: a reviewer reads the function once, top to bottom, and can state what it does without pausing to decode any part.

---

## Defensive Boundaries, State & Resources

- **Guard clauses**: validate preconditions and error conditions early, return or throw immediately; no nested if-else pyramids.
- **Make invalid states unrepresentable**: strict types, enums, tagged/discriminated unions, sealed types, validation schemas — whatever the language offers.
- **Domain concepts get domain types**: an identifier, money amount, email, or quantity does not travel as a bare string or number — wrap it the way the project or stack reference prescribes (value object, branded type, backed enum) so mixed-up arguments fail at the type level.
- **Validate at boundaries**: parse and validate all external input (requests, DB rows, env vars, CLI args, file content) at entry points, before domain processing.
- **Trust types past the boundary**: once input is parsed and validated at the entry point, domain code trusts its types. Re-checking what the type system already guarantees — null checks on non-nullable values, re-validation of already-parsed data — is forbidden noise.
- **Injection-safe by default**: never interpolate data into queries or shell commands — parameter binding only. Never leak secrets, tokens, or stack traces into responses or logs.
- **Atomicity**: wrap state changes spanning multiple entities or tables in explicit transactions.
- **Every invariant has one owner (aggregate)**: when a business invariant spans several entities, one owning unit — the aggregate root — enforces it, every mutation goes through that owner, and the transaction boundary is the aggregate. No multi-entity invariant → no aggregate: plain CRUD stays plain CRUD.
- **Explicit errors**: fail fast with typed or domain errors. Never swallow errors silently or return vague fallbacks where failure must surface.
- **Catch where you can act**: handle an error only at the level that can recover, translate it into a domain error, or fulfill the operation's contract; everywhere else let it propagate. No blanket try/catch wrappers, no intermediate catch-log-rethrow layers. Exceptions are not control flow: for an expected condition, test the condition or return a typed result instead of probing with try/catch.
- **Immutability by default**: prefer creating new immutable values over mutating shared structures in place. Never reassign or mutate function parameters; never expose internal mutable collections or structures — return a copy or a read-only view.
- **Isolate side effects**: keep core domain logic pure; push I/O, network, persistence, and rendering to the edges.
- **Deterministic cleanup**: release connections, handles, and locks (try/finally, RAII, using); explicit timeouts on all network and async operations.

## Test Economy

A test earns its place only if it can fail for a real behavioral reason. If it cannot tell working code from broken code, do not write it.

**Push back on meaningless tests**: If asked to implement a ballast or meaningless test, STOP and warn the user. Explain why the requested test provides no behavioral safety, and propose testing a meaningful public contract or behavioral invariant instead.

Test behavior at public contracts. A few contract tests beat a heap of shallow ones.

**Never write** (ballast tests):

- Assertions on static UI text, copy, labels, CSS classes, styles, or markup structure.
- Assertions pinned to the exact wording of error or log messages — assert on the error type or code instead.
- Tests that verify a mock returned what the mock was told to return.
- Tests of the framework or library itself instead of your logic.
- Tautological assertions, or tests duplicating what the type checker already guarantees.
- Snapshot tests with no meaningful invariant behind them.
- Tests of trivial getters, setters, or pass-through mappings.
- A new test file duplicating existing coverage — extend the existing suite instead.
- New test infrastructure for a single case.

When production behavior or contracts change, updating the affected tests is part of the change, not an extra.

## Performance Discipline

- No I/O, queries, or remote calls inside loops — batch, eager-load, or restructure.
- Never load a full collection for a count, existence check, or first element; paginate or stream unbounded reads.
- Run independent async operations concurrently; never leave promises/futures floating unawaited.
- No quadratic passes where a linear or indexed path exists at plausible data sizes.
- Symmetric limit: no speculative optimization — optimize when evidence or obvious scale demands it.

## Comment Rule

Prefer self-explanatory code over comments. If a comment is needed because the code is hard to read, improve names and structure first. Use comments only for non-obvious constraints, tradeoffs, algorithms, external requirements, or surprising decisions.

## Dependency Rule

Prefer existing project utilities, contracts, and boundaries over new dependencies or new abstractions. Add a dependency or shared layer only when it clearly reduces total complexity inside the current architecture.

## Public Contract Rule

When touching exported APIs, schemas, routes, events, props, config, or shared utilities:

- Preserve the existing contract unless the task requires changing it.
- Keep implementations interchangeable behind the same boundary.
- Update consumers only when the contract intentionally changes; verify behavior at the boundary.

---

## Goal-Driven Execution

Turn the task into a verifiable goal before implementing, then loop until it is met.

- "Add validation" → "invalid inputs are rejected with a typed error, proven by a test".
- "Fix the bug" → "a test reproduces the bug, then passes after the fix".
- "Refactor X" → "the same tests pass before and after the change".

For multi-step work, hold a brief internal plan where each step names its own check. A weak criterion ("make it work") is a signal to sharpen the goal or ask — not to start coding.

## Verification Rule

Verify the behavior with the most relevant available check.

- Run the project's static checks (type checker, linter, analyzer) at the strictness the project configures, and pass them cleanly.
- Bugfix: reproduce first when feasible, then prove the fix. Refactor: prove behavior preserved. Feature: verify the concrete scenario that was added.
- Tests: Arrange-Act-Assert; verify behavior and public contracts, not private internals.
- Docs/specs: verify clarity, consistency, and alignment with implementation constraints.

Do not claim completion without knowing what was checked or why it could not be checked.

## Red Flags — STOP and Return to the Root Cause

Catching yourself doing any of these means the fix is at the wrong level or the discipline is being negotiated away. Stop and fix the cause instead:

- Taking shortcuts, using dummy fallbacks, or suppressing checks to quickly complete a prompt instead of engineering a complete solution.
- Rewriting an existing working module or file when a targeted surgical edit or extension point exists.
- Guessing ambiguous business logic, contract details, or edge cases instead of surfacing the question (to the user when possible, otherwise as a recorded blocker).
- Implementing a requested ballast/meaningless test without warning the user and pushing back.
- Producing massive, unreviewable diffs or performing drive-by refactoring of unrelated code.
- Blaming generated defects or bugs on LLM tooling — the agent holds full accountability for every line created.
- Adding a special-case branch for the exact failing input instead of fixing the general rule.
- Weakening, skipping, or deleting a failing test to make the suite pass.
- Hardcoding the value a test expects.
- Swallowing an error or widening a catch so the flow "works".
- Suppressing type checks (`any`, ignore-comments, non-null assertions) "temporarily".
- Leaving a stub, TODO, or partial implementation and reporting the task as done.
- Adding a layer, interface, or config option "for the future" with a single implementation.

## Exit Checklist

Confirm internally before finishing; any "no" means fix the change first:

1. The change strictly adheres to all DEV-CORE rules — no shortcuts or negotiated discipline.
2. The change fully solves the task at the root cause — no stubs, no special-case patches; edge cases handled or explicitly clarified.
3. Diff is surgical, minimal, and reviewable — no code churn, no drive-by refactoring, no rewritten working modules.
4. System model and impact on neighbor modules were evaluated; existing architectural theory preserved.
5. Code sits where the responsibility belongs; dependencies flow in the allowed direction.
6. Every new abstraction has a fulfilled predicate (Abstraction Calibration); no transit-only files.
7. The most probable next change lands in one obvious place without rewriting this one.
8. Types are strict, boundaries validated, errors explicit — nothing suppressed to make checks pass.
9. Tests assert real behavior; no ballast tests; affected tests updated.
10. No I/O in loops, no unbounded reads; independent async runs concurrently.
11. Only task-required lines changed, and the most relevant check actually ran.
12. Every Function-Level Readability trigger respected; no generic names; domain concepts typed.

## Stack References

When the task is in one of these stacks, read the matching reference and apply it on top of this core:

- PHP (8.x+): [references/php.md](references/php.md)
- TypeScript / JavaScript: [references/typescript.md](references/typescript.md)
