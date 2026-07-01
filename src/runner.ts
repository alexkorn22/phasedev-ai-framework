import * as path from "path";
import { RunnerDependencies, RunnerResult, loadConfig, resolveConfigPath, runRunner, resolveProjectLogDir } from "./features/runner";
import { createJsonFileLogger, createCompositeLogger, createCompositeReporter, createTelegramReporter } from "./features/logger";
import type { FlushableReporter } from "./features/logger";
import type { IterationLogger } from "./entities/iteration-log";
import { isMainModule } from "./shared/cli/main-module";
import { parseRalphArgs } from "./shared/cli/parse-ralph-args";
import { loadEnvFile } from "./shared/env/load-env-file";

export type RunnerCliDependencies = Pick<RunnerDependencies, "createCodex" | "env"> & {
  reporter?: Pick<typeof console, "log">;
  iterationLogger?: IterationLogger;
  fetchImpl?: typeof fetch;
};

function resolveRunnerEnv(resolvedConfigPath: string, baseEnv: Record<string, string | undefined>): Record<string, string | undefined> {
  const envPath = path.join(path.dirname(resolvedConfigPath), ".env");
  return {
    ...loadEnvFile(envPath),
    ...baseEnv
  };
}

export async function runRunnerCli(args: string[], dependencies: RunnerCliDependencies = {}): Promise<RunnerResult> {
  const { projectPath, configPath } = parseRalphArgs(args);
  const resolvedConfigPath = resolveConfigPath(projectPath, configPath);
  const config = loadConfig(resolvedConfigPath);
  const env = resolveRunnerEnv(resolvedConfigPath, dependencies.env ?? process.env);
  const baseReporter = dependencies.reporter ?? console;
  const reporterSinks: FlushableReporter[] = [baseReporter];
  // Telegram notifications temporarily disabled during config restructuring

  let iterationLogger = dependencies.iterationLogger;
  if (!iterationLogger) {
    const loggers: IterationLogger[] = [];
    const logDir = resolveProjectLogDir(projectPath, ".phasedev/logs");
    const logPath = path.join(logDir, "ralph-log.jsonl");

    if (true) {
      loggers.push(createJsonFileLogger(logPath, baseReporter));
    }
    iterationLogger = createCompositeLogger(loggers);
  }
  const reporter = createCompositeReporter(reporterSinks);

  try {
    const result = await runRunner(projectPath, config, {
      createCodex: dependencies.createCodex,
      reporter,
      iterationLogger
    });

    reporter.log(`[PHASEDEV RUNNER] status: ${result.status}`);
    reporter.log(`[PHASEDEV RUNNER] iterations: ${result.iterations}`);
    reporter.log(`[PHASEDEV RUNNER] reason: ${result.reason}`);
    reporter.log(`[PHASEDEV RUNNER] log: ${result.logPath}`);
    return result;
  } finally {
    await reporter.flush();
    if (iterationLogger) {
      await iterationLogger.flush();
    }
  }
}

async function main(): Promise<void> {
  await runRunnerCli(process.argv.slice(2));
}

if (isMainModule(import.meta)) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
