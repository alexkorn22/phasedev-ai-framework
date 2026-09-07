## Scope: task definition (before `change_intake`)

Run this before the `change_intake` sub-agent writes anything. No approved phase artifact exists yet: either nothing has been written, or a previous run's `prd.md` / `execution_contract.md` are on disk with their approval reset, and this phase will rewrite them.

Ask about:
- why the change is needed, and what must be true once it is done;
- what is explicitly out of scope, including modules, APIs, and behaviors that must not change;
- concrete usage examples for the changed surface: exact input, output, and error for API, CLI, UI, or library calls;
- hard constraints the user already holds: modules that must not be touched, no new dependencies, required tooling, performance or security boundaries;
- how success will be proven — which evidence counts;
- which commands prove the change at each gate — `unit`, `phase`, `full` — exactly as this repository really runs them (for example a per-file test runner versus a full-suite runner or monorepo task runner), confirmed against real config by the `from-evidence` sub-agent; a wrong gate command in `execution_contract.md` silently weakens every later validation.

Do not ask:
- how to implement it, which architecture to take, or how to split the work. Those belong to `technical_design` and `iteration_planning`, which run after `code_research` has produced facts to ground a recommendation.
- anything that does not change artifact content, including the change folder slug.

`from-evidence` sub-agent for this scope: read-only reconnaissance. It answers factual questions only — whether a module already exists, which test commands are real, where something lives — with `file:line` references, and writes nothing.

{{intake_routing}}
