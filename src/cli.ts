import { getConfigValue, loadConfig, resolveConfigPath } from "./entities/config/config";
import { checkArchiveCompletion } from "./features/stage-control/check-archive";
import { checkRoute, checkValidationCompletion, routeKinds, RouteKind, isRouteKind, stageKinds, isStageKind, ValidationCheckOptions } from "./features/stage-control/check-flow";
import { Stage } from "./entities/stage/types";
import { getInitPrompt, getNextPrompt } from "./features/stage-control";
import { renderHelp } from "./features/cli-help/render-help";
import { initProject } from "./features/project-init/init-project";
import { parseConfigPath, parseProjectPath } from "./shared/cli/parse-project-path";

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

function main(): void {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "help" || command === "--help" || command === "-h") {
    console.log(renderHelp());
    return;
  }

  const projectPath = parseProjectPath(args);

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

  if (command === "config") {
    let key = "";
    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      if (arg === "--project-path" || arg === "-p" || arg === "--config") {
        i++; // skip flag value
        continue;
      }
      if (arg.startsWith("--")) continue;
      key = arg;
      break;
    }
    if (!key) {
      console.log("[PHASEDEV CONFIG] FAILED: config key is required.");
      console.log("Usage: phasedev config [--project-path <path>] [--config <path>] <key>");
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

  console.log(renderHelp(command));
  process.exitCode = 1;
}

main();
