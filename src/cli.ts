#!/usr/bin/env bun
import { getConfigValue, loadConfig, resolveConfigPath } from "./entities/config/config";
import { checkArchiveCompletion, findOrphanedArchiveDirectories } from "./features/phase-control/check-archive";
import { checkPhase, checkValidationCompletion, ValidationCheckOptions } from "./features/phase-control/check-flow";
import { Phase } from "./entities/phase/types";
import { getInitPrompt } from "./features/phase-control";
import { renderHelp } from "./features/cli-help/render-help";
import { initProject } from "./features/project-init/init-project";
import { parseConfigPath, parseProjectPath } from "./shared/cli/parse-project-path";
import { getFlowStatus, renderFlowStatus } from "./features/flow-status/get-status";
import { approveArtifact } from "./features/artifact-ops/approve-artifact";
import { setIterationStatus } from "./features/iteration-ops/set-iteration-status";
import { validateArtifact } from "./features/artifact-ops/validate-artifact";
import {
  addFinding,
  resolveFinding,
  reopenFinding,
  setFindingsVerdict,
  isPlaceholderRequiredFix,
  FindingsCreateContext
} from "./features/artifact-ops/manage-findings";
import { todayIsoDate } from "./shared/time/today-iso-date";
import { readFrontmatterValue } from "./shared/markdown/frontmatter";
import { listChanges, renderChanges } from "./features/flow-status/list-changes";
import { viewLog } from "./features/flow-status/view-log";
import { setConfigValue } from "./features/config-ops/set-config";
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
import { advanceFlow } from "./features/phase-control/advance-flow";
import { reportCliResult, extractIssueLines } from "./shared/cli/json-output";
import * as fs from "fs";
import * as path from "path";

class FlagValueError extends Error {}

const BOOLEAN_FLAGS = new Set(["--json", "--version", "--help", "--string", "--force", "--yes", "--check-orphans"]);

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

