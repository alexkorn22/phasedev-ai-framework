import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";
import { findActiveChangeDir } from "../../entities/flow-change/active-change";
import { readArchiveState } from "../../entities/flow-change/archive-state";
import { archiveRootPath } from "../../entities/flow-change/paths";
import { FlowPrompt } from "../../entities/flow-stage/types";
import { getInitPrompt, getNextPrompt } from "../flow-control";
import { resolveFlowRoute } from "../flow-control/flow-route";
import { CodexFileChange, createDefaultCodexFactory, CodexFactory, runCodexTurn } from "./codex-turn";
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

interface ChangedFiles {
  added: string[];
  modified: string[];
  deleted: string[];
}

function wrapNextPrompt(nextPrompt: FlowPrompt): string {
  return [
    "Below is the exact output of the manual `flow next` command.",
    "",
    "Run rules:",
    "- Execute only the printed stage contract.",
    "- Do not run `flow next`, `flow init`, or the flow controller yourself.",
    "- Do not move to the next stage.",
    "- Do not set human approval automatically.",
    "- Stop when the stage contract requires stopping.",
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

function isArchiveExecutionRoute(projectPath: string): boolean {
  const route = resolveFlowRoute(projectPath);
  return route.kind === "archive_ready" || route.kind === "pending_archive";
}

function archiveStageDisabledReason(): string {
  return "Archive stage execution is disabled by loop.runArchiveStage=false. Run 'flow next' manually to archive or enable loop.runArchiveStage.";
}

function isIgnoredFlowSnapshotPath(itemPath: string, logDir: string): boolean {
  return itemPath === logDir || itemPath.startsWith(`${logDir}${path.sep}`);
}

function snapshotFlowState(projectPath: string, logDir: string): Map<string, string> {
  const root = path.resolve(projectPath);
  const openspecRoot = path.join(root, "openspec");
  const snapshot = new Map<string, string>();

  function visit(itemPath: string): void {
    if (isIgnoredFlowSnapshotPath(itemPath, logDir)) {
      return;
    }

    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(itemPath);
    } catch {
      return;
    }

    if (stat.isSymbolicLink()) {
      return;
    }

    if (stat.isDirectory()) {
      const relativePath = path.relative(root, itemPath);
      const dirHash = createHash("sha256").update(relativePath).update("dir").digest("hex");
      snapshot.set(relativePath, dirHash);

      let items: string[];
      try {
        items = fs.readdirSync(itemPath).sort();
      } catch {
        return;
      }

      for (const item of items) {
        visit(path.join(itemPath, item));
      }
      return;
    }

    if (stat.isFile()) {
      try {
        const content = fs.readFileSync(itemPath);
        const relativePath = path.relative(root, itemPath);
        const fileHash = createHash("sha256").update(content).digest("hex");
        snapshot.set(relativePath, fileHash);
      } catch {
        // Ignore read errors
      }
    }
  }

  if (fs.existsSync(openspecRoot)) {
    visit(openspecRoot);
  }
  return snapshot;
}

function computeCombinedHash(snapshot: Map<string, string>): string {
  const hash = createHash("sha256");
  const sortedKeys = Array.from(snapshot.keys()).sort();
  for (const key of sortedKeys) {
    hash.update(key);
    const val = snapshot.get(key);
    if (val) hash.update(val);
  }
  return hash.digest("hex");
}

function getChangedFiles(before: Map<string, string>, after: Map<string, string>): ChangedFiles {
  const added: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];

  for (const [file, hash] of after) {
    if (!before.has(file)) {
      added.push(file);
    } else if (before.get(file) !== hash) {
      modified.push(file);
    }
  }

  for (const file of before.keys()) {
    if (!after.has(file)) {
      deleted.push(file);
    }
  }

  return { added, modified, deleted };
}

function normalizeReportedFileChangePath(projectPath: string, reportedPath: string): string | null {
  if (reportedPath.trim() === "") {
    return null;
  }

  const absolutePath = path.isAbsolute(reportedPath) ? reportedPath : path.join(projectPath, reportedPath);
  const relativePath = path.relative(projectPath, absolutePath);
  if (relativePath === "" || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return reportedPath.replace(/\\/g, "/");
  }

  return relativePath.replace(/\\/g, "/");
}

