import * as fs from "fs";
import * as path from "path";
import { Config, loadConfig } from "../../entities/config/config";
import { FlowState, ActivePhase, loadFlowState } from "../../entities/change/flow-state";
import { buildChangePaths, SYSTEM_DIR } from "../../entities/change/paths";
import { renderTemplate } from "../../shared/templates/render-template";
import { renderArtifactContract } from "./artifact-contract";
import { renderChangedFileInventory } from "./changed-file-inventory";
import { toFileUrl } from "./prompt-formatters";
import { formatPhaseExcerpt, formatPlanMap } from "./prompt-formatters";
import { parsePlan } from "../../entities/iteration-plan/parse-plan";
import { parseTestCommands } from "../../entities/test-commands/parse-test-commands";
import { renderSkillComplianceLine, renderSkillPolicy } from "./skill-policy";
import { Prompt } from "../../entities/phase/types";
import { shellQuote } from "../../shared/shell/shell-quote";
import { findActiveChangeDir } from "../../entities/change/active-change";
import { findPendingArchiveState } from "../../entities/change/archive-state";
import { parseCurrentValidationFindings } from "../../entities/validation-findings/parse-validation-findings";
import { urlsFor, flowCheckCommand, renderPhaseTemplate, researchArtifactContract, finalValidationArtifactContract, implementationPlanArtifactContract } from "../../shared/prompt/phase-render-helpers";

function artifactContractSimple(
  artifactId: string,
  resolvedOutputPath: string,
  templateName: string,
  selfCheckCommand: string,
  date = new Date().toISOString().split("T")[0],
  selfCheckFailureGuidance?: string,
  includeSelfCheck?: boolean
): string {
  return renderArtifactContract({
    artifactId,
    resolvedOutputPath,
    templateName,
    selfCheckCommand,
    selfCheckFailureGuidance,
    includeSelfCheck,
    date
  });
}


function validationFindingsContract(findingsPath: string, projectPath: string, iterationId?: number): string {
  return renderArtifactContract({
    artifactId: "validation_findings.md",
    resolvedOutputPath: findingsPath,
    templateName: "artifacts/validation_findings",
    selfCheckCommand: iterationId === undefined
      ? flowCheckCommand(projectPath)
      : `phasedev check-validation --project-path ${shellQuote(projectPath)} --scope iteration --iteration-id ${iterationId}`,
    selfCheckFailureGuidance: iterationId === undefined
      ? undefined
      : "Artifact contract check must pass before reporting this stage complete. If it fails, fix only `validation_findings.md` and the current phase status in `iteration_plan.md` when allowed by the validation verdict, then rerun the same command.",
    date: new Date().toISOString().split("T")[0]
  });
}

// ── Render Functions ───────────────────────────────────────

function renderChangeIntake(projectPath: string, config: Config, state: FlowState, activeChangePath: string | null): string {
  const date = new Date().toISOString().split("T")[0];
  const changeRoot = activeChangePath ?? path.join(projectPath, SYSTEM_DIR, "changes", "<derive-slug-from-final-task>");
  const selfCheckCommand = flowCheckCommand(projectPath);

  let taskContext = "";
  const taskFile = process.env.FLOW_TASK_FILE;
  if (taskFile && fs.existsSync(taskFile)) {
    taskContext = `\n\n=== CURRENT TASK DESCRIPTION ===\n${fs.readFileSync(taskFile, "utf-8")}\n================================`;
  }

  return renderPhaseTemplate("change_intake", "phase1_change_intake", {
    date,
    project_path: projectPath,
    prd_artifact_contract: artifactContractSimple("prd.md", path.join(changeRoot, "prd.md"), "artifacts/prd", selfCheckCommand, date, undefined, false),
    rules_artifact_contract: artifactContractSimple("execution_contract.md", path.join(changeRoot, "execution_contract.md"), "artifacts/execution_contract", selfCheckCommand, date, undefined, false),
    self_check_command: selfCheckCommand
  }, config) + taskContext;
}

function renderCodeResearch(projectPath: string, config: Config, paths: ReturnType<typeof buildChangePaths>): string {
  const urls = urlsFor(paths);
  return renderPhaseTemplate("code_research", "phase2_code_research", {
    prd_path: urls.prd_path,
    rules_path: urls.rules_path,
    project_specs_path: toFileUrl(path.join(projectPath, SYSTEM_DIR, "specs")),
    project_path: projectPath,
    research_path: urls.research_path,
    research_artifact_contract: researchArtifactContract(paths.researchPath, projectPath),
    self_check_command: flowCheckCommand(projectPath)
  }, config);
}

function renderTechnicalDesign(projectPath: string, config: Config, paths: ReturnType<typeof buildChangePaths>): string {
  const urls = urlsFor(paths);
  return renderPhaseTemplate("technical_design", "phase3_technical_design", {
    prd_path: urls.prd_path,
    rules_path: urls.rules_path,
    research_path: urls.research_path,
    design_path: urls.design_path,
    date: new Date().toISOString().split("T")[0],
    design_artifact_contract: artifactContractSimple("architecture/design.md", paths.designPath, "artifacts/design", flowCheckCommand(projectPath)),
    self_check_command: flowCheckCommand(projectPath)
  }, config);
}

