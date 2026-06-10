import { loadFlowRalphConfig, resolveFlowRalphConfigPath } from "./entities/flow-config/config";
import { checkFlow, flowRouteKinds, FlowRouteKind, isFlowRouteKind } from "./features/flow-control/check-flow";
import { getInitPrompt, getNextPrompt } from "./features/flow-control";
import { parseConfigPath, parseProjectPath } from "./shared/cli/parse-project-path";

function parseExpectedRoute(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--expect-route" && args[i + 1]) {
      return args[i + 1];
    }
  }

  return undefined;
}

function main(): void {
  const args = process.argv.slice(2);
  const command = args[0];
  const projectPath = parseProjectPath(args);

  if (command === "init") {
    const configPath = resolveFlowRalphConfigPath(projectPath, parseConfigPath(args));
    const config = loadFlowRalphConfig(configPath);
    console.log(getInitPrompt(projectPath, config).prompt);
    return;
  }

  if (command === "check") {
    const expectedRoute = parseExpectedRoute(args);
    let expectedRouteKind: FlowRouteKind | undefined;
    if (expectedRoute) {
      if (!isFlowRouteKind(expectedRoute)) {
        console.log(`[FLOW CHECK] FAILED: unknown expected route ${expectedRoute}.`);
        console.log(`Known routes: ${flowRouteKinds().join(", ")}`);
        process.exitCode = 1;
        return;
      }
      expectedRouteKind = expectedRoute;
    }

    const result = checkFlow(projectPath, expectedRouteKind);
    console.log(result.message);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (command === "next") {
    const configPath = resolveFlowRalphConfigPath(projectPath, parseConfigPath(args));
    const config = loadFlowRalphConfig(configPath);
    console.log(getNextPrompt(projectPath, config).prompt);
    return;
  }

  console.log("Usage: bun run src/flow-cli.ts <init|next|check> [--project-path <path>] [--config <path>] [--expect-route <route>]");
}

main();
