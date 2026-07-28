/**
 * Single source of truth for dispatchable CLI command names. cli.ts types its
 * COMMANDS map against this list (a handler cannot be added without extending
 * it), and the help completeness test asserts every name is documented in
 * renderHelp() — together they make "help lists every command" structural.
 */
export const CLI_COMMAND_NAMES = [
  "status",
  "approve",
  "set-iteration-status",
  "validate-artifact",
  "add-finding",
  "resolve-finding",
  "reopen-finding",
  "set-verdict",
  "changes",
  "list",
  "config",
  "log",
  "reset-change",
  "reopen",
  "sync-state",
  "init-project",
  "init",
  "create-change",
  "phase",
  "feedback",
  "clarify",
  "advance",
  "archive",
  "check",
  "check-validation",
  "check-archive",
  "version",
  "next"
] as const;

export type CliCommandName = (typeof CLI_COMMAND_NAMES)[number];