function renderIterationPlanning(projectPath: string, config: Config, paths: ReturnType<typeof buildChangePaths>): string {
  const urls = urlsFor(paths);
  const date = new Date().toISOString().split("T")[0];
  const selfCheckCommand = flowCheckCommand(projectPath);
  return renderPhaseTemplate("iteration_planning", "phase4_iteration_planning", {
    prd_path: urls.prd_path,
    design_path: urls.design_path,
    rules_path: urls.rules_path,
    plan_path: urls.plan_path,
    date,
    implementation_plan_artifact_contract: implementationPlanArtifactContract(paths.iterationPlanPath, selfCheckCommand, date),
    self_check_command: selfCheckCommand
  }, config);
}

function renderImplementation(projectPath: string, config: Config, paths: ReturnType<typeof buildChangePaths>, activeIterationId: number): string {
  const plan = parsePlan(paths.iterationPlanPath);
  const currentPhase = plan.find(p => p.id === activeIterationId) ?? null;
  const urls = urlsFor(paths);
  const testCommands = parseTestCommands(paths.executionContractPath).commands;

  if (!currentPhase) {
    return `[PHASEDEV] Iteration ${activeIterationId} not found in iteration plan.`;
  }

  return renderPhaseTemplate("implementation", "phase5_implementation", {
    phase_id: `Iteration ${currentPhase.id}: ${currentPhase.name}`,
    plan_map: formatPlanMap(plan, currentPhase.id),
    phase_excerpt: formatPhaseExcerpt(currentPhase),
    test_command: "phasedev check",
    self_check_command: flowCheckCommand(projectPath),
    prd_path: urls.prd_path,
    rules_path: urls.rules_path,
    design_path: urls.design_path,
    plan_path: urls.plan_path
  }, config);
}

function renderIterationValidation(projectPath: string, config: Config, paths: ReturnType<typeof buildChangePaths>, activeIterationId: number): string {
  const plan = parsePlan(paths.iterationPlanPath);
  const currentPhase = plan.find(p => p.id === activeIterationId) ?? null;
  const urls = urlsFor(paths);

  if (!currentPhase) {
    return `[PHASEDEV] Iteration ${activeIterationId} not found in iteration plan.`;
  }

  const phaseLabel = `Iteration ${currentPhase.id}: ${currentPhase.name}`;

  return renderPhaseTemplate("iteration_validation", "phase6a_iteration_validation", {
    phase_id: phaseLabel,
    prd_path: urls.prd_path,
    rules_path: urls.rules_path,
    design_path: urls.design_path,
    plan_path: urls.plan_path,
    findings_path: urls.findings_path,
    date: new Date().toISOString().split("T")[0],
    controller_changed_files_inventory: renderChangedFileInventory(projectPath, { phase: currentPhase }),
    validation_findings_artifact_contract: validationFindingsContract(paths.findingsPath, projectPath, currentPhase.id)
  }, config);
}

function renderFinalValidation(projectPath: string, config: Config, paths: ReturnType<typeof buildChangePaths>): string {
  const urls = urlsFor(paths);
  return renderPhaseTemplate("final_validation", "phase6b_final_validation", {
    prd_path: urls.prd_path,
    rules_path: urls.rules_path,
    design_path: urls.design_path,
    plan_path: urls.plan_path,
    findings_path: urls.findings_path,
    date: new Date().toISOString().split("T")[0],
    controller_changed_files_inventory: renderChangedFileInventory(projectPath),
    validation_findings_artifact_contract: finalValidationArtifactContract(paths.findingsPath, projectPath)
  }, config);
}

function renderFindingRepair(projectPath: string, config: Config, paths: ReturnType<typeof buildChangePaths>): string {
  const urls = urlsFor(paths);
  return renderPhaseTemplate("finding_repair", "phase6r_finding_repair", {
    repair_queue: formatRepairQueue(paths.findingsPath),
    findings_path: urls.findings_path,
    plan_path: urls.plan_path,
    design_path: urls.design_path,
    prd_path: urls.prd_path,
    research_path: urls.research_path,
    rules_path: urls.rules_path,
    validation_findings_artifact_contract: validationFindingsContract(paths.findingsPath, projectPath)
  }, config);
}

function renderArchiveContract(projectPath: string, config: Config, activeChangePath: string): string {
  const archivedPaths = buildChangePaths(activeChangePath);
  const urls = urlsFor(archivedPaths);
  const changeName = path.basename(activeChangePath);

  return renderTemplate("phase7_archive", {
    change_name: changeName,
    prd_path: urls.prd_path,
    rules_path: urls.rules_path,
    research_path: urls.research_path,
    design_path: urls.design_path,
    plan_path: urls.plan_path,
    findings_path: urls.findings_path,
    main_specs_path: toFileUrl(path.join(projectPath, SYSTEM_DIR, "specs")),
    change_specs_path: toFileUrl(path.join(activeChangePath, "specs")),
    archive_state_path: toFileUrl(path.join(activeChangePath, ".phase-archive.json")),
    archive_path: activeChangePath,
    skill_policy: renderSkillPolicy("archive", config),
    skill_compliance_line: renderSkillComplianceLine("archive", config)
  });
}

