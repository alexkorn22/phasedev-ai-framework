export function renderHelp(unknownCommand?: string): string {
  const unknownCommandBlock = unknownCommand ? `Unknown command: ${unknownCommand}\n\n` : "";

  return `${unknownCommandBlock}PhaseDev AI Framework

Overview:
  PhaseDev is a state-driven agentic engineering flow controller. It stores
  workflow state in the target project under .phasedev/ and prints exact phase
  contracts for AI agents. The controller owns routing, artifact contracts,
  approval gates, validation verdicts, archive state, and allowed state files.

  Every command accepts a global --json flag: instead of human-readable text,
  it prints one JSON object to stdout ({ ok, kind, phase?, message?, issues?,
  data? }) and exits 0 when ok is true, 1 otherwise. Use --json when driving
  PhaseDev from another agent or script.

Workflow:
  1. phasedev init-project --project-path <path>
     Create the PhaseDev workspace structure and project config.
  2. phasedev init --project-path <path>
     Print the context-only handshake prompt. This command does not modify files.
  3. phasedev create-change --project-path <path> <name>
     Create a new change with an initial state.json.
  4. phasedev phase --project-path <path>
     Print the executable phase contract for the active phase.
  5. phasedev check --project-path <path>
     Validate artifacts for the active phase.
  6. phasedev advance --project-path <path>
     Validate and transition to the next phase.
  7. Repeat phasedev phase / check / advance until the change is archived.

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

  phasedev create-change <name> [--project-path <path>] [--task <text>] [--quick]
      Create a new change directory with state.json (activePhase: change_intake).
      Refuses if an active change already exists.
      --task <text> also writes intake_task.md with the given task description.
      --quick starts a Quick-mode change (activePhase: quick_plan, flowMode: quick) and
      writes a worklog.md skeleton instead of the full artifact set.
      Side effects: creates .phasedev/changes/<name>/ and state.json.

  phasedev phase [--project-path <path>] [--config <path>]
      Print the contract for the active phase (read-only).
      Idempotent: repeated calls (without advance) return the same contract.
      Side effects: none.

  phasedev check [--project-path <path>] [--phase <phase>]
  phasedev check --check-orphans [--project-path <path>]
      Validate artifacts for the active phase (or --phase override).
      --check-orphans instead scans for orphaned or unfinished archive directories.
      Side effects: none.

  phasedev feedback [--project-path <path>]
      Print the user-feedback processing contract for the active change (read-only).
      Defines how an agent classifies feedback (implementation defect vs scope change)
      and which phasedev commands to use. Side effects: none.

  phasedev express [--project-path <path>]
      Print the stateless Express orchestration contract (roles, plan-confirmation stop,
      implementer + reviewer subagents, escalation criteria to create-change --quick).
      Side effects: none. Creates nothing under .phasedev/.

  phasedev advance [--project-path <path>] [--config <path>]
      Validate the active phase and transition to the next phase.
      Refuses if artifacts are invalid, require approval, or archives are blocked.
      Side effects: updates state.json, flips iteration status, archives on archive_ready.

  phasedev next
      DEPRECATED. Prints a warning and exits. Ignores all flags.
      Use phasedev phase and phasedev advance instead.
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
      E.g.: phasedev config runArchiveStage
      Side effects: none.

  phasedev config set <key> <value> [--project-path <path>] [--config <path>] [--string]
      Write a dot-notation config key to .phasedev/config.yaml.
      Values are coerced to boolean/number when they look like one; pass --string to
      store the raw string instead. The OK message states the stored type.
      Side effects: modifies the config file.

  phasedev status [--project-path <path>]
      Print a summary of the current flow: active change, phase, route, artifacts,
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

  phasedev add-finding [F<number>] <title> <severity> --required-fix <text> [--class <class>] [--iteration <iteration>] [--file <path>]
      Add a finding row to validation_findings.md. The ID is allocated automatically
      (next F<number>); pass an explicit F<number> first argument only to target a specific ID
      (a title that is literally "F<number>" is not supported). Creates the file when missing
      and corrects the YAML verdict to stay consistent with the new row.
      Side effects: modifies or creates validation_findings.md.

  phasedev resolve-finding <id> --resolution <text> [--file <path>]
      Mark a finding as resolved with repair evidence (what changed, how it was verified).
      Side effects: modifies validation_findings.md.

  phasedev reopen-finding <id> --evidence <text> [--file <path>]
      Reopen a resolved finding with new concrete evidence; evidence is appended to Resolution.
      Side effects: modifies validation_findings.md.

  phasedev set-verdict <verdict> [--file <path>]
      Record the validation verdict (ready | ready_with_risks | repair_required | repaired)
      in validation_findings.md frontmatter; validates consistency with the current rows.
      Creates the file with an empty table when missing. Updates the date field.
      Side effects: modifies or creates validation_findings.md.

  phasedev version
      Print the PhaseDev framework version.
      Aliases: phasedev --version, phasedev -V.
      Side effects: none.

  phasedev changes [--project-path <path>] [--archived]
  phasedev list [--project-path <path>] [--archived]
      List unfinished changes (with --archived: completed archive too).
      Side effects: none.

  phasedev log [--project-path <path>] [--tail N]
      View .phasedev/logs/ralph-log.jsonl entries.
      Side effects: none.

  phasedev reopen <design|plan> [--project-path <path>]
      Reopen an approved design or plan phase artifact, setting approved: false
      and resetting the active phase back to technical_design or iteration_planning.
      Side effects: modifies the artifact frontmatter and state.json.

  phasedev sync-state [--project-path <path>] [--change <name>]
      Non-destructively roll state.json back to the artifact-derived phase when
      they disagree (e.g. after feedback reset artifact approvals). Artifacts
      are never modified.
      Side effects: modifies state.json; removes .findings-baseline.json.

  phasedev reset-change [--project-path <path>] [--yes|--force]
      Reset (move to .trash) the current active change. Requires --yes to confirm.
      Side effects: moves the active change directory to .trash.

Options:
  --json                       Emit a single JSON envelope to stdout instead of human text. All commands.
  --project-path, -p <path>   Target project path. Defaults to the current directory.
  --change <name>             Target change when several exist (defaults to the only change)
  --config <path>             Explicit PhaseDev config path. Accepted by most commands that read config.
  --phase <phase>             Phase override for check.
  --scope iteration|final         Validation scope for check-validation.
  --iteration-id <N>              Iteration number for phase validation checks.
  --archive-path <path>       Archived change path for check-archive.
  --by <name>                 Approver name for approve command.
  --file <path>               Explicit artifact path for set-iteration-status, add-finding, resolve-finding, reopen-finding, set-verdict.
  --task <text>                Initial task description for create-change; written to intake_task.md.
  --quick                      Start create-change in Quick mode (state-driven quick phase sequence).
  --class <class>             Finding class for add-finding.
  --required-fix <text>       Concrete required fix for add-finding (placeholders like TBD are rejected).
  --resolution <text>         Repair evidence for resolve-finding (placeholders like TBD are rejected).
  --evidence <text>           New evidence for reopen-finding.
  --iteration <iteration>     Iteration label for add-finding. Defaults to "Iteration <N>" from state.json, or "Final" during final validation.
  --tail N                    Show last N log entries.
  --archived                   Include archived changes (changes/list command).
  --check-orphans               Scan for orphaned or unfinished archive directories (check command).
  --yes, --force              Confirm destructive operations (reset-change).
  --string                     Store config set's <value> as a raw string, skipping boolean/number coercion.

Generated files:
  .phasedev/config.yaml
      Project-local PhaseDev configuration. If absent, falls back to the framework config.
  .phasedev/changes/
      Active change roots. At most one non-archive active change should exist.
  .phasedev/changes/archive/
      Archived completed changes.
  .phasedev/specs/
      Long-lived delta specs generated by Archive for future Research context.
  .phasedev/logs/
      Runner logs when loop logging is enabled.

Phases:
  change_intake        Create prd.md and execution_contract.md for the active change.
  code_research        Record source-grounded research_facts.md.
  technical_design     Produce architecture/design.md.
  iteration_planning   Produce iteration_plan.md.
  implementation       Execute the current implementation phase.
  iteration_validation Validate the completed iteration.
  final_validation     Validate the full change.
  finding_repair       Fix validation findings.
  archive              Move completed flow state to archive and sync delta specs.

  quick_plan           (Quick) Research + short plan in worklog.md.
  quick_implementation (Quick) Implement per plan; prove and commit.
  quick_validation     (Quick) Session-managed validation, nothing persisted.
  quick_spec_revision  (Quick) Fresh-context spec-revision verdict.

Examples:
  phasedev help
  phasedev init-project --project-path /absolute/path/to/project
  phasedev init --project-path /absolute/path/to/project
  phasedev create-change --project-path /absolute/path/to/project my-change
  phasedev phase --project-path /absolute/path/to/project
  phasedev check --project-path /absolute/path/to/project
  phasedev advance --project-path /absolute/path/to/project
  phasedev check-validation --project-path /absolute/path/to/project --scope final
  phasedev check-archive --archive-path /absolute/path/to/project/.phasedev/changes/archive/2026-06-17-my-change
`;
}
