import { createRalphOutput, FlowRalphDependencies, FlowRalphResult, loadFlowRalphConfig, runFlowRalph } from "./features/ralph-runner";
import { isMainModule } from "./shared/cli/main-module";
import { parseRalphArgs } from "./shared/cli/parse-ralph-args";

export type FlowRalphCliDependencies = Pick<FlowRalphDependencies, "createCodex" | "env" | "fetchImpl"> & {
  reporter?: Pick<typeof console, "log">;
};

export async function runFlowRalphCli(args: string[], dependencies: FlowRalphCliDependencies = {}): Promise<FlowRalphResult> {
  const { projectPath, configPath } = parseRalphArgs(args);
  const config = loadFlowRalphConfig(configPath);
  const output = createRalphOutput(config.loop.notifications.telegram, dependencies.reporter ?? console, {
    env: dependencies.env,
    fetchImpl: dependencies.fetchImpl
  });

  try {
    const result = await runFlowRalph(projectPath, config, {
      createCodex: dependencies.createCodex,
      output
    });

    output.log(`[FLOW RALPH] status: ${result.status}`);
    output.log(`[FLOW RALPH] iterations: ${result.iterations}`);
    output.log(`[FLOW RALPH] reason: ${result.reason}`);
    output.log(`[FLOW RALPH] log: ${result.logPath}`);
    return result;
  } finally {
    await output.flush();
  }
}

async function main(): Promise<void> {
  await runFlowRalphCli(process.argv.slice(2));
}

if (isMainModule(import.meta)) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
