#!/usr/bin/env bun
import { getConfigValue, loadConfig, resolveConfigPath } from "./entities/config/config";
import { checkArchiveCompletion, findOrphanedArchiveDirectories } from "./features/phase-control/check-archive";
import { checkPhase, checkValidationCompletion, ValidationCheckOptions } from "./features/phase-control/check-flow";
import { Phase } from "./entities/phase/types";
import { getInitPrompt } from "./features/phase-control";
import { renderHelp } from "./features/cli-help/render-help";
import { initProject } from "./features/project-init/init-project";
import { parseConfigPath, parseProjectPath } from "./shared/cli/parse-project-path";
import { parseStringOption, FlagValueError } from "./shared/cli/parse-string-option";
import { getFlowStatus, renderFlowStatus } from "./features/flow-status/get-status";
import { approveArtifact } from "./features/artifact-ops/approve-artifact";
import { resolveArtifactPath } from "./features/artifact-ops/resolve-artifact-path";
import { setIterationStatus } from "./features/iteration-ops/set-iteration-status";
import { validateArtifact } from "./features/artifact-ops/validate-artifact";
import {
  addFinding,
  resolveFinding,
  reopenFinding,
  setFindingsVerdict,
  isPlaceholderRequiredFix,
  deriveIterationLabel,
  FindingsCreateContext
} from "./features/artifact-ops/manage-findings";
import { todayIsoDate } from "./shared/time/today-iso-date";
import { listChanges, renderChanges } from "./features/flow-status/list-changes";
import { viewLog } from "./features/flow-status/view-log";
import { parseConfigGetKey } from "./features/config-ops/parse-config-get-key";
import { resetChange } from "./features/flow-state/reset-change";
import { resolveChangeDir } from "./entities/change/active-change";
import { AmbiguousChangeError, MissingPhasedevDirError, UnknownChangeError } from "./entities/change/change-errors";
import { loadFlowState } from "./entities/change/flow-state";
import { buildChangePaths, SYSTEM_DIR } from "./entities/change/paths";
import { acquireLock, FileLock, LockHeldError } from "./shared/fs/state-lock";
import { createChange } from "./features/phase-control/create-change";
import { reopenPhase, ReopenablePhase } from "./features/phase-control/reopen-phase";
import { syncState } from "./features/phase-control/sync-state";
import { getPhasePrompt } from "./features/phase-control/get-phase-prompt";
import { getFeedbackPrompt } from "./features/phase-control/get-feedback-prompt";
import { expectedFindingsType } from "./features/phase-control/expected-findings-type";
import { advanceFlow } from "./features/phase-control/advance-flow";
import { runArchive } from "./features/phase-control/archive-command";
import { reportCliResult, extractIssueLines } from "./shared/cli/json-output";
import * as fs from "fs";
import * as path from "path";

const BOOLEAN_FLAGS = new Set(["--json", "--version", "--help", "--force", "--yes", "--check-orphans", "--quick"]);

function firstPositional(args: string[]): string | undefined {
  for (let i = 1; i < args.length; i++) {
    const token = args[i];
    if (!token.startsWith("-")) {
      return token;
    }
    if (!BOOLEAN_FLAGS.has(token)) {
      i++;
    }
  }

  return undefined;
}

function parseArchivePath(args: string[]): string | undefined {
  return parseStringOption(args, "--archive-path");
}

function parseValidationCheckOptions(args: string[]): { options?: ValidationCheckOptions; error?: string } {
  const scope = parseStringOption(args, "--scope");
  if (scope !== "iteration" && scope !== "final") {
    return { error: "check-validation requires --scope iteration|final." };
  }

  if (scope === "final") {
    return { options: { scope } };
  }

  const rawIterationId = parseStringOption(args, "--iteration-id");
  const iterationId = rawIterationId ? Number.parseInt(rawIterationId, 10) : NaN;
  if (!Number.isInteger(iterationId) || iterationId <= 0) {
    return { error: "check-validation --scope iteration requires --iteration-id <N>." };
  }

  return { options: { scope, iterationId } };
}

function parseVersion(): string | undefined {
  try {
    const pkgPath = path.resolve(__dirname, "..", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    return pkg.version;
  } catch {
    return "unknown";
  }
}

function parseTail(args: string[]): number | undefined {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--tail" && args[i + 1]) {
      const n = Number.parseInt(args[i + 1], 10);
      if (!Number.isNaN(n) && n > 0) return n;
    }
  }
  return undefined;
}

function hasFlag(args: string[], ...flags: string[]): boolean {
  return args.some(arg => flags.includes(arg));
}

