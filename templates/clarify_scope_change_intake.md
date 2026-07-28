## Scope: task definition (before `change_intake`)

Run this before the `change_intake` sub-agent writes anything. No phase artifact exists yet, whether or not the change directory has been created.

Ask about:
- why the change is needed, and what must be true once it is done;
- what is explicitly out of scope;
- hard constraints the user already holds: modules that must not be touched, no new dependencies, required tooling, performance or security boundaries;
- how success will be proven — which evidence counts.

Do not ask:
- how to implement it, which architecture to take, or how to split the work. Those belong to `technical_design` and `iteration_planning`, which run after `code_research` has produced facts to ground a recommendation.
- anything that does not change artifact content, including the change folder slug.

`from-evidence` sub-agent for this scope: read-only reconnaissance. It answers factual questions only — whether a module already exists, which test commands are real, where something lives — with `file:line` references, and writes nothing.

{{intake_routing}}
