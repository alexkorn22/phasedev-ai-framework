import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";
import { findActiveChangeDir } from "../../entities/change/active-change";
import { readArchiveState } from "../../entities/change/archive-state";
import { archiveRootPath } from "../../entities/change/paths";
import type { IterationFailure, IterationLogger, IterationLogEntry, IterationOutcome, IterationUsage } from "../../entities/iteration-log";
import { Prompt } from "../../entities/stage/types";
import { getInitPrompt, getNextPrompt } from "../stage-control";
import { resolveRoute } from "../stage-control/flow-route";
import { autoApproveCurrentRoute } from "./auto-approve";
import { CodexFileChange, CodexTurnTimeoutError, createDefaultCodexFactory, CodexFactory, runCodexTurn } from "./codex-turn";
import { Config, resolveProjectLogDir } from "./config";

export interface RunnerDependencies {
  createCodex?: () => Promise<CodexFactory> | CodexFactory;
  getInitPrompt?: typeof getInitPrompt;
  getNextPrompt?: typeof getNextPrompt;
  findActiveChangeDir?: typeof findActiveChangeDir;
  reporter?: Pick<typeof console, "log">;
  iterationLogger?: IterationLogger;
  env?: Record<string, string | undefined>;
  now?: () => Date;
}

export type RunnerStatus = "archived" | "blocked" | "no_progress" | "max_iterations";

export interface RunnerResult {
  status: RunnerStatus;
  iterations: number;
  logPath: string;
  reason: string;
}

interface ChangedFiles {
  added: string[];
  modified: string[];
  deleted: string[];
}

const PROJECT_CONFIG_RELATIVE_PATH = ".phasedev/config.yaml";

