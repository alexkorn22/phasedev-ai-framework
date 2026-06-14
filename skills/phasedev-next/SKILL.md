---
name: phasedev-next
description: Manual-only workflow step runner. Use this skill only when the user explicitly invokes the skill by name, for example "$phasedev-next" or "use phasedev-next"; do not trigger it automatically for general next-step, continuation, planning, or task execution requests.
---

# PhaseDev Next

## Action Steps

1. Execute the next-step command with the absolute path of the current project:

   ```bash
   bun run /Users/oleksandrkorniienko/WORK/ag-dev-flow/src/cli.ts next --project-path <absolute_current_project_path>
   ```

2. Read the prompt printed to stdout and keep it in context for the rest of the turn.

3. If the command fails, report the failure and the relevant terminal output instead of inventing a prompt.
