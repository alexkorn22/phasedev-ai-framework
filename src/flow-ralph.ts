import * as path from "path";
import { FlowRalphDependencies, FlowRalphResult, loadFlowRalphConfig, resolveFlowRalphConfigPath, runFlowRalph, resolveProjectLogDir } from "./features/ralph-runner";
import { createJsonFileLogger, createTelegramLogger, createCompositeLogger } from "./features/ralph-logger";
import type { IterationLogger } from "./entities/iteration-log";
import { isMainModule } from "./shared/cli/main-module";
import { parseRalphArgs } from "./shared/cli/parse-ralph-args";
import { loadEnvFile } from "./shared/env/load-env-file";

export type FlowRalphCliDependencies = Pick<FlowRalphDependencies, "createCodex" | "env"> & {
  reporter?: Pick<typeof console, "log">;
  iterationLogger?: IterationLogger;
  fetchImpl?: typeof fetch;
};

function resolveRalphEnv(resolvedConfigPath: string, baseEnv: Record<string, string | undefined>): Record<string, string | undefined> {
  const envPath = path.join(path.dirname(resolvedConfigPath), ".env");
  return {
    ...loadEnvFile(envPath),
    ...baseEnv
  };
}

export async function runFlowRalphCli(args: string[], dependencies: FlowRalphCliDependencies = {}): Promise<FlowRalphResult> {
  const { projectPath, configPath } = parseRalphArgs(args);
  const resolvedConfigPath = resolveFlowRalphConfigPath(projectPath, configPath);
  const config = loadFlowRalphConfig(resolvedConfigPath);
  const env = resolveRalphEnv(resolvedConfigPath, dependencies.env ?? process.env);
  const reporter = dependencies.reporter ?? console;

  let iterationLogger = dependencies.iterationLogger;
  if (!iterationLogger) {
    const loggers: IterationLogger[] = [];
    const logDir = resolveProjectLogDir(projectPath, config.loop.logDir);
    const logPath = path.join(logDir, "ralph-log.jsonl");

    if (config.loop.enableLogs) {
      loggers.push(createJsonFileLogger(logPath));
    }

    const tg = config.loop.notifications.telegram;
    if (tg.enabled) {
      const botToken = env[tg.botTokenEnv];
      const chatId = env[tg.chatIdEnv];
      if (botToken && chatId) {
        loggers.push(createTelegramLogger({
          botToken,
          chatId,
          fetchImpl: dependencies.fetchImpl
        }, reporter));
      } else {
        reporter.log(`[FLOW RALPH] Telegram notifications disabled: missing ${tg.botTokenEnv} or ${tg.chatIdEnv}`);
      }
    }
    iterationLogger = createCompositeLogger(loggers);
  }

  try {
    const result = await runFlowRalph(projectPath, config, {
      createCodex: dependencies.createCodex,
      reporter,
      iterationLogger
    });

    reporter.log(`[FLOW RALPH] status: ${result.status}`);
    reporter.log(`[FLOW RALPH] iterations: ${result.iterations}`);
    reporter.log(`[FLOW RALPH] reason: ${result.reason}`);
    reporter.log(`[FLOW RALPH] log: ${result.logPath}`);
    return result;
  } finally {
    if (iterationLogger) {
      await iterationLogger.flush();
    }
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