function changedFilesFromReportedFileChanges(projectPath: string, fileChanges: CodexFileChange[]): ChangedFiles {
  const changed: ChangedFiles = { added: [], modified: [], deleted: [] };

  for (const fileChange of fileChanges) {
    const normalizedPath = normalizeReportedFileChangePath(projectPath, fileChange.path);
    if (normalizedPath === null) {
      continue;
    }

    const kind = fileChange.kind.toLowerCase();
    if (kind === "delete" || kind === "deleted" || kind === "remove" || kind === "removed") {
      changed.deleted.push(normalizedPath);
    } else if (kind === "create" || kind === "created" || kind === "add" || kind === "added") {
      changed.added.push(normalizedPath);
    } else {
      changed.modified.push(normalizedPath);
    }
  }

  return changed;
}

function mergeChangedFiles(...changes: ChangedFiles[]): ChangedFiles {
  const added = new Set<string>();
  const modified = new Set<string>();
  const deleted = new Set<string>();

  for (const change of changes) {
    for (const file of change.added) added.add(file);
    for (const file of change.modified) modified.add(file);
    for (const file of change.deleted) deleted.add(file);
  }

  return {
    added: Array.from(added).sort(),
    modified: Array.from(modified).sort(),
    deleted: Array.from(deleted).sort()
  };
}

function hasReportedCodeChange(changed: ChangedFiles): boolean {
  return [...changed.added, ...changed.modified, ...changed.deleted]
    .some(filePath => !filePath.replace(/\\/g, "/").startsWith("openspec/"));
}

function isOutsideProjectPath(normalizedPath: string): boolean {
  return path.isAbsolute(normalizedPath) || normalizedPath === ".." || normalizedPath.startsWith("../");
}