// ── phase command ──────────────────────────────────────────

/**
 * Get the contract for the currently active phase.
 * Pure read-only: never mutates state, never returns blockers.
 */
export function getPhasePrompt(projectPath: string, config: Config = loadConfig()): Prompt {
  const state = loadFlowState(projectPath);
  if (!state) {
    return {
      command: "next",
      phase: "change_intake",
      prompt: "[PHASEDEV] No active change. Run: phasedev create-change <name>.",
      blocked: true,
      reason: "No active change"
    };
  }

  const activePhase = state.activePhase as ActivePhase;
  const activeIteration: number | null = state.activeIteration ?? null;

  const activeChangeDir = findActiveChangeDir(projectPath);
  const pendingArchive = findPendingArchiveState(projectPath);
  const changeDir = activeChangeDir ?? pendingArchive?.archivePath ?? null;

  if (!changeDir) {
    return {
      command: "next",
      phase: activePhase as any,
      prompt: `[PHASEDEV] Cannot resolve change directory for phase ${activePhase}.`,
      blocked: true,
      reason: "No change directory"
    };
  }

  const paths = buildChangePaths(changeDir);

  switch (activePhase) {
    case "change_intake":
      return {
        command: "next",
        phase: activePhase,
        prompt: renderChangeIntake(projectPath, config, { activePhase, activeIteration }, changeDir),
        blocked: false
      };

    case "code_research":
      return {
        command: "next",
        phase: activePhase,
        prompt: renderCodeResearch(projectPath, config, paths),
        blocked: false
      };

    case "technical_design":
      return {
        command: "next",
        phase: activePhase,
        prompt: renderTechnicalDesign(projectPath, config, paths),
        blocked: false
      };

    case "iteration_planning":
      return {
        command: "next",
        phase: activePhase,
        prompt: renderIterationPlanning(projectPath, config, paths),
        blocked: false
      };

    case "implementation":
      return {
        command: "next",
        phase: "implementation",
        prompt: renderImplementation(projectPath, config, paths, activeIteration ?? 1),
        blocked: false
      };

    case "iteration_validation":
      return {
        command: "next",
        phase: "iteration_validation",
        prompt: renderIterationValidation(projectPath, config, paths, activeIteration ?? 1),
        blocked: false
      };

    case "final_validation":
      return {
        command: "next",
        phase: activePhase,
        prompt: renderFinalValidation(projectPath, config, paths),
        blocked: false
      };

    case "finding_repair":
      return {
        command: "next",
        phase: activePhase,
        prompt: renderFindingRepair(projectPath, config, paths),
        blocked: false
      };

    case "archive":
      return {
        command: "next",
        phase: "archive",
        prompt: renderArchiveContract(projectPath, config, changeDir),
        blocked: false
      };
  }
}

// ── Repair Queue formatting ─────────────────────────────────

interface ValidationFindingState {
  id: string;
  severity: string;
  className: string;
  phase: string;
  canonicalFinding: string;
  requiredFix: string;
  blocksPr: boolean;
  latestStatus: string;
}

function isQueuedRepairFinding(finding: ValidationFindingState): boolean {
  return finding.blocksPr && ["open", "reopened"].includes(finding.latestStatus);
}

function escapeMarkdownTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

function formatRepairQueue(findingsPath: string): string {
  if (!fs.existsSync(findingsPath)) {
    return [
      "## Current Repair Queue",
      "",
      "No findings file found.",
      "",
      "Full findings registry: unavailable."
    ].join("\n");
  }

  const queue = parseCurrentValidationFindings(findingsPath).filter(isQueuedRepairFinding);
  const registryLink = `Full findings registry: [validation_findings.md](${toFileUrl(findingsPath)})`;

  if (queue.length === 0) {
    return [
      "## Current Repair Queue",
      "",
      "No current blocking findings were parsed from the findings registry.",
      "Open the full findings registry only to resolve this ambiguity: either fix malformed finding rows or confirm that all blocking findings are resolved before setting `verdict: repaired`.",
      "",
      registryLink
    ].join("\n");
  }

  return [
    "## Current Repair Queue",
    "",
    "| ID | Severity | Class | Iteration | Finding | Required Fix |",
    "|---|---|---|---|---|---|",
    ...queue.map(finding => [
      finding.id,
      finding.severity,
      finding.className,
      finding.phase,
      finding.canonicalFinding,
      finding.requiredFix
    ].map(escapeMarkdownTableCell).join(" | ")).map(row => `| ${row} |`),
    "",
    registryLink
  ].join("\n");
}