function parseStringOption(args: string[], option: string): string | undefined {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === option) {
      const value = args[i + 1];
      if (value === undefined) {
        return undefined;
      }
      if (value.startsWith("--")) {
        throw new FlagValueError(`Option ${option} requires a value, got flag "${value}" instead.`);
      }
      return value;
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

/**
 * True only when the resolved config file lives inside <projectPath>/.phasedev.
 * config set locks in that case (it mutates the project's own config.yaml);
 * an external --config target runs without the project lock, unchanged.
 */
function configTargetInsidePhasedev(projectPath: string, configPath: string): boolean {
  const phasedevDir = path.resolve(projectPath, SYSTEM_DIR);
  if (!fs.existsSync(phasedevDir)) {
    return false;
  }
  const resolved = path.resolve(configPath);
  return resolved === phasedevDir || resolved.startsWith(`${phasedevDir}${path.sep}`);
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

  // --- Phase 3: User commands (simple, no project path needed) ---

  if (command === "version") {
    const version = parseVersion();
    reportCliResult(jsonMode, { ok: true, kind: "version", humanMessage: version ?? "unknown", data: { version } });
    return;
  }

  // --- Phase 1: Orchestrator commands ---

  if (command === "status") {
    const status = getFlowStatus(projectPath, changeName);
    reportCliResult(jsonMode, {
      ok: true,
      kind: "status",
      phase: status.phase,
      humanMessage: renderFlowStatus(status),
      jsonMessage: `Active change: ${status.activeChange ?? "none"}`,
      data: { ...status }
    });
    return;
  }

  if (command === "approve") {
    const filePath = args[1];
    if (!filePath || filePath.startsWith("--")) {
      reportCliResult(jsonMode, {
        ok: false,
        kind: "approve",
        humanMessage: "[PHASEDEV APPROVE] FAILED: <file> is required.\nUsage: phasedev approve <file> [--by <name>]"
      });
      return;
    }
    const approvedBy = parseStringOption(args, "--by");
    let resolvedPath = filePath;
    if (!fs.existsSync(resolvedPath)) {
      try {
        const activeDir = resolveChangeDir(projectPath, changeName);
        if (activeDir) {
          const candidate = path.join(activeDir, filePath);
          if (fs.existsSync(candidate)) {
            resolvedPath = candidate;
          }
        }
      } catch { /* ignore AmbiguousChangeError etc. */ }
    }
    runWithStateLock(projectPath, () => {
      const result = approveArtifact(resolvedPath, approvedBy);
      const prefix = result.ok ? "[PHASEDEV APPROVE] OK" : "[PHASEDEV APPROVE] FAILED";
      reportCliResult(jsonMode, {
        ok: result.ok,
        kind: "approve",
        humanMessage: `${prefix}: ${result.message}`,
        jsonMessage: result.message,
        data: { file: resolvedPath, approvedBy: approvedBy ?? null }
      });
    });
    return;
  }

  if (command === "set-iteration-status") {
    const rawId = args[1];
    const rawStatus = args[2];
    if (!rawId || !rawStatus || rawId.startsWith("--") || rawStatus.startsWith("--")) {
      reportCliResult(jsonMode, {
        ok: false,
        kind: "set-iteration-status",
        humanMessage: "[PHASEDEV SET-ITERATION-STATUS] FAILED: <id> and <status> are required.\nUsage: phasedev set-iteration-status <id> <status> [--project-path <path>] [--file <path>]"
      });
      return;
    }

    const id = Number.parseInt(rawId, 10);
    if (!Number.isInteger(id) || id <= 0) {
      reportCliResult(jsonMode, {
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
      reportCliResult(jsonMode, {
        ok: false,
        kind: "set-iteration-status",
        humanMessage: `[PHASEDEV SET-ITERATION-STATUS] FAILED: invalid status "${rawStatus}". Expected: x/~/space, completed/in_progress/not_started.`
      });
      return;
    }

    const explicitFile = parseStringOption(args, "--file");
    runWithStateLock(projectPath, () => {
      const result = setIterationStatus(projectPath, id, mappedStatus, explicitFile, changeName);
      const prefix = result.ok ? "[PHASEDEV SET-ITERATION-STATUS] OK" : "[PHASEDEV SET-ITERATION-STATUS] FAILED";
      reportCliResult(jsonMode, {
        ok: result.ok,
        kind: "set-iteration-status",
        humanMessage: `${prefix}: ${result.message}`,
        jsonMessage: result.message,
        data: { iterationId: id, status: mappedStatus }
      });
    });
    return;
  }

  // --- Phase 2: Sub-agent commands ---

  if (command === "validate-artifact") {
    const filePath = args[1];
    if (!filePath || filePath.startsWith("--")) {
      reportCliResult(jsonMode, {
        ok: false,
        kind: "validate-artifact",
        humanMessage: "[PHASEDEV VALIDATE-ARTIFACT] FAILED: <file> is required.\nUsage: phasedev validate-artifact <file>"
      });
      return;
    }
    let resolvedPath = filePath;
    if (!fs.existsSync(resolvedPath)) {
      try {
        const activeDir = resolveChangeDir(projectPath, changeName);
        if (activeDir) {
          const candidate = path.join(activeDir, filePath);
          if (fs.existsSync(candidate)) {
            resolvedPath = candidate;
          }
        }
      } catch { /* ignore AmbiguousChangeError etc. */ }
    }
    const result = validateArtifact(resolvedPath);
    const prefix = result.ok ? "[PHASEDEV VALIDATE-ARTIFACT] OK" : "[PHASEDEV VALIDATE-ARTIFACT] FAILED";
    reportCliResult(jsonMode, {
      ok: result.ok,
      kind: "validate-artifact",
      humanMessage: `${prefix}: ${result.message}`,
      jsonMessage: result.message,
      data: { file: resolvedPath }
    });
    return;
  }

  if (command === "add-finding") {
    const looksLikeId = typeof args[1] === "string" && /^F\d+$/i.test(args[1]);
    const id = looksLikeId ? args[1] : null;
    const title = looksLikeId ? args[2] : args[1];
    const severity = looksLikeId ? args[3] : args[2];
    if (!title || !severity || title.startsWith("--") || severity.startsWith("--")) {
      reportCliResult(jsonMode, {
        ok: false,
        kind: "add-finding",
        humanMessage: "[PHASEDEV ADD-FINDING] FAILED: <title> and <severity> are required.\nUsage: phasedev add-finding [F<number>] <title> <severity> --required-fix <text> [--class <class>] [--iteration <iteration>] [--file <path>]"
      });
      return;
    }

    const requiredFix = parseStringOption(args, "--required-fix");
    if (!requiredFix) {
      reportCliResult(jsonMode, {
        ok: false,
        kind: "add-finding",
        humanMessage: "[PHASEDEV ADD-FINDING] FAILED: --required-fix <text> is required.\nUsage: phasedev add-finding [F<number>] <title> <severity> --required-fix <text> [--class <class>] [--iteration <iteration>] [--file <path>]"
      });
      return;
    }
    if (isPlaceholderRequiredFix(requiredFix)) {
      reportCliResult(jsonMode, {
        ok: false,
        kind: "add-finding",
        humanMessage: "[PHASEDEV ADD-FINDING] FAILED: Required fix must be a concrete action; placeholder values such as TBD are not allowed."
      });
      return;
    }

    const className = parseStringOption(args, "--class");
    const filePath = parseStringOption(args, "--file") || "";
    const targetFile = filePath || resolveFindingsPath(projectPath, changeName);

    if (!targetFile) {
      reportCliResult(jsonMode, {
        ok: false,
        kind: "add-finding",
        humanMessage: "[PHASEDEV ADD-FINDING] FAILED: could not determine validation_findings.md path. Specify --file <path>."
      });
      return;
    }

    let iteration = parseStringOption(args, "--iteration");
    if (!iteration) {
      const state = loadFlowState(projectPath, changeName);
      if (state?.activeIteration) {
        iteration = `Iteration ${state.activeIteration}`;
      } else if (state?.activePhase === "final_validation") {
        iteration = "Final";
      } else if (state?.activePhase === "finding_repair" && readFrontmatterValue(targetFile, "type") === "final") {
        iteration = "Final";
      }
    }
    if (!iteration) {
      reportCliResult(jsonMode, {
        ok: false,
        kind: "add-finding",
        humanMessage: "[PHASEDEV ADD-FINDING] FAILED: could not derive the iteration from state.json. Pass --iteration (for example \"Iteration 1\" or \"Final\")."
      });
      return;
    }

    const result = addFinding(targetFile, id, title, severity, requiredFix, className, iteration, findingsCreateContext(projectPath, changeName));
    const prefix = result.ok ? "[PHASEDEV ADD-FINDING] OK" : "[PHASEDEV ADD-FINDING] FAILED";
    reportCliResult(jsonMode, {
      ok: result.ok,
      kind: "add-finding",
      humanMessage: `${prefix}: ${result.message}`,
      jsonMessage: result.message,
      data: { file: targetFile, id: id ?? null }
    });
    return;
  }

  if (command === "resolve-finding") {
    const id = args[1];
    if (!id || id.startsWith("--")) {
      reportCliResult(jsonMode, {
        ok: false,
        kind: "resolve-finding",
        humanMessage: "[PHASEDEV RESOLVE-FINDING] FAILED: <id> is required.\nUsage: phasedev resolve-finding <id> --resolution <text> [--file <path>]"
      });
      return;
    }

    const resolution = parseStringOption(args, "--resolution");
    if (!resolution) {
      reportCliResult(jsonMode, {
        ok: false,
        kind: "resolve-finding",
        humanMessage: "[PHASEDEV RESOLVE-FINDING] FAILED: --resolution <text> is required and must record what was changed and how it was verified.\nUsage: phasedev resolve-finding <id> --resolution <text> [--file <path>]"
      });
      return;
    }

    const filePath = parseStringOption(args, "--file") || "";
    const targetFile = filePath || resolveFindingsPath(projectPath, changeName);

    if (!targetFile) {
      reportCliResult(jsonMode, {
        ok: false,
        kind: "resolve-finding",
        humanMessage: "[PHASEDEV RESOLVE-FINDING] FAILED: could not determine validation_findings.md path. Specify --file <path>."
      });
      return;
    }

    runWithOptionalStateLock(projectPath, () => {
      const result = resolveFinding(targetFile, id, resolution);
      const prefix = result.ok ? "[PHASEDEV RESOLVE-FINDING] OK" : "[PHASEDEV RESOLVE-FINDING] FAILED";
      reportCliResult(jsonMode, {
        ok: result.ok,
        kind: "resolve-finding",
        humanMessage: `${prefix}: ${result.message}`,
        jsonMessage: result.message,
        data: { file: targetFile, id }
      });
    });
    return;
  }

  if (command === "reopen-finding") {
    const id = args[1];
    if (!id || id.startsWith("--")) {
      reportCliResult(jsonMode, {
        ok: false,
        kind: "reopen-finding",
        humanMessage: "[PHASEDEV REOPEN-FINDING] FAILED: <id> is required.\nUsage: phasedev reopen-finding <id> --evidence <text> [--file <path>]"
      });
      return;
    }

    const evidence = parseStringOption(args, "--evidence");
    if (!evidence) {
      reportCliResult(jsonMode, {
        ok: false,
        kind: "reopen-finding",
        humanMessage: "[PHASEDEV REOPEN-FINDING] FAILED: --evidence <text> is required and must record concrete new evidence.\nUsage: phasedev reopen-finding <id> --evidence <text> [--file <path>]"
      });
      return;
    }

    const filePath = parseStringOption(args, "--file") || "";
    const targetFile = filePath || resolveFindingsPath(projectPath, changeName);

    if (!targetFile) {
      reportCliResult(jsonMode, {
        ok: false,
        kind: "reopen-finding",
        humanMessage: "[PHASEDEV REOPEN-FINDING] FAILED: could not determine validation_findings.md path. Specify --file <path>."
      });
      return;
    }

    const result = reopenFinding(targetFile, id, evidence);
    const prefix = result.ok ? "[PHASEDEV REOPEN-FINDING] OK" : "[PHASEDEV REOPEN-FINDING] FAILED";
    reportCliResult(jsonMode, {
      ok: result.ok,
      kind: "reopen-finding",
      humanMessage: `${prefix}: ${result.message}`,
      jsonMessage: result.message,
      data: { file: targetFile, id }
    });
    return;
  }

  if (command === "set-verdict") {
    const verdict = args[1];
    if (!verdict || verdict.startsWith("--")) {
      reportCliResult(jsonMode, {
        ok: false,
        kind: "set-verdict",
        humanMessage: "[PHASEDEV SET-VERDICT] FAILED: <verdict> is required.\nUsage: phasedev set-verdict <verdict> [--file <path>]  (verdict: ready | ready_with_risks | repair_required | repaired)"
      });
      return;
    }

    const filePath = parseStringOption(args, "--file") || "";
    const targetFile = filePath || resolveFindingsPath(projectPath, changeName);

    if (!targetFile) {
      reportCliResult(jsonMode, {
        ok: false,
        kind: "set-verdict",
        humanMessage: "[PHASEDEV SET-VERDICT] FAILED: could not determine validation_findings.md path. Specify --file <path>."
      });
      return;
    }

    const result = setFindingsVerdict(targetFile, verdict, findingsCreateContext(projectPath, changeName));
    const prefix = result.ok ? "[PHASEDEV SET-VERDICT] OK" : "[PHASEDEV SET-VERDICT] FAILED";
    reportCliResult(jsonMode, {
      ok: result.ok,
      kind: "set-verdict",
      humanMessage: `${prefix}: ${result.message}`,
      jsonMessage: result.message,
      data: { file: targetFile, verdict }
    });
    return;
  }

  // --- Phase 3: User commands ---

  if (command === "changes" || command === "list") {
    const entries = listChanges(projectPath, hasFlag(args, "--archived"));
    reportCliResult(jsonMode, {
      ok: true,
      kind: "changes",
      humanMessage: renderChanges(entries),
      data: { entries }
    });
    return;
  }

  if (command === "config") {
    const subCommand = args[1];
    if (subCommand === "set") {
      const key = args[2];
      const value = args[3];
      if (!key || !value || key.startsWith("--") || value.startsWith("--")) {
        reportCliResult(jsonMode, {
          ok: false,
          kind: "config-set",
          humanMessage: "[PHASEDEV CONFIG SET] FAILED: <key> and <value> are required.\nUsage: phasedev config set <key> <value> [--project-path <path>] [--config <path>] [--string]"
        });
        return;
      }
      const forceString = hasFlag(args, "--string");
      const configPath = resolveConfigPath(projectPath, parseConfigPath(args));
      const result = setConfigValue(configPath, key, value, { forceString });
      const prefix = result.ok ? "[PHASEDEV CONFIG SET] OK" : "[PHASEDEV CONFIG SET] FAILED";
      reportCliResult(jsonMode, {
        ok: result.ok,
        kind: "config-set",
        humanMessage: `${prefix}: ${result.message}`,
        jsonMessage: result.message,
        data: result.ok ? { key, storedValue: result.storedValue, storedType: result.storedType } : { key }
      });
      return;
    }

    // Existing config read command
    let key = "";
    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      if (arg === "--project-path" || arg === "-p" || arg === "--config") {
        i++; // skip flag value
        continue;
      }
      if (arg === "set") continue; // handled above
      if (arg.startsWith("--")) continue;
      key = arg;
      break;
    }
    if (!key) {
      reportCliResult(jsonMode, {
        ok: false,
        kind: "config-get",
        humanMessage: [
          "[PHASEDEV CONFIG] FAILED: config key is required.",
          "Usage: phasedev config [--project-path <path>] [--config <path>] <key>",
          "       phasedev config set <key> <value> [--project-path <path>] [--config <path>]"
        ].join("\n")
      });
      return;
    }

    const configPath = resolveConfigPath(projectPath, parseConfigPath(args));
    const config = loadConfig(configPath);
    const value = getConfigValue(config, key);
    if (value === undefined) {
      reportCliResult(jsonMode, {
        ok: false,
        kind: "config-get",
        humanMessage: `[PHASEDEV CONFIG] FAILED: key not found: ${key}`
      });
      return;
    }

    // console.log(value) relies on Node/Bun's default inspection for
    // non-string values (arrays, nested skill config objects); reportCliResult
    // only accepts a pre-formatted string, so this command prints directly.
    if (jsonMode) {
      console.log(JSON.stringify({ ok: true, kind: "config-get", data: { key, value } }));
    } else {
      console.log(value);
    }
    process.exitCode = 0;
    return;
  }

  if (command === "log") {
    const tail = parseTail(args);
    const humanMessage = viewLog(projectPath, tail);
    reportCliResult(jsonMode, {
      ok: true,
      kind: "log",
      humanMessage,
      data: { lines: humanMessage.split("\n") }
    });
    return;
  }

  if (command === "reset-change") {
    const force = hasFlag(args, "--yes", "--force");
    const result = resetChange(projectPath, force, changeName);
    const prefix = result.ok ? "[PHASEDEV RESET-CHANGE] OK" : "[PHASEDEV RESET-CHANGE]";
    // "No active change" is informational (nothing to reset, not a failure to
    // act); withholding --yes on an existing change is a genuine refusal.
    const exitOk = result.ok || !result.blocked;
    reportCliResult(jsonMode, {
      ok: exitOk,
      kind: "reset-change",
      humanMessage: `${prefix}: ${result.message}`,
      jsonMessage: result.message,
      data: { moved: result.ok, confirmationRequired: result.blocked ?? false }
    });
    return;
  }

  if (command === "reopen") {
    const phase = args[1];
    if (!phase || (phase !== "design" && phase !== "plan")) {
      reportCliResult(jsonMode, {
        ok: false,
        kind: "reopen",
        humanMessage: "[PHASEDEV REOPEN] FAILED: <phase> must be `design` or `plan`.\nUsage: phasedev reopen <design|plan> [--project-path <path>]"
      });
      return;
    }

    runWithStateLock(projectPath, () => {
      const result = reopenPhase(projectPath, phase as ReopenablePhase, changeName);
      const prefix = result.ok ? "[PHASEDEV REOPEN] OK" : "[PHASEDEV REOPEN] FAILED";
      reportCliResult(jsonMode, {
        ok: result.ok,
        kind: "reopen",
        humanMessage: `${prefix}: ${result.message}`,
        jsonMessage: result.message,
        data: { phase }
      });
    });
    return;
  }

  if (command === "sync-state") {
    runWithStateLock(projectPath, () => {
      const result = syncState(projectPath, changeName);
      const prefix = result.ok ? "[PHASEDEV SYNC-STATE] OK" : "[PHASEDEV SYNC-STATE] FAILED";
      reportCliResult(jsonMode, {
        ok: result.ok,
        kind: "sync-state",
        humanMessage: `${prefix}: ${result.message}`,
        jsonMessage: result.message,
        data: { changed: result.changed, fromPhase: result.fromPhase ?? null, toPhase: result.toPhase ?? null }
      });
    });
    return;
  }
  // --- Existing commands ---

  if (command === "init-project") {
    const result = initProject(projectPath);
    reportCliResult(jsonMode, {
      ok: result.ok,
      kind: "init-project",
      humanMessage: result.message,
      data: { projectPath }
    });
    return;
  }

  if (command === "init") {
    const result = getInitPrompt(projectPath);
    reportCliResult(jsonMode, {
      ok: true,
      kind: "init",
      humanMessage: result.prompt,
      jsonMessage: result.blocked ? (result.reason ?? "Invalid flow state") : "Init handshake ready.",
      data: { prompt: result.prompt, blocked: result.blocked }
    });
    return;
  }

  if (command === "create-change") {
    const name = firstPositional(args);
    if (!name) {
      reportCliResult(jsonMode, {
        ok: false,
        kind: "create-change",
        humanMessage: "[PHASEDEV] Usage: phasedev create-change <name> [--project-path <path>] [--task <text>]"
      });
      return;
    }

    const taskText = parseStringOption(args, "--task");
    const result = createChange(projectPath, name, taskText);
    reportCliResult(jsonMode, {
      ok: result.ok,
      kind: "create-change",
      humanMessage: `[PHASEDEV CREATE-CHANGE] ${result.ok ? "OK" : "FAILED"}: ${result.message}`,
      jsonMessage: result.message,
      data: { changeDir: result.changeDir ?? null }
    });
    return;
  }

  if (command === "phase") {
    const configPath = resolveConfigPath(projectPath, parseConfigPath(args));
    const config = loadConfig(configPath);
    const result = getPhasePrompt(projectPath, config, changeName);
    reportCliResult(jsonMode, {
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
    return;
  }

  if (command === "feedback") {
    const result = getFeedbackPrompt(projectPath, changeName);
    reportCliResult(jsonMode, {
      ok: !result.blocked,
      kind: "feedback",
      humanMessage: result.prompt,
      jsonMessage: result.blocked ? (result.reason ?? "Blocked") : "Feedback contract ready.",
      data: { prompt: result.prompt }
    });
    if (result.blocked) {
      process.exitCode = 1;
    }
    return;
  }

  if (command === "advance") {
    const configPath = resolveConfigPath(projectPath, parseConfigPath(args));
    const config = loadConfig(configPath);
    runWithStateLock(projectPath, () => {
      const result = advanceFlow(projectPath, config, changeName);
      reportCliResult(jsonMode, {
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
    return;
  }

  if (command === "check") {
    if (args.includes("--check-orphans")) {
      const orphans = findOrphanedArchiveDirectories(projectPath);
      if (orphans.length === 0) {
        reportCliResult(jsonMode, {
          ok: true,
          kind: "check-orphans",
          humanMessage: "[PHASEDEV ARCHIVE ORPHAN CHECK] OK: no orphaned archive directories."
        });
        return;
      }

      reportCliResult(jsonMode, {
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

    const phaseOverride = parseStringOption(args, "--phase");
    const result = checkPhase(projectPath, phaseOverride, changeName);
    reportCliResult(jsonMode, {
      ok: result.ok,
      kind: "check",
      phase: result.phase,
      humanMessage: result.message,
      issues: result.ok ? [] : extractIssueLines(result.message)
    });
    return;
  }

  if (command === "check-validation") {
    const parsed = parseValidationCheckOptions(args);
    if (!parsed.options) {
      reportCliResult(jsonMode, {
        ok: false,
        kind: "check-validation",
        humanMessage: `[PHASEDEV VALIDATION CHECK] FAILED: ${parsed.error}`
      });
      return;
    }

    const result = checkValidationCompletion(projectPath, parsed.options, changeName);
    reportCliResult(jsonMode, {
      ok: result.ok,
      kind: "check-validation",
      humanMessage: result.message,
      data: { route: result.route },
      issues: result.ok ? [] : extractIssueLines(result.message)
    });
    return;
  }

  if (command === "check-archive") {
    const result = checkArchiveCompletion(parseArchivePath(args));
    reportCliResult(jsonMode, {
      ok: result.ok,
      kind: "check-archive",
      humanMessage: result.message,
      issues: result.issues
    });
    return;
  }

  if (command === "next") {
    const message = "[PHASEDEV] `phasedev next` is deprecated. Use `phasedev phase` or `phasedev advance` instead.";
    if (jsonMode) {
      console.log(JSON.stringify({ ok: true, kind: "next", message }));
    } else {
      console.warn(message);
    }
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
