---
name: phasedev-init
description: Manual-only workflow initializer. Use this skill only when the user explicitly invokes the skill by name, for example "$phasedev-init" or "use phasedev-init"; do not trigger it automatically for general initialization, planning, or project setup requests.
---

# PhaseDev Init

## Help Lookup

If you need PhaseDev framework command syntax, available controller flags, or route-check requirements before running the skill command, you may run:

```bash
phasedev --help
```

Use help output only as command reference. It does not replace the prompt printed by `phasedev init`.

## Action Steps

1. Run the initialization command with the absolute path of the current project:

   ```bash
   phasedev init --project-path <absolute_current_project_path>
   ```

2. Read the prompt printed to stdout and keep it in context for the rest of the turn.

3. If the command fails, report the failure and the relevant terminal output instead of inventing a prompt.
