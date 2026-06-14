---
name: phasedev-next
description: Manual-only workflow step runner. Use this skill only when the user explicitly invokes the skill by name, for example "$phasedev-next" or "use phasedev-next"; do not trigger it automatically for general next-step, continuation, planning, or task execution requests.
---

# PhaseDev Next

## Action Steps

1. Execute the next-step command with the absolute path of the current project:

   ```bash
   phasedev next --project-path <absolute_current_project_path>
   ```

2. Read the prompt printed to stdout and treat it as the executable stage contract for this turn.

3. Execute only the printed stage contract:
   - Do not run `phasedev next`, `phasedev init`, or the flow controller again.
   - Do not move to the next stage.
   - Do not set human approval automatically.
   - Stop when the stage contract requires stopping.
   - If the stage contract requires files, checks, or blockers, complete those actions before the final response.

4. If the command fails, report the failure and the relevant terminal output instead of inventing a prompt.
