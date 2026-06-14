import { loadConfig, resolveConfigPath } from "./entities/config/config";
import { checkArchiveCompletion } from "./features/stage-control/check-archive";
import { checkRoute, checkValidationCompletion, routeKinds, RouteKind, isRouteKind, ValidationCheckOptions } from "./features/stage-control/check-flow";
import { getInitPrompt, getNextPrompt } from "./features/stage-control";
import { parseConfigPath, parseProjectPath } from "./shared/cli/parse-project-path";

function parseExpectedRoute(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--expect-route" && args[i + 1]) {
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
  if (scope !== "phase" && scope !== "final") {
    return { error: "check-validation requires --scope phase|final." };
  }

  if (scope === "final") {
    return { options: { scope } };
  }

  const rawPhaseId = parseStringOption(args, "--phase-id");
  const phaseId = rawPhaseId ? Number.parseInt(rawPhaseId, 10) : NaN;
  if (!Number.isInteger(phaseId) || phaseId <= 0) {
    return { error: "check-validation --scope phase requires --phase-id <N>." };
  }

  return { options: { scope, phaseId } };
}

function main(): void {
  const args = process.argv.slice(2);
  const command = args[0];
  const projectPath = parseProjectPath(args);

  if (command === "init") {
    console.log(getInitPrompt(projectPath).prompt);
    return;
  }

  if (command === "check") {
    const expectedRoute = parseExpectedRoute(args);
    let expectedRouteKind: RouteKind | undefined;
    if (expectedRoute) {
      if (!isRouteKind(expectedRoute)) {
        console.log(`[PHASEDEV CHECK] FAILED: unknown expected route ${expectedRoute}.`);
        console.log(`Known routes: ${routeKinds().join(", ")}`);
        process.exitCode = 1;
        return;
      }
      expectedRouteKind = expectedRoute;
    }

    const result = checkRoute(projectPath, expectedRouteKind);
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

  console.log("Usage: bun run src/cli.ts <init|next|check|check-validation|check-archive> [--project-path <path>] [--config <path>] [--expect-route <route>] [--scope phase|final] [--phase-id <N>] [--archive-path <path>]");
}

main();
