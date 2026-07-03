export function renderHelp(unknownCommand?: string): string {
  const unknownCommandBlock = unknownCommand ? `Unknown command: ${unknownCommand}\n\n` : "";

  return `${unknownCommandBlock}PhaseDev AI Framework

Overview:
  PhaseDev is a state-driven agentic engineering flow controller. It stores
  workflow state in the target project under .phasedev/ and prints exact stage
  contracts for AI agents. The controller owns routing, artifact contracts,
  approval gates, validation verdicts, archive state, and allowed state files.

Workflow:
  1. phasedev init-project --project-path <path>
     Create the PhaseDev workspace structure and project config.
  2. phasedev init --project-path <path>
     Print the context-only handshake prompt. This command does not modify files.
  3. phasedev next --project-path <path>
     Print the executable stage contract for the current flow state.
  4. Repeat phasedev next until the change is archived or blocked.

Commands:
  phasedev help
      Print this help. Aliases: phasedev --help, phasedev -h.

  phasedev init-project [--project-path <path>]
      Create .phasedev workspace directories and .phasedev/config.yaml.
      Idempotent: existing directories are reused and an existing config is not overwritten.
      Side effects: writes only under <project-path>/.phasedev/.

  phasedev init [--project-path <path>]
      Print the PhaseDev init handshake prompt.
      Side effects: none. It must not create, read, edit, move, approve, test, or validate files.

  phasedev next [--project-path <path>] [--config <path>]
      Resolve current flow state and print the next executable stage prompt.
      Side effects: may move an archive-ready change into .phasedev/changes/archive/
      before printing the Archive prompt.

  phasedev check [--project-path <path>] [--expect-route <route>] [--expect-stage <stage>]
      Validate current controller route without rendering a stage prompt.
      Side effects: none.

  phasedev check-validation --project-path <path> --scope iteration --iteration-id <N>
  phasedev check-validation --project-path <path> --scope final
      Validate validation_findings.md completion semantics for phase or final validation.
      Side effects: none.

  phasedev check-archive --archive-path <path>
      Validate completed archive state and optional delta specs.
      Side effects: none.

  phasedev config [--project-path <path>] [--config <path>] <key>
      Read a dot-notation config key from .phasedev/config.yaml and print its value.
      E.g.: phasedev config loop.runArchiveStage
      Side effects: none.

  phasedev config set <key> <value> [--project-path <path>] [--config <path>]
      Write a dot-notation config key to .phasedev/config.yaml.
      Side effects: modifies the config file.

  phasedev status [--project-path <path>]
      Print a summary of the current flow: active change, stage, route, artifacts,
      iteration statuses, and validation findings.
      Side effects: none.

  phasedev approve <file> [--by <name>]
      Set approved: true in the YAML frontmatter of an artifact file.
      Side effects: modifies the target file.

  phasedev set-iteration-status <id> <status> [--project-path <path>] [--file <path>]
      Update iteration status (x/~/space or completed/in_progress/not_started).
      Side effects: modifies iteration_plan.md.

  phasedev validate-artifact <file>
      Validate an artifact file without modifying flow state.
      Side effects: none.

  phasedev add-finding <id> <title> <severity> [--class <class>] [--iteration <iteration>] [--file <path>]
      Add a finding row to validation_findings.md.
      Side effects: modifies validation_findings.md.

  phasedev resolve-finding <id> [--file <path>]
      Mark a finding as resolved in validation_findings.md.
      Side effects: modifies validation_findings.md.

  phasedev version
      Print the PhaseDev framework version.
      Aliases: phasedev --version, phasedev -V.
      Side effects: none.

  phasedev changes [--project-path <path>]
  phasedev list [--project-path <path>]
      List all changes (active and archived) with their status.
      Side effects: none.

  phasedev log [--project-path <path>] [--tail N]
      View .phasedev/logs/ralph-log.jsonl entries.
      Side effects: none.

  phasedev reset-change [--project-path <path>] [--yes|--force]
      Reset (move to .trash) the current active change. Requires --yes to confirm.
      Side effects: moves the active change directory to .trash.

Options:
  --project-path, -p <path>   Target project path. Defaults to the current directory.
  --config <path>             Explicit PhaseDev config path for next/config set.
  --expect-route <route>      Expected route for check.
  --expect-stage <stage>      Expected stage for check.
  --scope iteration|final         Validation scope for check-validation.
  --iteration-id <N>              Iteration number for phase validation checks.
  --archive-path <path>       Archived change path for check-archive.
  --by <name>                 Approver name for approve command.
  --file <path>               Explicit artifact path for set-iteration-status, add-finding, resolve-finding.
  --class <class>             Finding class for add-finding.
  --iteration <iteration>     Iteration label for add-finding.
  --tail N                    Show last N log entries.
  --yes, --force              Confirm destructive operations (reset-change).

Generated files:
  .phasedev/config.yaml
      Project-local PhaseDev configuration. If absent, next falls back to the framework config.
  .phasedev/changes/
      Active change roots. At most one non-archive active change should exist.
  .phasedev/changes/archive/
      Archived completed changes.
  .phasedev/specs/
      Long-lived delta specs generated by Archive for future Research context.
  .phasedev/logs/
      Runner logs when loop logging is enabled.

Stages:
  change_intake     Create prd.md and execution_contract.md for the active change.
  code_research     Record source-grounded research_facts.md.
  technical_design  Produce architecture/design.md.
  iteration_planning Produce iteration_plan.md.
  implementation    Execute the current implementation phase.
  iteration_validation Validate the completed iteration.
  final_validation  Validate the full change.
  repair            Fix validation findings.
  archive           Move completed flow state to archive and sync delta specs.

Examples:
  phasedev help
  phasedev init-project --project-path /absolute/path/to/project
  phasedev init --project-path /absolute/path/to/project
  phasedev next --project-path /absolute/path/to/project
  phasedev check --project-path /absolute/path/to/project --expect-route change_intake
  phasedev check-validation --project-path /absolute/path/to/project --scope final
  phasedev check-archive --archive-path /absolute/path/to/project/.phasedev/changes/archive/2026-06-17-my-change
`;
}
