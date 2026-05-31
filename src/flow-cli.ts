import { getInitPrompt, getNextPrompt } from "./features/flow-control";
import { parseProjectPath } from "./shared/cli/parse-project-path";

function main(): void {
  const args = process.argv.slice(2);
  const command = args[0];
  const projectPath = parseProjectPath(args);

  if (command === "init") {
    console.log(getInitPrompt(projectPath).prompt);
    return;
  }

  if (command === "next") {
    console.log(getNextPrompt(projectPath).prompt);
    return;
  }

  console.log("Usage: bun run src/flow-cli.ts <init|next> [--project-path <path>]");
}

main();
