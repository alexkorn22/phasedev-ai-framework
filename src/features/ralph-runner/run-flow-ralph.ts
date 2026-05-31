import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";
import { findActiveChangeDir } from "../../entities/flow-change/active-change";
import { readArchiveState } from "../../entities/flow-change/archive-state";
import { archiveRootPath } from "../../entities/flow-change/paths";
import { FlowPrompt } from "../../entities/flow-stage/types";
import { getInitPrompt, getNextPrompt } from "../flow-control";
import { createDefaultCodexFactory, CodexFactory, runCodexTurn } from "./codex-turn";
import { FlowRalphConfig, getStageModelConfig, resolveProjectLogDir } from "./config";
import { createRalphOutput, RalphOutput } from "./ralph-output";
import { FetchLike } from "./telegram-notifier";
import { initializeMarkdownLog, logAgentResponse } from "./run-logs";

export interface FlowRalphDependencies {
  createCodex?: () => Promise<CodexFactory> | CodexFactory;
  getInitPrompt?: typeof getInitPrompt;
  getNextPrompt?: typeof getNextPrompt;
  findActiveChangeDir?: typeof findActiveChangeDir;
  reporter?: Pick<typeof console, "log">;
  output?: RalphOutput;
  env?: Record<string, string | undefined>;
  fetchImpl?: FetchLike;
  now?: () => Date;
}

export type FlowRalphStatus = "archived" | "blocked" | "no_progress" | "max_iterations";

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

function isIgnoredSnapshotPath(itemPath: string, projectPath: string, logDir: string): boolean {
  const relativePath = path.relative(projectPath, itemPath);
  if (relativePath === "") return false;

  const firstSegment = relativePath.split(path.sep)[0];
  return firstSegment === ".git" ||
         firstSegment === "node_modules" ||
         firstSegment === ".cache" ||
         firstSegment === "dist" ||
         firstSegment === "build" ||
         itemPath === logDir ||
         itemPath.startsWith(`${logDir}${path.sep}`);
}

function snapshotProjectState(projectPath: string, logDir: string): string {
  const hash = createHash("sha256");
  const root = path.resolve(projectPath);

  function visit(itemPath: string): void {
    if (isIgnoredSnapshotPath(itemPath, root, logDir)) {
      return;
    }

    const stat = fs.statSync(itemPath);
    const relativePath = path.relative(root, itemPath);
    hash.update(relativePath);
    hash.update(String(stat.size));

    if (stat.isDirectory()) {
      for (const item of fs.readdirSync(itemPath).sort()) {
        visit(path.join(itemPath, item));
      }
      return;
    }

    if (stat.isFile()) {
      hash.update(fs.readFileSync(itemPath));
    }
  }

  visit(root);
  return hash.digest("hex");
}

export async function runFlowRalph(projectPath: string, config: FlowRalphConfig, dependencies: FlowRalphDependencies = {}): Promise<FlowRalphResult> {
  const resolvedProjectPath = path.resolve(projectPath);
  ensureGitRepo(resolvedProjectPath);

  const getInit = dependencies.getInitPrompt ?? getInitPrompt;
  const getNext = dependencies.getNextPrompt ?? getNextPrompt;
  const findActive = dependencies.findActiveChangeDir ?? findActiveChangeDir;
  const reporter = dependencies.output ?? createRalphOutput(
    config.loop.notifications.telegram,
    dependencies.reporter ?? console,
    { env: dependencies.env, fetchImpl: dependencies.fetchImpl }
  );
  const createCodex = dependencies.createCodex ?? createDefaultCodexFactory;
  const now = dependencies.now ?? (() => new Date());
  const logDir = resolveProjectLogDir(resolvedProjectPath, config.loop.logDir);
  const logPath = path.join(logDir, "log.md");

  try {
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

      codex = codex ?? await createCodex();
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
      const beforeStageSnapshot = snapshotProjectState(resolvedProjectPath, logDir);
      reporter.log(`[FLOW RALPH] running stage: ${nextPrompt.stage}`);
      const turn = await runCodexTurn(thread, wrapNextPrompt(nextPrompt), nextPrompt.stage, reporter, config.codex.streamAgentOutput);
      const afterStageSnapshot = snapshotProjectState(resolvedProjectPath, logDir);

      if (config.loop.enableLogs) {
        const logEntry = logAgentResponse(
          logDir,
          iteration,
          nextPrompt.stage,
          stageModel.model,
          stageModel.reasoningEffort,
          turn.finalResponse ?? "",
          now,
          reporter
        );
        if (logEntry !== null) {
          reporter.notify(logEntry);
        }
      }

      const archived = hasCompletedArchivedChange(resolvedProjectPath, beforeActiveChange);

      if (archived) {
        reporter.log(`[FLOW RALPH] stage completed: ${nextPrompt.stage}`);
        reporter.log("[FLOW RALPH] archived");
        reporter.log(`[FLOW RALPH] log: ${logPath}`);
        return { status: "archived", iterations: iteration, logPath, reason: "Archive state was completed." };
      }

      if (beforeStageSnapshot === afterStageSnapshot) {
        reporter.log(`[FLOW RALPH] stage made no flow state change: ${nextPrompt.stage}`);
        reporter.log(`[FLOW RALPH] log: ${logPath}`);
        return { status: "no_progress", iterations: iteration, logPath, reason: "Stage completed without changing project state." };
      }

      reporter.log(`[FLOW RALPH] stage completed: ${nextPrompt.stage}`);
    }

    return { status: "max_iterations", iterations: config.loop.maxIterations, logPath, reason: "Reached loop.maxIterations." };
  } finally {
    await reporter.flush();
  }
}
