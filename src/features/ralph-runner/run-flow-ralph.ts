import * as fs from "fs";
import * as path from "path";
import { findActiveChangeDir } from "../../entities/flow-change/active-change";
import { readArchiveState } from "../../entities/flow-change/archive-state";
import { archiveRootPath } from "../../entities/flow-change/paths";
import { FlowPrompt } from "../../entities/flow-stage/types";
import { getInitPrompt, getNextPrompt } from "../flow-control";
import { createDefaultCodexFactory, CodexFactory, runCodexTurn } from "./codex-turn";
import { FlowRalphConfig, getStageModelConfig, resolveProjectLogDir } from "./config";
import { initializeMarkdownLog, logAgentResponse } from "./run-logs";

export interface FlowRalphDependencies {
  createCodex: () => Promise<CodexFactory> | CodexFactory;
  getInitPrompt?: typeof getInitPrompt;
  getNextPrompt?: typeof getNextPrompt;
  findActiveChangeDir?: typeof findActiveChangeDir;
  reporter?: Pick<typeof console, "log">;
  now?: () => Date;
}

export type FlowRalphStatus = "archived" | "blocked" | "max_iterations";

export interface FlowRalphResult {
  status: FlowRalphStatus;
  iterations: number;
  logPath: string;
  reason: string;
}

function wrapNextPrompt(nextPrompt: FlowPrompt): string {
  return [
    "Ниже приведен точный результат ручной команды `flow next`.",
    "",
    "Правила запуска:",
    "- Выполните только напечатанный контракт этапа.",
    "- Не запускайте `flow next`, `flow init` или контроллер flow самостоятельно.",
    "- Не переходите к следующему этапу.",
    "- Не проставляйте подтверждение человеком автоматически.",
    "- Остановитесь, когда контракт этапа требует остановиться.",
    "",
    "=== FLOW NEXT PROMPT START ===",
    nextPrompt.prompt,
    "=== FLOW NEXT PROMPT END ==="
  ].join("\n");
}

function ensureGitRepo(projectPath: string): void {
  let current = path.resolve(projectPath);
  while (true) {
    if (fs.existsSync(path.join(current, ".git"))) {
      return;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`Project path must be inside a git repository: ${projectPath}`);
    }
    current = parent;
  }
}

function hasCompletedArchivedChange(projectPath: string, previousActiveChange: string | null): boolean {
  if (!previousActiveChange) return false;

  const changeName = path.basename(previousActiveChange);
  const archiveDir = archiveRootPath(projectPath);
  if (!fs.existsSync(archiveDir)) return false;

  return fs.readdirSync(archiveDir).some(item => {
    const itemPath = path.join(archiveDir, item);
    if (!item.endsWith(`-${changeName}`) || !fs.statSync(itemPath).isDirectory()) {
      return false;
    }

    return readArchiveState(itemPath)?.status === "completed";
  });
}

export async function runFlowRalph(projectPath: string, config: FlowRalphConfig, dependencies: FlowRalphDependencies = { createCodex: createDefaultCodexFactory }): Promise<FlowRalphResult> {
  const resolvedProjectPath = path.resolve(projectPath);
  ensureGitRepo(resolvedProjectPath);

  const getInit = dependencies.getInitPrompt ?? getInitPrompt;
  const getNext = dependencies.getNextPrompt ?? getNextPrompt;
  const findActive = dependencies.findActiveChangeDir ?? findActiveChangeDir;
  const reporter = dependencies.reporter ?? console;
  const now = dependencies.now ?? (() => new Date());
  const logDir = resolveProjectLogDir(resolvedProjectPath, config.loop.logDir);
  const logPath = path.join(logDir, "log.md");

  if (config.loop.enableLogs) {
    initializeMarkdownLog(logDir, reporter);
  }

  let codex: CodexFactory | null = null;

  for (let iteration = 1; iteration <= config.loop.maxIterations; iteration++) {
    const beforeActiveChange = findActive(resolvedProjectPath);
    const nextPrompt = getNext(resolvedProjectPath, config);

    if (nextPrompt.blocked) {
      reporter.log(`[FLOW RALPH] blocked at stage: ${nextPrompt.stage}`);
      reporter.log(`[FLOW RALPH] reason: ${nextPrompt.reason ?? "Flow controller blocked."}`);
      reporter.log(`[FLOW RALPH] log: ${logPath}`);
      return { status: "blocked", iterations: iteration - 1, logPath, reason: nextPrompt.reason ?? "Flow controller blocked." };
    }

    const stageModel = getStageModelConfig(config, nextPrompt.stage);
    reporter.log(`[FLOW RALPH] iteration ${iteration}/${config.loop.maxIterations}`);
    reporter.log(`[FLOW RALPH] stage: ${nextPrompt.stage}`);
    reporter.log(`[FLOW RALPH] model: ${stageModel.model}`);
    reporter.log(`[FLOW RALPH] reasoning: ${stageModel.reasoningEffort}`);
    reporter.log(`[FLOW RALPH] active change: ${beforeActiveChange ?? "none"}`);
    reporter.log("[FLOW RALPH] starting Codex session...");

    codex = codex ?? await dependencies.createCodex();
    const thread = codex.startThread({
      workingDirectory: resolvedProjectPath,
      model: stageModel.model,
      modelReasoningEffort: stageModel.reasoningEffort,
      sandboxMode: config.codex.sandboxMode,
      approvalPolicy: config.codex.approvalPolicy,
      networkAccessEnabled: config.codex.networkAccessEnabled
    });

    reporter.log("[FLOW RALPH] running flow init...");
    await runCodexTurn(thread, getInit(resolvedProjectPath, config).prompt, "flow init", reporter, config.codex.streamAgentOutput);
    reporter.log("[FLOW RALPH] flow init completed");
    reporter.log(`[FLOW RALPH] running stage: ${nextPrompt.stage}`);
    const turn = await runCodexTurn(thread, wrapNextPrompt(nextPrompt), nextPrompt.stage, reporter, config.codex.streamAgentOutput);

    if (config.loop.enableLogs) {
      logAgentResponse(
        logDir,
        iteration,
        nextPrompt.stage,
        stageModel.model,
        stageModel.reasoningEffort,
        turn.finalResponse ?? "",
        now,
        reporter
      );
    }

    const archived = hasCompletedArchivedChange(resolvedProjectPath, beforeActiveChange);

    if (archived) {
      reporter.log(`[FLOW RALPH] stage completed: ${nextPrompt.stage}`);
      reporter.log("[FLOW RALPH] archived");
      reporter.log(`[FLOW RALPH] log: ${logPath}`);
      return { status: "archived", iterations: iteration, logPath, reason: "Archive state was completed." };
    }

    reporter.log(`[FLOW RALPH] stage completed: ${nextPrompt.stage}`);
  }

  return { status: "max_iterations", iterations: config.loop.maxIterations, logPath, reason: "Reached loop.maxIterations." };
}
