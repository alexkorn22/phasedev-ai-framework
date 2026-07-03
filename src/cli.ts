import { getConfigValue, loadConfig, resolveConfigPath } from "./entities/config/config";
import { checkArchiveCompletion } from "./features/stage-control/check-archive";
import { checkRoute, checkValidationCompletion, routeKinds, RouteKind, isRouteKind, stageKinds, isStageKind, ValidationCheckOptions } from "./features/stage-control/check-flow";
import { Stage } from "./entities/stage/types";
import { getInitPrompt, getNextPrompt } from "./features/stage-control";
import { renderHelp } from "./features/cli-help/render-help";
import { initProject } from "./features/project-init/init-project";
import { parseConfigPath, parseProjectPath } from "./shared/cli/parse-project-path";
import { getFlowStatus, renderFlowStatus } from "./features/flow-status/get-status";
import { approveArtifact } from "./features/artifact-ops/approve-artifact";
import { setIterationStatus } from "./features/iteration-ops/set-iteration-status";
import { validateArtifact } from "./features/artifact-ops/validate-artifact";
import { addFinding, resolveFinding } from "./features/artifact-ops/manage-findings";
import { listChanges, renderChanges } from "./features/flow-status/list-changes";
import { viewLog } from "./features/flow-status/view-log";
import { setConfigValue } from "./features/config-ops/set-config";
import { resetChange } from "./features/flow-state/reset-change";
import { findActiveChangeDir } from "./entities/change/active-change";
import { buildChangePaths } from "./entities/change/paths";
import * as fs from "fs";
import * as path from "path";

function parseExpectedRoute(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--expect-route" && args[i + 1]) {
      return args[i + 1];
    }
  }

  return undefined;
}

function parseExpectedStage(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--expect-stage" && args[i + 1]) {
      return args[i + 1];
    }
  }

  return undefined;
}