function validateStageAllowlist(
  stage: string,
  projectPath: string,
  activeChangeDir: string | null,
  changed: ChangedFiles
): string[] {
  const violations: string[] = [];
  const allChanged = [...changed.added, ...changed.modified, ...changed.deleted];
  if (allChanged.length === 0) {
    return [];
  }

  const relativeChangeDir = activeChangeDir ? path.relative(path.resolve(projectPath), path.resolve(activeChangeDir)).replace(/\\/g, "/") : null;

  for (const relPath of allChanged) {
    const normalized = relPath.replace(/\\/g, "/");

    if (isOutsideProjectPath(normalized)) {
      violations.push(`File '${normalized}' modified outside project path.`);
      continue;
    }

    if (normalized.startsWith("openspec/flow-ralph/") || normalized === "openspec/flow-ralph") {
      continue;
    }

    if (normalized.startsWith("openspec/changes/archive/") || normalized === "openspec/changes/archive") {
      continue;
    }

    if (stage === "setup") {
      const isAllowed = relativeChangeDir && (
        normalized === relativeChangeDir ||
        normalized === `${relativeChangeDir}/prd.md` ||
        normalized === `${relativeChangeDir}/rules.md`
      );
      if (!isAllowed) {
        violations.push(`File '${normalized}' modified during 'setup' stage is outside allowlist.`);
      }
    } else if (stage === "research") {
      const isAllowed = relativeChangeDir && normalized === `${relativeChangeDir}/research_facts.md`;
      if (!isAllowed) {
        violations.push(`File '${normalized}' modified during 'research' stage is outside allowlist.`);
      }
    } else if (stage === "design") {
      const isAllowed = relativeChangeDir && normalized === `${relativeChangeDir}/architecture/design.md`;
      if (!isAllowed) {
        violations.push(`File '${normalized}' modified during 'design' stage is outside allowlist.`);
      }
    } else if (stage === "plan") {
      const isAllowed = relativeChangeDir && normalized === `${relativeChangeDir}/implementation_plan.md`;
      if (!isAllowed) {
        violations.push(`File '${normalized}' modified during 'plan' stage is outside allowlist.`);
      }
    } else if (stage === "implementation") {
      const isPlan = relativeChangeDir && normalized === `${relativeChangeDir}/implementation_plan.md`;
      const isOutsideOpenSpec = !normalized.startsWith("openspec/");
      if (!isPlan && !isOutsideOpenSpec) {
        violations.push(`File '${normalized}' modified during 'implementation' stage is outside allowlist.`);
      }
    } else if (stage === "phase_validation" || stage === "final_validation") {
      const isFindings = relativeChangeDir && normalized === `${relativeChangeDir}/validation_findings.md`;
      const isPlan = stage === "phase_validation" && relativeChangeDir && normalized === `${relativeChangeDir}/implementation_plan.md`;
      if (!isFindings && !isPlan) {
        violations.push(`File '${normalized}' modified during '${stage}' stage is outside allowlist.`);
      }
    } else if (stage === "repair") {
      const isOutsideOpenSpec = !normalized.startsWith("openspec/");
      const isFindings = relativeChangeDir && normalized === `${relativeChangeDir}/validation_findings.md`;
      const isPlan = relativeChangeDir && normalized === `${relativeChangeDir}/implementation_plan.md`;
      const isDesign = relativeChangeDir && normalized === `${relativeChangeDir}/architecture/design.md`;
      const isPrd = relativeChangeDir && normalized === `${relativeChangeDir}/prd.md`;

      if (!isOutsideOpenSpec && !isFindings && !isPlan && !isDesign && !isPrd) {
        violations.push(`File '${normalized}' modified during 'repair' stage is outside allowlist.`);
      }
    } else if (stage === "archive") {
      const isArchiveJson = normalized === ".flow-archive.json" || normalized.endsWith("/.flow-archive.json");
      const isInArchiveDir = normalized.startsWith("openspec/changes/archive/");
      const isDeletedActiveChange = relativeChangeDir && normalized.startsWith(`${relativeChangeDir}/`);

      if (!isArchiveJson && !isInArchiveDir && !isDeletedActiveChange) {
        violations.push(`File '${normalized}' modified during 'archive' stage is outside allowlist.`);
      }
    }
  }

  return violations;
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
      if (!config.loop.runArchiveStage && isArchiveExecutionRoute(resolvedProjectPath)) {
        const reason = archiveStageDisabledReason();
        reporter.log("[FLOW RALPH] blocked at stage: archive");
        reporter.log(`[FLOW RALPH] reason: ${reason}`);
        reporter.log(`[FLOW RALPH] log: ${logPath}`);
        return { status: "blocked", iterations: iteration - 1, logPath, reason };
      }

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
      const beforeStageSnapshot = snapshotFlowState(resolvedProjectPath, logDir);
      reporter.log(`[FLOW RALPH] running stage: ${nextPrompt.stage}`);
      const turn = await runCodexTurn(thread, wrapNextPrompt(nextPrompt), nextPrompt.stage, reporter, config.codex.streamAgentOutput);
      const afterStageSnapshot = snapshotFlowState(resolvedProjectPath, logDir);

      const beforeHash = computeCombinedHash(beforeStageSnapshot);
      const afterHash = computeCombinedHash(afterStageSnapshot);

      const flowChangedFiles = getChangedFiles(beforeStageSnapshot, afterStageSnapshot);
      const reportedChangedFiles = changedFilesFromReportedFileChanges(resolvedProjectPath, turn.fileChanges);
      const changedFiles = mergeChangedFiles(flowChangedFiles, reportedChangedFiles);
      const activeChangeDir = findActive(resolvedProjectPath);
      const allowlistViolations = validateStageAllowlist(
        nextPrompt.stage,
        resolvedProjectPath,
        activeChangeDir,
        changedFiles
      );

      if (allowlistViolations.length > 0) {
        const violationMsg = `[FLOW RALPH] Stage allowlist violation detected during '${nextPrompt.stage}' stage:\n${allowlistViolations.map(v => `- ${v}`).join("\n")}`;
        reporter.log(violationMsg);
        reporter.log(`[FLOW RALPH] log: ${logPath}`);
        return {
          status: "blocked",
          iterations: iteration,
          logPath,
          reason: `Artifact allowlist violation: ${allowlistViolations.join("; ")}`
        };
      }

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

      if (beforeHash === afterHash && !hasReportedCodeChange(reportedChangedFiles)) {
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
