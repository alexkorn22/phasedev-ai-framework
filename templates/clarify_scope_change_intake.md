## Scope: task definition (before `change_intake`)

Run this before `phasedev create-change`. No change directory exists yet, and no phase artifact exists.

Read first: the user's task text from the current conversation. Nothing else — `code_research` has not run, so there are no facts on disk yet.

Ask about:
- why the change is needed, and what must be true once it is done;
- what is explicitly out of scope;
- hard constraints the user already holds: modules that must not be touched, no new dependencies, required tooling, performance or security boundaries;
- how success will be proven — which evidence counts.

Do not ask:
- how to implement it, which architecture to take, or how to split the work. Those belong to `technical_design` and `iteration_planning`, which run after `code_research` has produced facts to ground a recommendation.
- anything that does not change artifact content, including the change folder slug.

`from-evidence` sub-agent for this scope: read-only reconnaissance. It answers factual questions only — whether a module already exists, which test commands are real, where something lives — with `file:line` references, and writes nothing.

Route the answers:
1. Summarize the agreed task under these sections: `## Task`, `## Requirements`, `## Success signals`, `## Constraints`, `## Out of scope`, `## Assumptions`.
2. Propose Quick or Standard from the understanding you just gained, and get the user's confirmation.
3. Write the summary to a temporary file outside `.phasedev/`, then run:
   `phasedev create-change <slug> [--quick] --task-file <path>`
   The CLI writes it to `intake_task.md`, and the `change_intake` contract injects that file into the PRD sub-agent's prompt. Do not pass the summary as `--task "<text>"`: markdown in a shell argument can be mangled.