function wrapStagePrompt(initPrompt: Prompt, nextPrompt: Prompt): string {
  return [
    "Below is the exact output of the manual `phasedev init` command.",
    "Use it as bootstrap context only.",
    "",
    "=== FLOW INIT PROMPT START ===",
    initPrompt.prompt,
    "=== FLOW INIT PROMPT END ===",
    "",
    "Below is the exact output of the manual `phasedev next` command.",
    "",
    "Run rules:",
    "- Execute only the printed stage contract.",
    "- Do not run `phasedev next`, `phasedev init`, or the flow controller yourself.",
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
  const route = resolveRoute(projectPath);
  return route.kind === "archive_ready" || route.kind === "pending_archive";
}

function archiveStageDisabledReason(): string {
  return "Archive stage execution is disabled by loop.runArchiveStage=false. Run 'phasedev next' manually to archive or enable loop.runArchiveStage.";
}

function applyAutoApprovals(projectPath: string, reporter: Pick<typeof console, "log">): string | null {
  const maxApprovalGates = 3;
  for (let attempt = 0; attempt < maxApprovalGates; attempt++) {
    let result: ReturnType<typeof autoApproveCurrentRoute>;
    try {
      result = autoApproveCurrentRoute(projectPath);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return `AutoApprove failed: ${message}`;
    }

    if (!result.approved) {
      return null;
    }

    if (result.message) {
      reporter.log(result.message);
    }
    if (!result.advanced) {
      return result.reason ?? "AutoApprove could not advance the current approval route.";
    }
  }

  return "AutoApprove exceeded the maximum number of approval gates in one runner iteration.";
}

function isIgnoredFlowSnapshotPath(itemPath: string, logDir: string): boolean {
  return itemPath === logDir ||
    itemPath.startsWith(`${logDir}${path.sep}`) ||
    itemPath.endsWith(PROJECT_CONFIG_RELATIVE_PATH.replace(/\//g, path.sep));
}

function snapshotFlowState(projectPath: string, logDir: string): Map<string, string> {
  const root = path.resolve(projectPath);
  const flowRoot = path.join(root, ".phasedev");
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

  if (fs.existsSync(flowRoot)) {
    visit(flowRoot);
  }
  return snapshot;
}

function snapshotProtectedFlowFiles(projectPath: string): Map<string, string> {
  const root = path.resolve(projectPath);
  const snapshot = new Map<string, string>();

  function hashProtectedPath(relativePath: string): void {
    const itemPath = path.join(root, relativePath);
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(itemPath);
    } catch {
      return;
    }

    const hash = createHash("sha256").update(relativePath);
    if (stat.isSymbolicLink()) {
      hash.update("symlink");
      try {
        hash.update(fs.readlinkSync(itemPath));
      } catch {
        hash.update("unreadable");
      }
    } else if (stat.isDirectory()) {
      hash.update("dir");
    } else if (stat.isFile()) {
      hash.update("file");
      try {
        hash.update(fs.readFileSync(itemPath));
      } catch {
        hash.update("unreadable");
      }
    } else {
      hash.update("other");
    }

    snapshot.set(relativePath, hash.digest("hex"));
  }

  hashProtectedPath(PROJECT_CONFIG_RELATIVE_PATH);
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
  const statusByPath = new Map<string, keyof ChangedFiles>();
  const precedence: Record<keyof ChangedFiles, number> = {
    modified: 1,
    added: 2,
    deleted: 3
  };

  function record(file: string, status: keyof ChangedFiles): void {
    const currentStatus = statusByPath.get(file);
    if (!currentStatus || precedence[status] > precedence[currentStatus]) {
      statusByPath.set(file, status);
    }
  }

  for (const change of changes) {
    for (const file of change.modified) record(file, "modified");
    for (const file of change.added) record(file, "added");
    for (const file of change.deleted) record(file, "deleted");
  }

  return {
    added: Array.from(statusByPath.entries()).filter(([, status]) => status === "added").map(([file]) => file).sort(),
    modified: Array.from(statusByPath.entries()).filter(([, status]) => status === "modified").map(([file]) => file).sort(),
    deleted: Array.from(statusByPath.entries()).filter(([, status]) => status === "deleted").map(([file]) => file).sort()
  };
}

function hasReportedCodeChange(changed: ChangedFiles): boolean {
  return [...changed.added, ...changed.modified, ...changed.deleted]
    .some(filePath => !filePath.replace(/\\/g, "/").startsWith(".phasedev/"));
}

function isOutsideProjectPath(normalizedPath: string): boolean {
  return path.isAbsolute(normalizedPath) || normalizedPath === ".." || normalizedPath.startsWith("../");
}

function isFlowSpecsPath(normalizedPath: string): boolean {
  return normalizedPath === ".phasedev/specs" || normalizedPath.startsWith(".phasedev/specs/");
}

function isCurrentArchivePath(normalizedPath: string, relativeChangeDir: string | null): boolean {
  if (!relativeChangeDir) {
    return false;
  }

  const changeName = path.posix.basename(relativeChangeDir);
  const archivePrefix = ".phasedev/changes/archive/";
  if (!normalizedPath.startsWith(archivePrefix)) {
    return false;
  }

  const archiveEntry = normalizedPath.slice(archivePrefix.length).split("/")[0];
  return archiveEntry.endsWith(`-${changeName}`);
}

function isLogDirPath(normalizedPath: string, relativeLogDir: string): boolean {
  return normalizedPath === relativeLogDir || normalizedPath.startsWith(`${relativeLogDir}/`);
}

function validateStageAllowlist(
  stage: string,
  projectPath: string,
  relativeLogDir: string,
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

    if (isLogDirPath(normalized, relativeLogDir)) {
      continue;
    }

    if (stage === "change_intake") {
      const isAllowed = relativeChangeDir && (
        normalized === relativeChangeDir ||
        normalized === `${relativeChangeDir}/prd.md` ||
        normalized === `${relativeChangeDir}/execution_contract.md`
      );
      if (!isAllowed) {
        violations.push(`File '${normalized}' modified during 'change_intake' stage is outside allowlist.`);
      }
    } else if (stage === "code_research") {
      const isAllowed = relativeChangeDir && normalized === `${relativeChangeDir}/research_facts.md`;
      if (!isAllowed) {
        violations.push(`File '${normalized}' modified during 'code_research' stage is outside allowlist.`);
      }
    } else if (stage === "technical_design") {
      const isAllowed = relativeChangeDir &&
        (
          normalized === `${relativeChangeDir}/architecture` ||
          (
            path.posix.dirname(normalized) === `${relativeChangeDir}/architecture` &&
            path.posix.extname(normalized) === ".md"
          )
        );
      if (!isAllowed) {
        violations.push(`File '${normalized}' modified during 'technical_design' stage is outside allowlist.`);
      }
    } else if (stage === "iteration_planning") {
      const isAllowed = relativeChangeDir && normalized === `${relativeChangeDir}/iteration_plan.md`;
      if (!isAllowed) {
        violations.push(`File '${normalized}' modified during 'iteration_planning' stage is outside allowlist.`);
      }
    } else if (stage === "implementation") {
      const isPlan = relativeChangeDir && normalized === `${relativeChangeDir}/iteration_plan.md`;
      const isOutsideFlowState = !normalized.startsWith(".phasedev/");
      if (!isPlan && !isOutsideFlowState) {
        violations.push(`File '${normalized}' modified during 'implementation' stage is outside allowlist.`);
      }
    } else if (stage === "iteration_validation" || stage === "final_validation") {
      const isFindings = relativeChangeDir && normalized === `${relativeChangeDir}/validation_findings.md`;
      const isPlan = stage === "iteration_validation" && relativeChangeDir && normalized === `${relativeChangeDir}/iteration_plan.md`;
      if (!isFindings && !isPlan) {
        violations.push(`File '${normalized}' modified during '${stage}' stage is outside allowlist.`);
      }
    } else if (stage === "finding_repair") {
      const isOutsideFlowState = !normalized.startsWith(".phasedev/");
      const isFindings = relativeChangeDir && normalized === `${relativeChangeDir}/validation_findings.md`;
      const isPlan = relativeChangeDir && normalized === `${relativeChangeDir}/iteration_plan.md`;
      const isDesign = relativeChangeDir && (
        normalized === `${relativeChangeDir}/architecture` ||
        normalized === `${relativeChangeDir}/architecture/design.md` ||
        (
          path.posix.dirname(normalized) === `${relativeChangeDir}/architecture` &&
          path.posix.extname(normalized) === ".md"
        )
      );
      const isPrd = relativeChangeDir && normalized === `${relativeChangeDir}/prd.md`;

      if (!isOutsideFlowState && !isFindings && !isPlan && !isDesign && !isPrd) {
        violations.push(`File '${normalized}' modified during 'repair' stage is outside allowlist.`);
      }
    } else if (stage === "archive") {
      const isArchiveJson = normalized === ".phase-archive.json" || normalized.endsWith("/.phase-archive.json");
      const isArchiveRoot = normalized === ".phasedev/changes/archive";
      const isInCurrentArchiveDir = isCurrentArchivePath(normalized, relativeChangeDir);
      const isDeletedActiveChange = relativeChangeDir && normalized.startsWith(`${relativeChangeDir}/`);
      const isActiveChangeDir = relativeChangeDir && normalized === relativeChangeDir;

      if (!isArchiveJson && !isArchiveRoot && !isInCurrentArchiveDir && !isFlowSpecsPath(normalized) && !isDeletedActiveChange && !isActiveChangeDir) {
        violations.push(`File '${normalized}' modified during 'archive' stage is outside allowlist.`);
      }
    }
  }

  return violations;
}

function buildIterationLogEntry(
  iteration: number,
  stage: string,
  model: string,
  reasoningEffort: string,
  activeChange: string | null,
  durationMs: number,
  usage: IterationUsage | null,
  changedFiles: ChangedFiles,
  flowStateChanged: boolean,
  allowlistViolations: string[],
  outcome: IterationOutcome,
  initPrompt: string | null,
  agentPrompt: string | null,
  agentResponse: string,
  now: () => Date,
  failure: IterationFailure | null = null
): IterationLogEntry {
  return {
    timestamp: now().toISOString(),
    iteration,
    stage,
    model,
    reasoningEffort,
    activeChange,
    durationMs,
    usage,
    changedFiles,
    flowStateChanged,
    allowlistViolations,
    outcome,
    initPrompt,
    agentPrompt,
    agentResponse,
    failure
  };
}

function logRunnerEvent(iterationLogger: IterationLogger | null, entry: IterationLogEntry): void {
  if (iterationLogger) {
    iterationLogger.log(entry);
  }
}

function implementationBlockedReason(projectPath: string): string | null {
  const route = resolveRoute(projectPath);
  if (route.kind !== "phase" || route.stage !== "implementation") {
    return null;
  }

  const blockedRows = (route.activePhase.checkEvidence ?? []).filter(row => row.result === "blocked");
  if (blockedRows.length === 0) {
    return null;
  }

  return `Current implementation phase is blocked by Check Evidence. Phase ${route.activePhase.id}: ${route.activePhase.name}.`;
}

export async function runRunner(projectPath: string, config: Config, dependencies: RunnerDependencies = {}): Promise<RunnerResult> {
  const resolvedProjectPath = path.resolve(projectPath);
  ensureGitRepo(resolvedProjectPath);

  const getInit = dependencies.getInitPrompt ?? getInitPrompt;
  const getNext = dependencies.getNextPrompt ?? getNextPrompt;
  const findActive = dependencies.findActiveChangeDir ?? findActiveChangeDir;
  const reporter = dependencies.reporter ?? console;
  const iterationLogger = dependencies.iterationLogger ?? null;
  const createCodex = dependencies.createCodex ?? createDefaultCodexFactory;
  const now = dependencies.now ?? (() => new Date());
  const logDir = resolveProjectLogDir(resolvedProjectPath, ".phasedev/logs");
  const relativeLogDir = path.relative(resolvedProjectPath, logDir).replace(/\\/g, "/");
  const logPath = path.join(logDir, "ralph-log.jsonl");

  try {
    let codex: CodexFactory | null = null;

    for (let iteration = 1; iteration <= 10; iteration++) {
      if (config.autoApprove) {
        const autoApproveFailure = applyAutoApprovals(resolvedProjectPath, reporter);
        if (autoApproveFailure) {
          reporter.log("[PHASEDEV RUNNER] blocked at stage: approval");
          reporter.log(`[PHASEDEV RUNNER] reason: ${autoApproveFailure}`);
          reporter.log(`[PHASEDEV RUNNER] log: ${logPath}`);
          const approvalStageModel = { model: "gpt-5.4", reasoningEffort: "high" as const };
          logRunnerEvent(iterationLogger, buildIterationLogEntry(
            iteration - 1, "approval", approvalStageModel.model, approvalStageModel.reasoningEffort,
            findActive(resolvedProjectPath), 0, null, { added: [], modified: [], deleted: [] }, false,
            [], "blocked", null, null, autoApproveFailure, now
          ));
          return { status: "blocked", iterations: iteration - 1, logPath, reason: autoApproveFailure };
        }
      }

      const beforeActiveChange = findActive(resolvedProjectPath);
      if (!config.runArchiveStage && isArchiveExecutionRoute(resolvedProjectPath)) {
        const reason = archiveStageDisabledReason();
        reporter.log("[PHASEDEV RUNNER] blocked at stage: archive");
        reporter.log(`[PHASEDEV RUNNER] reason: ${reason}`);
        reporter.log(`[PHASEDEV RUNNER] log: ${logPath}`);
        const stageModel = { model: "gpt-5.4", reasoningEffort: "high" as const };
        logRunnerEvent(iterationLogger, buildIterationLogEntry(
          iteration - 1, "archive", stageModel.model, stageModel.reasoningEffort,
          beforeActiveChange, 0, null, { added: [], modified: [], deleted: [] }, false,
          [], "blocked", null, null, reason, now
        ));
        return { status: "blocked", iterations: iteration - 1, logPath, reason };
      }

      const nextPrompt = getNext(resolvedProjectPath, config);

      if (nextPrompt.blocked) {
        const reason = nextPrompt.reason ?? "Flow controller blocked.";
        reporter.log(`[PHASEDEV RUNNER] blocked at stage: ${nextPrompt.stage}`);
        reporter.log(`[PHASEDEV RUNNER] reason: ${reason}`);
        reporter.log(`[PHASEDEV RUNNER] log: ${logPath}`);
        const stageModel = { model: "gpt-5.4", reasoningEffort: "high" as const };
        logRunnerEvent(iterationLogger, buildIterationLogEntry(
          iteration - 1, nextPrompt.stage, stageModel.model, stageModel.reasoningEffort,
          beforeActiveChange, 0, null, { added: [], modified: [], deleted: [] }, false,
          [], "blocked", null, null, reason, now
        ));
        return { status: "blocked", iterations: iteration - 1, logPath, reason };
      }

      if (nextPrompt.stage === "implementation" || nextPrompt.stage === "finding_repair") {
        const blockedReason = implementationBlockedReason(resolvedProjectPath);
        if (blockedReason) {
          reporter.log(`[PHASEDEV RUNNER] blocked at stage: ${nextPrompt.stage}`);
          reporter.log(`[PHASEDEV RUNNER] reason: ${blockedReason}`);
          reporter.log(`[PHASEDEV RUNNER] log: ${logPath}`);
          const stageModel = { model: "gpt-5.4", reasoningEffort: "high" as const };
          logRunnerEvent(iterationLogger, buildIterationLogEntry(
            iteration - 1, nextPrompt.stage, stageModel.model, stageModel.reasoningEffort,
            beforeActiveChange, 0, null, { added: [], modified: [], deleted: [] }, false,
            [], "blocked", null, null, blockedReason, now
          ));
          return { status: "blocked", iterations: iteration - 1, logPath, reason: blockedReason };
        }
      }

      const stageModel = { model: "gpt-5.4", reasoningEffort: "high" as const };
      reporter.log(`[PHASEDEV RUNNER] iteration ${iteration}/10`);
      reporter.log(`[PHASEDEV RUNNER] stage: ${nextPrompt.stage}`);
      reporter.log(`[PHASEDEV RUNNER] model: ${stageModel.model}`);
      reporter.log(`[PHASEDEV RUNNER] reasoning: ${stageModel.reasoningEffort}`);
      reporter.log(`[PHASEDEV RUNNER] active change: ${beforeActiveChange ?? "none"}`);

      codex = codex ?? await createCodex();
      const thread = codex.startThread({
        workingDirectory: resolvedProjectPath,
        model: stageModel.model,
        modelReasoningEffort: stageModel.reasoningEffort,
        sandboxMode: "workspace-write" as const,
        approvalPolicy: "never" as const,
        networkAccessEnabled: false
      });

      const beforeStageSnapshot = snapshotFlowState(resolvedProjectPath, logDir);
      const beforeProtectedSnapshot = snapshotProtectedFlowFiles(resolvedProjectPath);
      reporter.log(`[PHASEDEV RUNNER] running Codex stage with init bootstrap: ${nextPrompt.stage}`);

      const initPrompt = getInit(resolvedProjectPath, config);
      const agentPrompt = wrapStagePrompt(initPrompt, nextPrompt);
      const startMs = Date.now();
      let turn: Awaited<ReturnType<typeof runCodexTurn>>;
      try {
        turn = await runCodexTurn(
          thread,
          agentPrompt,
          nextPrompt.stage,
          reporter,
          true,
          { watchdog: { enabled: true, turnTimeoutMs: 3600000, inactivityTimeoutMs: 900000, statusIntervalMs: 300000, abortGraceMs: 5000 } }
        );
      } catch (error) {
        if (!(error instanceof CodexTurnTimeoutError)) {
          throw error;
        }

        const durationMs = Date.now() - startMs;
        const afterTimeoutSnapshot = snapshotFlowState(resolvedProjectPath, logDir);
        const afterProtectedSnapshot = snapshotProtectedFlowFiles(resolvedProjectPath);
        const beforeHash = computeCombinedHash(beforeStageSnapshot);
        const afterHash = computeCombinedHash(afterTimeoutSnapshot);
        const flowChangedFiles = getChangedFiles(beforeStageSnapshot, afterTimeoutSnapshot);
        const protectedChangedFiles = getChangedFiles(beforeProtectedSnapshot, afterProtectedSnapshot);
        const reportedChangedFiles = changedFilesFromReportedFileChanges(resolvedProjectPath, error.fileChanges);
        const changedFiles = mergeChangedFiles(flowChangedFiles, protectedChangedFiles, reportedChangedFiles);
        const activeChangeDir = nextPrompt.stage === "archive"
          ? beforeActiveChange
          : findActive(resolvedProjectPath);
        const allowlistViolations = validateStageAllowlist(
          nextPrompt.stage,
          resolvedProjectPath,
          relativeLogDir,
          activeChangeDir,
          changedFiles
        );
        const flowStateChanged = beforeHash !== afterHash;
        const timeoutReason = error.failure.message;
        const reason = allowlistViolations.length > 0
          ? `Artifact allowlist violation after Codex turn timeout: ${allowlistViolations.join("; ")}`
          : timeoutReason;

        reporter.log(`[PHASEDEV RUNNER] blocked at stage: ${nextPrompt.stage}`);
        reporter.log(`[PHASEDEV RUNNER] reason: ${reason}`);
        reporter.log(`[PHASEDEV RUNNER] last event: ${error.failure.lastEventSummary ?? "none"}`);
        reporter.log(`[PHASEDEV RUNNER] log: ${logPath}`);

        logRunnerEvent(iterationLogger, buildIterationLogEntry(
          iteration, nextPrompt.stage, stageModel.model, stageModel.reasoningEffort,
          beforeActiveChange, durationMs, null, changedFiles, flowStateChanged,
          allowlistViolations, "blocked", initPrompt.prompt, agentPrompt, timeoutReason, now, error.failure
        ));

        return { status: "blocked", iterations: iteration, logPath, reason };
      }
      const durationMs = Date.now() - startMs;

      const afterStageSnapshot = snapshotFlowState(resolvedProjectPath, logDir);
      const afterProtectedSnapshot = snapshotProtectedFlowFiles(resolvedProjectPath);

      const beforeHash = computeCombinedHash(beforeStageSnapshot);
      const afterHash = computeCombinedHash(afterStageSnapshot);

      const flowChangedFiles = getChangedFiles(beforeStageSnapshot, afterStageSnapshot);
      const protectedChangedFiles = getChangedFiles(beforeProtectedSnapshot, afterProtectedSnapshot);
      const reportedChangedFiles = changedFilesFromReportedFileChanges(resolvedProjectPath, turn.fileChanges);
      const changedFiles = mergeChangedFiles(flowChangedFiles, protectedChangedFiles, reportedChangedFiles);
      const activeChangeDir = nextPrompt.stage === "archive"
        ? beforeActiveChange
        : findActive(resolvedProjectPath);
      const allowlistViolations = validateStageAllowlist(
        nextPrompt.stage,
        resolvedProjectPath,
        relativeLogDir,
        activeChangeDir,
        changedFiles
      );

      if (allowlistViolations.length > 0) {
        const violationMsg = `[PHASEDEV RUNNER] Stage allowlist violation detected during '${nextPrompt.stage}' stage:\n${allowlistViolations.map(v => `- ${v}`).join("\n")}`;
        reporter.log(violationMsg);
        reporter.log(`[PHASEDEV RUNNER] log: ${logPath}`);

        logRunnerEvent(iterationLogger, buildIterationLogEntry(
          iteration, nextPrompt.stage, stageModel.model, stageModel.reasoningEffort,
          beforeActiveChange, durationMs, turn.usage, changedFiles, false,
          allowlistViolations, "violation", initPrompt.prompt, agentPrompt, turn.finalResponse, now
        ));

        return {
          status: "blocked",
          iterations: iteration,
          logPath,
          reason: `Artifact allowlist violation: ${allowlistViolations.join("; ")}`
        };
      }

      const flowStateChanged = beforeHash !== afterHash;

      const archived = hasCompletedArchivedChange(resolvedProjectPath, beforeActiveChange);
      const blockedReason = !archived && flowStateChanged && (
        nextPrompt.stage === "implementation" || nextPrompt.stage === "finding_repair"
      )
        ? implementationBlockedReason(resolvedProjectPath)
        : null;
      const outcome: IterationOutcome = archived ? "archived" : blockedReason ? "blocked" : flowStateChanged ? "completed" : "no_progress";
      logRunnerEvent(iterationLogger, buildIterationLogEntry(
        iteration, nextPrompt.stage, stageModel.model, stageModel.reasoningEffort,
        beforeActiveChange, durationMs, turn.usage, changedFiles, flowStateChanged,
        [], outcome, initPrompt.prompt, agentPrompt, turn.finalResponse, now
      ));

      if (archived) {
        reporter.log(`[PHASEDEV RUNNER] stage completed: ${nextPrompt.stage}`);
        reporter.log("[PHASEDEV RUNNER] archived");
        reporter.log(`[PHASEDEV RUNNER] log: ${logPath}`);
        return { status: "archived", iterations: iteration, logPath, reason: "Archive state was completed." };
      }

      if (blockedReason) {
        reporter.log(`[PHASEDEV RUNNER] blocked at stage: ${nextPrompt.stage}`);
        reporter.log(`[PHASEDEV RUNNER] reason: ${blockedReason}`);
        reporter.log(`[PHASEDEV RUNNER] log: ${logPath}`);
        return { status: "blocked", iterations: iteration, logPath, reason: blockedReason };
      }

      if (!flowStateChanged && !hasReportedCodeChange(reportedChangedFiles)) {
        reporter.log(`[PHASEDEV RUNNER] stage made no flow state change: ${nextPrompt.stage}`);
        reporter.log(`[PHASEDEV RUNNER] log: ${logPath}`);
        return { status: "no_progress", iterations: iteration, logPath, reason: "Stage completed without changing project state." };
      }

      reporter.log(`[PHASEDEV RUNNER] stage completed: ${nextPrompt.stage}`);
    }

    return { status: "max_iterations", iterations: 10, logPath, reason: "Reached loop.maxIterations." };
  } finally {
    if (iterationLogger) {
      await iterationLogger.flush();
    }
  }
}