function resolveFindingsPath(projectPath: string, changeName?: string): string {
  try {
    const changeDir = resolveChangeDir(projectPath, changeName);
    if (!changeDir) return "";
    return buildChangePaths(changeDir).findingsPath;
  } catch {
    return "";
  }
}

function findingsCreateContext(projectPath: string, changeName?: string): FindingsCreateContext {
  const state = loadFlowState(projectPath, changeName);
  return {
    type: state?.activePhase === "final_validation" ? "final" : "iteration",
    date: todayIsoDate()
  };
}

function findingsTypeCoercion(projectPath: string, changeName?: string): "iteration" | "final" | undefined {
  const state = loadFlowState(projectPath, changeName);
  return state ? (expectedFindingsType(state.activePhase) ?? undefined) : undefined;
}

/**
 * Serialize state-mutating commands for a project behind a single lock file so
 * two concurrent invocations cannot interleave writes to the same change. The
 * action owns its own console output and exit code; only a held lock short-circuits.
 */
function runWithStateLock(projectPath: string, action: () => void): void {
  if (!fs.existsSync(path.join(projectPath, SYSTEM_DIR))) {
    throw new MissingPhasedevDirError(projectPath);
  }

  const lockPath = path.join(projectPath, SYSTEM_DIR, "state.lock");
  let lock: FileLock;
  try {
    lock = acquireLock(lockPath);
  } catch (error: unknown) {
    if (error instanceof LockHeldError) {
      console.log(`[PHASEDEV] BLOCKED: another PhaseDev operation holds the lock ${error.lockPath} (pid ${error.pid}). Wait for it to finish, or remove the lock file if that process is gone.`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  try {
    action();
  } finally {
    lock.release();
  }
}

/**
 * Serialize a mutating command only when the project is initialized. Commands
 * that legitimately run before .phasedev/ exists (create-change bootstrap,
 * finding commands pointed at an external --file) keep their current behavior:
 * with no project lock to contend for, they run directly. Real in-project
 * concurrency always has .phasedev/ present and is therefore serialized.
 */
function runWithOptionalStateLock(projectPath: string, action: () => void): void {
  if (fs.existsSync(path.join(projectPath, SYSTEM_DIR))) {
    runWithStateLock(projectPath, action);
    return;
  }
  action();
}

interface CommandContext {
  args: string[];
  jsonMode: boolean;
  projectPath: string;
  changeName?: string;
}
type CommandHandler = (ctx: CommandContext) => void;

function handleVersion(ctx: CommandContext): void {
  const version = parseVersion();
  reportCliResult(ctx.jsonMode, { ok: true, kind: "version", humanMessage: version ?? "unknown", data: { version } });
}

function handleStatus(ctx: CommandContext): void {
  const config = loadConfig(resolveConfigPath(ctx.projectPath, parseConfigPath(ctx.args)));
  const status = getFlowStatus(ctx.projectPath, ctx.changeName, config.blockingSeverity);
  reportCliResult(ctx.jsonMode, {
    ok: true,
    kind: "status",
    phase: status.phase,
    humanMessage: renderFlowStatus(status),
    jsonMessage: `Active change: ${status.activeChange ?? "none"}`,
    data: { ...status }
  });
}

function handleApprove(ctx: CommandContext): void {
  const filePath = ctx.args[1];
  if (!filePath || filePath.startsWith("--")) {
    reportCliResult(ctx.jsonMode, {
      ok: false,
      kind: "approve",
      humanMessage: "[PHASEDEV APPROVE] FAILED: <file> is required.\nUsage: phasedev approve <file> [--by <name>]"
    });
    return;
  }
  const approvedBy = parseStringOption(ctx.args, "--by");
  const resolvedPath = resolveArtifactPath(ctx.projectPath, filePath, ctx.changeName);
  runWithStateLock(ctx.projectPath, () => {
    const result = approveArtifact(resolvedPath, approvedBy);
    const prefix = result.ok ? "[PHASEDEV APPROVE] OK" : "[PHASEDEV APPROVE] FAILED";
    reportCliResult(ctx.jsonMode, {
      ok: result.ok,
      kind: "approve",
      humanMessage: `${prefix}: ${result.message}`,
      jsonMessage: result.message,
      data: { file: resolvedPath, approvedBy: approvedBy ?? null }
    });
  });
}

function handleSetIterationStatus(ctx: CommandContext): void {
  const rawId = ctx.args[1];
  const rawStatus = ctx.args[2];
  if (!rawId || !rawStatus || rawId.startsWith("--") || rawStatus.startsWith("--")) {
    reportCliResult(ctx.jsonMode, {
      ok: false,
      kind: "set-iteration-status",
      humanMessage: "[PHASEDEV SET-ITERATION-STATUS] FAILED: <id> and <status> are required.\nUsage: phasedev set-iteration-status <id> <status> [--project-path <path>] [--file <path>]"
    });
    return;
  }

  const id = Number.parseInt(rawId, 10);
  if (!Number.isInteger(id) || id <= 0) {
    reportCliResult(ctx.jsonMode, {
      ok: false,
      kind: "set-iteration-status",
      humanMessage: `[PHASEDEV SET-ITERATION-STATUS] FAILED: <id> must be a positive integer, got "${rawId}".`
    });
    return;
  }

  let mappedStatus: "completed" | "in_progress" | "not_started";
  if (rawStatus === "x" || rawStatus === "completed") {
    mappedStatus = "completed";
  } else if (rawStatus === "~" || rawStatus === "in_progress") {
    mappedStatus = "in_progress";
  } else if (rawStatus === " " || rawStatus === "space" || rawStatus === "not_started") {
    mappedStatus = "not_started";
  } else {
    reportCliResult(ctx.jsonMode, {
      ok: false,
      kind: "set-iteration-status",
      humanMessage: `[PHASEDEV SET-ITERATION-STATUS] FAILED: invalid status "${rawStatus}". Expected: x/~/space, completed/in_progress/not_started.`
    });
    return;
  }

  const explicitFile = parseStringOption(ctx.args, "--file");
  runWithStateLock(ctx.projectPath, () => {
    const result = setIterationStatus(ctx.projectPath, id, mappedStatus, explicitFile, ctx.changeName);
    const prefix = result.ok ? "[PHASEDEV SET-ITERATION-STATUS] OK" : "[PHASEDEV SET-ITERATION-STATUS] FAILED";
    reportCliResult(ctx.jsonMode, {
      ok: result.ok,
      kind: "set-iteration-status",
      humanMessage: `${prefix}: ${result.message}`,
      jsonMessage: result.message,
      data: { iterationId: id, status: mappedStatus }
    });
  });
}

function handleValidateArtifact(ctx: CommandContext): void {
  const filePath = ctx.args[1];
  if (!filePath || filePath.startsWith("--")) {
    reportCliResult(ctx.jsonMode, {
      ok: false,
      kind: "validate-artifact",
      humanMessage: "[PHASEDEV VALIDATE-ARTIFACT] FAILED: <file> is required.\nUsage: phasedev validate-artifact <file>"
    });
    return;
  }
  const resolvedPath = resolveArtifactPath(ctx.projectPath, filePath, ctx.changeName);
  const config = loadConfig(resolveConfigPath(ctx.projectPath, parseConfigPath(ctx.args)));
  const result = validateArtifact(resolvedPath, config.blockingSeverity);
  const prefix = result.ok ? "[PHASEDEV VALIDATE-ARTIFACT] OK" : "[PHASEDEV VALIDATE-ARTIFACT] FAILED";
  reportCliResult(ctx.jsonMode, {
    ok: result.ok,
    kind: "validate-artifact",
    humanMessage: `${prefix}: ${result.message}`,
    jsonMessage: result.message,
    data: { file: resolvedPath }
  });
}

function handleAddFinding(ctx: CommandContext): void {
  const looksLikeId = typeof ctx.args[1] === "string" && /^F\d+$/i.test(ctx.args[1]);
  const id = looksLikeId ? ctx.args[1] : null;
  const title = looksLikeId ? ctx.args[2] : ctx.args[1];
  const severity = looksLikeId ? ctx.args[3] : ctx.args[2];
  if (!title || !severity || title.startsWith("--") || severity.startsWith("--")) {
    reportCliResult(ctx.jsonMode, {
      ok: false,
      kind: "add-finding",
      humanMessage: "[PHASEDEV ADD-FINDING] FAILED: <title> and <severity> are required.\nUsage: phasedev add-finding [F<number>] <title> <severity> --required-fix <text> [--class <class>] [--iteration <iteration>] [--file <path>]"
    });
    return;
  }

  const requiredFix = parseStringOption(ctx.args, "--required-fix");
  if (!requiredFix) {
    reportCliResult(ctx.jsonMode, {
      ok: false,
      kind: "add-finding",
      humanMessage: "[PHASEDEV ADD-FINDING] FAILED: --required-fix <text> is required.\nUsage: phasedev add-finding [F<number>] <title> <severity> --required-fix <text> [--class <class>] [--iteration <iteration>] [--file <path>]"
    });
    return;
  }
  if (isPlaceholderRequiredFix(requiredFix)) {
    reportCliResult(ctx.jsonMode, {
      ok: false,
      kind: "add-finding",
      humanMessage: "[PHASEDEV ADD-FINDING] FAILED: Required fix must be a concrete action; placeholder values such as TBD are not allowed."
    });
    return;
  }

  const className = parseStringOption(ctx.args, "--class");
  const filePath = parseStringOption(ctx.args, "--file") || "";
  const targetFile = filePath || resolveFindingsPath(ctx.projectPath, ctx.changeName);

  if (!targetFile) {
    reportCliResult(ctx.jsonMode, {
      ok: false,
      kind: "add-finding",
      humanMessage: "[PHASEDEV ADD-FINDING] FAILED: could not determine validation_findings.md path. Specify --file <path>."
    });
    return;
  }

  let iteration = parseStringOption(ctx.args, "--iteration");
  if (!iteration) {
    iteration = deriveIterationLabel(ctx.projectPath, targetFile, ctx.changeName);
  }
  if (!iteration) {
    reportCliResult(ctx.jsonMode, {
      ok: false,
      kind: "add-finding",
      humanMessage: "[PHASEDEV ADD-FINDING] FAILED: could not derive the iteration from state.json. Pass --iteration (for example \"Iteration 1\" or \"Final\")."
    });
    return;
  }

  const config = loadConfig(resolveConfigPath(ctx.projectPath, parseConfigPath(ctx.args)));
  runWithOptionalStateLock(ctx.projectPath, () => {
    const result = addFinding(targetFile, id, title, severity, requiredFix, className, iteration, findingsCreateContext(ctx.projectPath, ctx.changeName), config.blockingSeverity);
    const prefix = result.ok ? "[PHASEDEV ADD-FINDING] OK" : "[PHASEDEV ADD-FINDING] FAILED";
    reportCliResult(ctx.jsonMode, {
      ok: result.ok,
      kind: "add-finding",
      humanMessage: `${prefix}: ${result.message}`,
      jsonMessage: result.message,
      data: { file: targetFile, id: id ?? null }
    });
  });
}

function handleResolveFinding(ctx: CommandContext): void {
  const id = ctx.args[1];
  if (!id || id.startsWith("--")) {
    reportCliResult(ctx.jsonMode, {
      ok: false,
      kind: "resolve-finding",
      humanMessage: "[PHASEDEV RESOLVE-FINDING] FAILED: <id> is required.\nUsage: phasedev resolve-finding <id> --resolution <text> [--file <path>]"
    });
    return;
  }

  const resolution = parseStringOption(ctx.args, "--resolution");
  if (!resolution) {
    reportCliResult(ctx.jsonMode, {
      ok: false,
      kind: "resolve-finding",
      humanMessage: "[PHASEDEV RESOLVE-FINDING] FAILED: --resolution <text> is required and must record what was changed and how it was verified.\nUsage: phasedev resolve-finding <id> --resolution <text> [--file <path>]"
    });
    return;
  }

  const filePath = parseStringOption(ctx.args, "--file") || "";
  const targetFile = filePath || resolveFindingsPath(ctx.projectPath, ctx.changeName);

  if (!targetFile) {
    reportCliResult(ctx.jsonMode, {
      ok: false,
      kind: "resolve-finding",
      humanMessage: "[PHASEDEV RESOLVE-FINDING] FAILED: could not determine validation_findings.md path. Specify --file <path>."
    });
    return;
  }

  const config = loadConfig(resolveConfigPath(ctx.projectPath, parseConfigPath(ctx.args)));
  runWithOptionalStateLock(ctx.projectPath, () => {
    const result = resolveFinding(targetFile, id, resolution, config.blockingSeverity);
    const prefix = result.ok ? "[PHASEDEV RESOLVE-FINDING] OK" : "[PHASEDEV RESOLVE-FINDING] FAILED";
    reportCliResult(ctx.jsonMode, {
      ok: result.ok,
      kind: "resolve-finding",
      humanMessage: `${prefix}: ${result.message}`,
      jsonMessage: result.message,
      data: { file: targetFile, id }
    });
  });
}

function handleReopenFinding(ctx: CommandContext): void {
  const id = ctx.args[1];
  if (!id || id.startsWith("--")) {
    reportCliResult(ctx.jsonMode, {
      ok: false,
      kind: "reopen-finding",
      humanMessage: "[PHASEDEV REOPEN-FINDING] FAILED: <id> is required.\nUsage: phasedev reopen-finding <id> --evidence <text> [--file <path>]"
    });
    return;
  }

  const evidence = parseStringOption(ctx.args, "--evidence");
  if (!evidence) {
    reportCliResult(ctx.jsonMode, {
      ok: false,
      kind: "reopen-finding",
      humanMessage: "[PHASEDEV REOPEN-FINDING] FAILED: --evidence <text> is required and must record concrete new evidence.\nUsage: phasedev reopen-finding <id> --evidence <text> [--file <path>]"
    });
    return;
  }

  const filePath = parseStringOption(ctx.args, "--file") || "";
  const targetFile = filePath || resolveFindingsPath(ctx.projectPath, ctx.changeName);

  if (!targetFile) {
    reportCliResult(ctx.jsonMode, {
      ok: false,
      kind: "reopen-finding",
      humanMessage: "[PHASEDEV REOPEN-FINDING] FAILED: could not determine validation_findings.md path. Specify --file <path>."
    });
    return;
  }

  const config = loadConfig(resolveConfigPath(ctx.projectPath, parseConfigPath(ctx.args)));
  runWithOptionalStateLock(ctx.projectPath, () => {
    const result = reopenFinding(targetFile, id, evidence, config.blockingSeverity);
    const prefix = result.ok ? "[PHASEDEV REOPEN-FINDING] OK" : "[PHASEDEV REOPEN-FINDING] FAILED";
    reportCliResult(ctx.jsonMode, {
      ok: result.ok,
      kind: "reopen-finding",
      humanMessage: `${prefix}: ${result.message}`,
      jsonMessage: result.message,
      data: { file: targetFile, id }
    });
  });
}

function handleSetVerdict(ctx: CommandContext): void {
  const verdict = ctx.args[1];
  if (!verdict || verdict.startsWith("--")) {
    reportCliResult(ctx.jsonMode, {
      ok: false,
      kind: "set-verdict",
      humanMessage: "[PHASEDEV SET-VERDICT] FAILED: <verdict> is required.\nUsage: phasedev set-verdict <verdict> [--file <path>]  (verdict: ready | ready_with_risks | repair_required | repaired)"
    });
    return;
  }

  const filePath = parseStringOption(ctx.args, "--file") || "";
  const targetFile = filePath || resolveFindingsPath(ctx.projectPath, ctx.changeName);

  if (!targetFile) {
    reportCliResult(ctx.jsonMode, {
      ok: false,
      kind: "set-verdict",
      humanMessage: "[PHASEDEV SET-VERDICT] FAILED: could not determine validation_findings.md path. Specify --file <path>."
    });
    return;
  }

  const config = loadConfig(resolveConfigPath(ctx.projectPath, parseConfigPath(ctx.args)));
  runWithOptionalStateLock(ctx.projectPath, () => {
    const result = setFindingsVerdict(
      targetFile,
      verdict,
      findingsCreateContext(ctx.projectPath, ctx.changeName),
      config.blockingSeverity,
      findingsTypeCoercion(ctx.projectPath, ctx.changeName)
    );
    const prefix = result.ok ? "[PHASEDEV SET-VERDICT] OK" : "[PHASEDEV SET-VERDICT] FAILED";
    reportCliResult(ctx.jsonMode, {
      ok: result.ok,
      kind: "set-verdict",
      humanMessage: `${prefix}: ${result.message}`,
      jsonMessage: result.message,
      data: { file: targetFile, verdict }
    });
  });
}

function handleChanges(ctx: CommandContext): void {
  const entries = listChanges(ctx.projectPath, hasFlag(ctx.args, "--archived"));
  reportCliResult(ctx.jsonMode, {
    ok: true,
    kind: "changes",
    humanMessage: renderChanges(entries),
    data: { entries }
  });
}

function handleConfig(ctx: CommandContext): void {
  const key = parseConfigGetKey(ctx.args);
  if (!key) {
    reportCliResult(ctx.jsonMode, {
      ok: false,
      kind: "config-get",
      humanMessage: [
        "[PHASEDEV CONFIG] FAILED: config key is required.",
        "Usage: phasedev config [--project-path <path>] [--config <path>] <key>"
      ].join("\n")
    });
    return;
  }

  const configPath = resolveConfigPath(ctx.projectPath, parseConfigPath(ctx.args));
  const config = loadConfig(configPath);
  const value = getConfigValue(config, key);
  if (value === undefined) {
    reportCliResult(ctx.jsonMode, {
      ok: false,
      kind: "config-get",
      humanMessage: `[PHASEDEV CONFIG] FAILED: key not found: ${key}`
    });
    return;
  }

  // console.log(value) relies on Node/Bun's default inspection for
  // non-string values (arrays, nested skill config objects); reportCliResult
  // only accepts a pre-formatted string, so this command prints directly.
  if (ctx.jsonMode) {
    console.log(JSON.stringify({ ok: true, kind: "config-get", data: { key, value } }));
  } else {
    console.log(value);
  }
  process.exitCode = 0;
}

function handleLog(ctx: CommandContext): void {
  const tail = parseTail(ctx.args);
  const humanMessage = viewLog(ctx.projectPath, tail);
  reportCliResult(ctx.jsonMode, {
    ok: true,
    kind: "log",
    humanMessage,
    data: { lines: humanMessage.split("\n") }
  });
}

function handleResetChange(ctx: CommandContext): void {
  runWithOptionalStateLock(ctx.projectPath, () => {
    const force = hasFlag(ctx.args, "--yes", "--force");
    const result = resetChange(ctx.projectPath, force, ctx.changeName);
    const prefix = result.ok ? "[PHASEDEV RESET-CHANGE] OK" : "[PHASEDEV RESET-CHANGE]";
    // "No active change" is informational (nothing to reset, not a failure to
    // act); withholding --yes on an existing change is a genuine refusal.
    const exitOk = result.ok || !result.blocked;
    reportCliResult(ctx.jsonMode, {
      ok: exitOk,
      kind: "reset-change",
      humanMessage: `${prefix}: ${result.message}`,
      jsonMessage: result.message,
      data: { moved: result.ok, confirmationRequired: result.blocked ?? false }
    });
  });
}

function handleReopen(ctx: CommandContext): void {
  const phase = ctx.args[1];
  if (!phase || (phase !== "design" && phase !== "plan")) {
    reportCliResult(ctx.jsonMode, {
      ok: false,
      kind: "reopen",
      humanMessage: "[PHASEDEV REOPEN] FAILED: <phase> must be `design` or `plan`.\nUsage: phasedev reopen <design|plan> [--project-path <path>]"
    });
    return;
  }

  runWithStateLock(ctx.projectPath, () => {
    const result = reopenPhase(ctx.projectPath, phase as ReopenablePhase, ctx.changeName);
    const prefix = result.ok ? "[PHASEDEV REOPEN] OK" : "[PHASEDEV REOPEN] FAILED";
    reportCliResult(ctx.jsonMode, {
      ok: result.ok,
      kind: "reopen",
      humanMessage: `${prefix}: ${result.message}`,
      jsonMessage: result.message,
      data: { phase }
    });
  });
}

function handleSyncState(ctx: CommandContext): void {
  runWithStateLock(ctx.projectPath, () => {
    const config = loadConfig(resolveConfigPath(ctx.projectPath, parseConfigPath(ctx.args)));
    const result = syncState(ctx.projectPath, ctx.changeName, config.blockingSeverity);
    const prefix = result.ok ? "[PHASEDEV SYNC-STATE] OK" : "[PHASEDEV SYNC-STATE] FAILED";
    reportCliResult(ctx.jsonMode, {
      ok: result.ok,
      kind: "sync-state",
      humanMessage: `${prefix}: ${result.message}`,
      jsonMessage: result.message,
      data: { changed: result.changed, fromPhase: result.fromPhase ?? null, toPhase: result.toPhase ?? null }
    });
  });
}

function handleInitProject(ctx: CommandContext): void {
  const result = initProject(ctx.projectPath);
  reportCliResult(ctx.jsonMode, {
    ok: result.ok,
    kind: "init-project",
    humanMessage: result.message,
    data: { projectPath: ctx.projectPath }
  });
}

function handleInit(ctx: CommandContext): void {
  const result = getInitPrompt(ctx.projectPath);
  reportCliResult(ctx.jsonMode, {
    ok: true,
    kind: "init",
    humanMessage: result.prompt,
    jsonMessage: result.blocked ? (result.reason ?? "Invalid flow state") : "Init handshake ready.",
    data: { prompt: result.prompt, blocked: result.blocked }
  });
}

function handleCreateChange(ctx: CommandContext): void {
  const name = firstPositional(ctx.args);
  if (!name) {
    reportCliResult(ctx.jsonMode, {
      ok: false,
      kind: "create-change",
      humanMessage: "[PHASEDEV] Usage: phasedev create-change <name> [--project-path <path>] [--task <text>] [--quick]"
    });
    return;
  }

  runWithOptionalStateLock(ctx.projectPath, () => {
    const taskText = parseStringOption(ctx.args, "--task");
    const quick = hasFlag(ctx.args, "--quick");
    const result = createChange(ctx.projectPath, name, taskText, quick);
    reportCliResult(ctx.jsonMode, {
      ok: result.ok,
      kind: "create-change",
      humanMessage: `[PHASEDEV CREATE-CHANGE] ${result.ok ? "OK" : "FAILED"}: ${result.message}`,
      jsonMessage: result.message,
      data: { changeDir: result.changeDir ?? null }
    });
  });
}

function handlePhase(ctx: CommandContext): void {
  const configPath = resolveConfigPath(ctx.projectPath, parseConfigPath(ctx.args));
  const config = loadConfig(configPath);
  const result = getPhasePrompt(ctx.projectPath, config, ctx.changeName);
  reportCliResult(ctx.jsonMode, {
    ok: !result.blocked,
    kind: "phase",
    phase: result.phase,
    humanMessage: result.prompt,
    jsonMessage: result.blocked ? (result.reason ?? "Blocked") : `Phase contract for ${result.phase}.`,
    data: { prompt: result.prompt }
  });
  if (result.blocked) {
    process.exitCode = 1;
  }
}

function handleFeedback(ctx: CommandContext): void {
  const result = getFeedbackPrompt(ctx.projectPath, ctx.changeName);
  reportCliResult(ctx.jsonMode, {
    ok: !result.blocked,
    kind: "feedback",
    humanMessage: result.prompt,
    jsonMessage: result.blocked ? (result.reason ?? "Blocked") : "Feedback contract ready.",
    data: { prompt: result.prompt }
  });
  if (result.blocked) {
    process.exitCode = 1;
  }
}

function handleAdvance(ctx: CommandContext): void {
  const configPath = resolveConfigPath(ctx.projectPath, parseConfigPath(ctx.args));
  const config = loadConfig(configPath);
  runWithStateLock(ctx.projectPath, () => {
    const result = advanceFlow(ctx.projectPath, config, ctx.changeName);
    reportCliResult(ctx.jsonMode, {
      ok: result.ok,
      kind: "advance",
      phase: result.newState?.activePhase ?? null,
      humanMessage: result.message,
      data: {
        advanced: result.advanced,
        finished: result.finished,
        activeIteration: result.newState?.activeIteration ?? null
      }
    });
  });
}

function handleArchive(ctx: CommandContext): void {
  const name = firstPositional(ctx.args);
  if (!name) {
    reportCliResult(ctx.jsonMode, {
      ok: false,
      kind: "archive",
      humanMessage: "[PHASEDEV ARCHIVE] FAILED: <change-name> is required.\nUsage: phasedev archive <change-name> [--project-path <path>]"
    });
    return;
  }

  const configPath = resolveConfigPath(ctx.projectPath, parseConfigPath(ctx.args));
  const config = loadConfig(configPath);
  runWithStateLock(ctx.projectPath, () => {
    const result = runArchive(ctx.projectPath, config, name);
    reportCliResult(ctx.jsonMode, {
      ok: result.ok,
      kind: "archive",
      humanMessage: result.message,
      jsonMessage: result.reason ?? result.message,
      data: { done: result.done, started: result.started }
    });
  });
}

function handleCheck(ctx: CommandContext): void {
  if (ctx.args.includes("--check-orphans")) {
    const orphans = findOrphanedArchiveDirectories(ctx.projectPath);
    if (orphans.length === 0) {
      reportCliResult(ctx.jsonMode, {
        ok: true,
        kind: "check-orphans",
        humanMessage: "[PHASEDEV ARCHIVE ORPHAN CHECK] OK: no orphaned archive directories."
      });
      return;
    }

    reportCliResult(ctx.jsonMode, {
      ok: false,
      kind: "check-orphans",
      humanMessage: [
        "[PHASEDEV ARCHIVE ORPHAN CHECK] FOUND: orphaned or unfinished archive directories.",
        ...orphans.map(orphan => `- ${orphan}`)
      ].join("\n"),
      issues: orphans
    });
    return;
  }

  const phaseOverride = parseStringOption(ctx.args, "--phase");
  const config = loadConfig(resolveConfigPath(ctx.projectPath, parseConfigPath(ctx.args)));
  const result = checkPhase(ctx.projectPath, phaseOverride, ctx.changeName, config.blockingSeverity);
  reportCliResult(ctx.jsonMode, {
    ok: result.ok,
    kind: "check",
    phase: result.phase,
    humanMessage: result.message,
    issues: result.ok ? [] : extractIssueLines(result.message)
  });
}

function handleCheckValidation(ctx: CommandContext): void {
  const parsed = parseValidationCheckOptions(ctx.args);
  if (!parsed.options) {
    reportCliResult(ctx.jsonMode, {
      ok: false,
      kind: "check-validation",
      humanMessage: `[PHASEDEV VALIDATION CHECK] FAILED: ${parsed.error}`
    });
    return;
  }

  const config = loadConfig(resolveConfigPath(ctx.projectPath, parseConfigPath(ctx.args)));
  const result = checkValidationCompletion(ctx.projectPath, parsed.options, ctx.changeName, config.blockingSeverity);
  reportCliResult(ctx.jsonMode, {
    ok: result.ok,
    kind: "check-validation",
    humanMessage: result.message,
    data: { route: result.route },
    issues: result.ok ? [] : extractIssueLines(result.message)
  });
}

function handleCheckArchive(ctx: CommandContext): void {
  const result = checkArchiveCompletion(parseArchivePath(ctx.args));
  reportCliResult(ctx.jsonMode, {
    ok: result.ok,
    kind: "check-archive",
    humanMessage: result.message,
    issues: result.issues
  });
}

function handleNext(ctx: CommandContext): void {
  const message = "[PHASEDEV] `phasedev next` is deprecated. Use `phasedev phase` or `phasedev advance` instead.";
  if (ctx.jsonMode) {
    console.log(JSON.stringify({ ok: true, kind: "next", message }));
  } else {
    console.warn(message);
  }
}

const COMMANDS: Record<string, CommandHandler> = {
  status: handleStatus,
  approve: handleApprove,
  "set-iteration-status": handleSetIterationStatus,
  "validate-artifact": handleValidateArtifact,
  "add-finding": handleAddFinding,
  "resolve-finding": handleResolveFinding,
  "reopen-finding": handleReopenFinding,
  "set-verdict": handleSetVerdict,
  changes: handleChanges, list: handleChanges,
  config: handleConfig,
  log: handleLog,
  "reset-change": handleResetChange,
  reopen: handleReopen,
  "sync-state": handleSyncState,
  "init-project": handleInitProject,
  init: handleInit,
  "create-change": handleCreateChange,
  phase: handlePhase,
  feedback: handleFeedback,
  advance: handleAdvance,
  archive: handleArchive,
  check: handleCheck,
  "check-validation": handleCheckValidation,
  "check-archive": handleCheckArchive,
  version: handleVersion,
  next: handleNext
};

function main(): void {
  const args = process.argv.slice(2);
  const command = args[0];
  const jsonMode = hasFlag(args, "--json");

  // --version / -V support (before command dispatch)
  if (command === "--version" || command === "-V") {
    const version = parseVersion();
    reportCliResult(jsonMode, { ok: true, kind: "version", humanMessage: version ?? "unknown", data: { version } });
    return;
  }

  if (!command || command === "help" || command === "--help" || command === "-h") {
    const helpText = renderHelp();
    reportCliResult(jsonMode, { ok: true, kind: "help", humanMessage: helpText, data: { text: helpText } });
    return;
  }

  // Any subcommand invoked with --help/-h shows help instead of executing,
  // so help never triggers the side effects of the command it is attached to.
  if (hasFlag(args, "--help", "-h")) {
    const helpText = renderHelp();
    reportCliResult(jsonMode, { ok: true, kind: "help", humanMessage: helpText, data: { text: helpText } });
    return;
  }

  const projectPath = parseProjectPath(args);
  const changeName = parseStringOption(args, "--change");

  const handler = COMMANDS[command];
  if (handler) {
    handler({ args, jsonMode, projectPath, changeName });
    return;
  }

  const helpText = renderHelp(command);
  reportCliResult(jsonMode, {
    ok: false,
    kind: "unknown-command",
    humanMessage: helpText,
    data: { command }
  });
}

const globalJsonMode = process.argv.slice(2).includes("--json");

try {
  main();
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof AmbiguousChangeError) {
    if (globalJsonMode) {
      console.log(JSON.stringify({ ok: false, kind: "ambiguous-change", message, data: { changeNames: error.changeNames } }));
    } else {
      console.error([
        `[PHASEDEV] BLOCKED: ${message}`,
        "Tip: Use `phasedev list` to see all changes and their status."
      ].join("\n"));
    }
    process.exitCode = 1;
  } else if (error instanceof MissingPhasedevDirError) {
    if (globalJsonMode) {
      console.log(JSON.stringify({ ok: false, kind: "missing-phasedev-dir", message, data: { projectRoot: error.projectRoot } }));
    } else {
      console.error(`[PHASEDEV] FAILED: ${message}`);
    }
    process.exitCode = 1;
  } else if (error instanceof UnknownChangeError) {
    if (globalJsonMode) {
      console.log(JSON.stringify({ ok: false, kind: "unknown-change", message, data: { changeName: error.changeName, available: error.available } }));
    } else {
      console.error(`[PHASEDEV] FAILED: ${message}`);
    }
    process.exitCode = 1;
  } else if (globalJsonMode) {
    console.log(JSON.stringify({ ok: false, kind: "error", message }));
    process.exitCode = 1;
  } else {
    console.error(`[PHASEDEV] ${message}`);
    process.exitCode = 1;
  }
}