function parseStringOption(args: string[], option: string): string | undefined {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === option && args[i + 1]) {
      return args[i + 1];
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

function resolveFindingsPath(projectPath: string): string {
  try {
    const changeDir = findActiveChangeDir(projectPath);
    if (!changeDir) return "";
    return buildChangePaths(changeDir).findingsPath;
  } catch {
    return "";
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const command = args[0];

  // --version / -V support (before command dispatch)
  if (command === "--version" || command === "-V") {
    console.log(parseVersion());
    return;
  }

  if (!command || command === "help" || command === "--help" || command === "-h") {
    console.log(renderHelp());
    return;
  }

  const projectPath = parseProjectPath(args);

  // --- Phase 3: User commands (simple, no project path needed) ---

  if (command === "version") {
    console.log(parseVersion());
    return;
  }

  // --- Phase 1: Orchestrator commands ---

  if (command === "status") {
    const status = getFlowStatus(projectPath);
    console.log(renderFlowStatus(status));
    return;
  }

  if (command === "approve") {
    const filePath = args[1];
    if (!filePath || filePath.startsWith("--")) {
      console.log("[PHASEDEV APPROVE] FAILED: <file> is required.");
      console.log("Usage: phasedev approve <file> [--by <name>]");
      process.exitCode = 1;
      return;
    }
    const approvedBy = parseStringOption(args, "--by");
    const result = approveArtifact(filePath, approvedBy);
    const prefix = result.ok ? "[PHASEDEV APPROVE] OK" : "[PHASEDEV APPROVE] FAILED";
    console.log(`${prefix}: ${result.message}`);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (command === "set-iteration-status") {
    const rawId = args[1];
    const rawStatus = args[2];
    if (!rawId || !rawStatus || rawId.startsWith("--") || rawStatus.startsWith("--")) {
      console.log("[PHASEDEV SET-ITERATION-STATUS] FAILED: <id> and <status> are required.");
      console.log("Usage: phasedev set-iteration-status <id> <status> [--project-path <path>] [--file <path>]");
      process.exitCode = 1;
      return;
    }

    const id = Number.parseInt(rawId, 10);
    if (!Number.isInteger(id) || id <= 0) {
      console.log(`[PHASEDEV SET-ITERATION-STATUS] FAILED: <id> must be a positive integer, got "${rawId}".`);
      process.exitCode = 1;
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
      console.log(`[PHASEDEV SET-ITERATION-STATUS] FAILED: invalid status "${rawStatus}". Expected: x/~/space, completed/in_progress/not_started.`);
      process.exitCode = 1;
      return;
    }

    const explicitFile = parseStringOption(args, "--file");
    const result = setIterationStatus(projectPath, id, mappedStatus, explicitFile);
    const prefix = result.ok ? "[PHASEDEV SET-ITERATION-STATUS] OK" : "[PHASEDEV SET-ITERATION-STATUS] FAILED";
    console.log(`${prefix}: ${result.message}`);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  // --- Phase 2: Sub-agent commands ---

  if (command === "validate-artifact") {
    const filePath = args[1];
    if (!filePath || filePath.startsWith("--")) {
      console.log("[PHASEDEV VALIDATE-ARTIFACT] FAILED: <file> is required.");
      console.log("Usage: phasedev validate-artifact <file>");
      process.exitCode = 1;
      return;
    }
    const result = validateArtifact(filePath);
    const prefix = result.ok ? "[PHASEDEV VALIDATE-ARTIFACT] OK" : "[PHASEDEV VALIDATE-ARTIFACT] FAILED";
    console.log(`${prefix}: ${result.message}`);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (command === "add-finding") {
    const id = args[1];
    const title = args[2];
    const severity = args[3];
    if (!id || !title || !severity || id.startsWith("--") || title.startsWith("--") || severity.startsWith("--")) {
      console.log("[PHASEDEV ADD-FINDING] FAILED: <id>, <title>, and <severity> are required.");
      console.log("Usage: phasedev add-finding <id> <title> <severity> [--class <class>] [--iteration <iteration>] [--file <path>]");
      process.exitCode = 1;
      return;
    }

    const className = parseStringOption(args, "--class");
    const iteration = parseStringOption(args, "--iteration");
    const filePath = parseStringOption(args, "--file") || "";
    const targetFile = filePath || resolveFindingsPath(projectPath);

    if (!targetFile) {
      console.log("[PHASEDEV ADD-FINDING] FAILED: could not determine validation_findings.md path. Specify --file <path>.");
      process.exitCode = 1;
      return;
    }

    const result = addFinding(targetFile, id, title, severity, className, iteration);
    const prefix = result.ok ? "[PHASEDEV ADD-FINDING] OK" : "[PHASEDEV ADD-FINDING] FAILED";
    console.log(`${prefix}: ${result.message}`);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (command === "resolve-finding") {
    const id = args[1];
    if (!id || id.startsWith("--")) {
      console.log("[PHASEDEV RESOLVE-FINDING] FAILED: <id> is required.");
      console.log("Usage: phasedev resolve-finding <id> [--file <path>]");
      process.exitCode = 1;
      return;
    }

    const filePath = parseStringOption(args, "--file") || "";
    const targetFile = filePath || resolveFindingsPath(projectPath);

    if (!targetFile) {
      console.log("[PHASEDEV RESOLVE-FINDING] FAILED: could not determine validation_findings.md path. Specify --file <path>.");
      process.exitCode = 1;
      return;
    }

    const result = resolveFinding(targetFile, id);
    const prefix = result.ok ? "[PHASEDEV RESOLVE-FINDING] OK" : "[PHASEDEV RESOLVE-FINDING] FAILED";
    console.log(`${prefix}: ${result.message}`);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  // --- Phase 3: User commands ---

  if (command === "changes" || command === "list") {
    const entries = listChanges(projectPath);
    console.log(renderChanges(entries));
    return;
  }

  if (command === "config") {
    const subCommand = args[1];
    if (subCommand === "set") {
      const key = args[2];
      const value = args[3];
      if (!key || !value || key.startsWith("--") || value.startsWith("--")) {
        console.log("[PHASEDEV CONFIG SET] FAILED: <key> and <value> are required.");
        console.log("Usage: phasedev config set <key> <value> [--project-path <path>] [--config <path>]");
        process.exitCode = 1;
        return;
      }
      const configPath = resolveConfigPath(projectPath, parseConfigPath(args));
      const result = setConfigValue(configPath, key, value);
      const prefix = result.ok ? "[PHASEDEV CONFIG SET] OK" : "[PHASEDEV CONFIG SET] FAILED";
      console.log(`${prefix}: ${result.message}`);
      process.exitCode = result.ok ? 0 : 1;
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
      console.log("[PHASEDEV CONFIG] FAILED: config key is required.");
      console.log("Usage: phasedev config [--project-path <path>] [--config <path>] <key>");
      console.log("       phasedev config set <key> <value> [--project-path <path>] [--config <path>]");
      process.exitCode = 1;
      return;
    }

    const configPath = resolveConfigPath(projectPath, parseConfigPath(args));
    const config = loadConfig(configPath);
    const value = getConfigValue(config, key);
    if (value === undefined) {
      console.log(`[PHASEDEV CONFIG] FAILED: key not found: ${key}`);
      process.exitCode = 1;
      return;
    }

    console.log(value);
    return;
  }

  if (command === "log") {
    const tail = parseTail(args);
    console.log(viewLog(projectPath, tail));
    return;
  }

  if (command === "reset-change") {
    const force = hasFlag(args, "--yes", "--force");
    const result = resetChange(projectPath, force);
    const prefix = result.ok ? "[PHASEDEV RESET-CHANGE] OK" : "[PHASEDEV RESET-CHANGE]";
    console.log(`${prefix}: ${result.message}`);
    if (!result.ok && !force) {
      // This is not a failure, just informational
      process.exitCode = 0;
    } else {
      process.exitCode = result.ok ? 0 : 1;
    }
    return;
  }

  // --- Existing commands ---

  if (command === "init-project") {
    const result = initProject(projectPath);
    console.log(result.message);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (command === "init") {
    console.log(getInitPrompt(projectPath).prompt);
    return;
  }

  if (command === "check") {
    const expectedRoute = parseExpectedRoute(args);
    const expectedStage = parseExpectedStage(args);
    let expectedRouteKind: RouteKind | undefined;
    let expectedStageKind: Stage | undefined;
    if (expectedRoute) {
      if (!isRouteKind(expectedRoute)) {
        console.log(`[PHASEDEV CHECK] FAILED: unknown expected route ${expectedRoute}.`);
        console.log(`Known routes: ${routeKinds().join(", ")}`);
        process.exitCode = 1;
        return;
      }
      expectedRouteKind = expectedRoute;
    }
    if (expectedStage) {
      if (!isStageKind(expectedStage)) {
        console.log(`[PHASEDEV CHECK] FAILED: unknown expected stage ${expectedStage}.`);
        console.log(`Known stages: ${stageKinds().join(", ")}`);
        process.exitCode = 1;
        return;
      }
      expectedStageKind = expectedStage;
    }

    const result = checkRoute(projectPath, expectedRouteKind, expectedStageKind);
    console.log(result.message);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (command === "check-validation") {
    const parsed = parseValidationCheckOptions(args);
    if (!parsed.options) {
      console.log(`[PHASEDEV VALIDATION CHECK] FAILED: ${parsed.error}`);
      process.exitCode = 1;
      return;
    }

    const result = checkValidationCompletion(projectPath, parsed.options);
    console.log(result.message);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (command === "check-archive") {
    const result = checkArchiveCompletion(parseArchivePath(args));
    console.log(result.message);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (command === "next") {
    const configPath = resolveConfigPath(projectPath, parseConfigPath(args));
    const config = loadConfig(configPath);
    console.log(getNextPrompt(projectPath, config).prompt);
    return;
  }

  console.log(renderHelp(command));
  process.exitCode = 1;
}

main();
