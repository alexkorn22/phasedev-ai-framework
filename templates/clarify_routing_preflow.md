No change directory exists yet, so the agreed task is what creates it.

Route the answers:
1. Summarize the agreed task as one markdown document: a first line `# <one-line change title>`, then these sections in order: `## Task`, `## Requirements`, `## Success signals`, `## Constraints`, `## Out of scope`, `## Assumptions`. The title line is what `phasedev list` shows as the change's summary, so make it name the change itself — a section heading there leaves the change picker showing the word `Task`.
2. Propose Quick or Standard from the understanding you just gained, and get the user's confirmation.
3. Write the summary to a temporary file outside `.phasedev/`, then run:
   `phasedev create-change <slug> [--quick] --task-file <path>`
   The CLI writes it to `intake_task.md`. Both the Standard `change_intake` contract and the Quick `quick_plan` contract inject that file into their sub-agent's prompt directly from disk. Do not pass the summary as `--task "<text>"`: markdown in a shell argument can be mangled.
