import { loadFlowRalphConfig } from "./entities/flow-config/config";
import { getInitPrompt, getNextPrompt } from "./features/flow-control";
import { parseConfigPath, parseProjectPath } from "./shared/cli/parse-project-path";

function main(): void {
  const args = process.argv.slice(2);
  const command = args[0];
  const projectPath = parseProjectPath(args);
  const config = loadFlowRalphConfig(parseConfigPath(args));

  if (command === "init") {
    console.log(getInitPrompt(projectPath, config).prompt);
    return;
  }

  if (command === "next") {
    console.log(getNextPrompt(projectPath, config).prompt);
    return;
  }

  console.log("Usage: bun run src/flow-cli.ts <init|next> [--project-path <path>] [--config <path>]");
}

main();
