import { loadFlowRalphConfig, runFlowRalph } from "./features/ralph-runner";
import { isMainModule } from "./shared/cli/main-module";
import { parseRalphArgs } from "./shared/cli/parse-ralph-args";

async function main(): Promise<void> {
  const { projectPath, configPath } = parseRalphArgs(process.argv.slice(2));
  const config = loadFlowRalphConfig(configPath);
  const result = await runFlowRalph(projectPath, config);

  console.log(`[FLOW RALPH] status: ${result.status}`);
  console.log(`[FLOW RALPH] iterations: ${result.iterations}`);
  console.log(`[FLOW RALPH] reason: ${result.reason}`);
  console.log(`[FLOW RALPH] log: ${result.logPath}`);
}

if (isMainModule(import.meta)) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
