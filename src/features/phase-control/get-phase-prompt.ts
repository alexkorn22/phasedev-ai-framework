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
import { resolveChangeDir } from "../../entities/change/active-change";
import { findPendingArchiveState } from "../../entities/change/archive-state";
import { archiveTemplateVariables } from "./archive-stage";
import { resolveRoute } from "./flow-route";
import { detectStateRouteConflict } from "./state-route-consistency";

import { parseCurrentValidationFindings } from "../../entities/validation-findings/parse-validation-findings";
import { BlockingSeverity } from "../../entities/validation-findings/blocking-severity";
import { escapeMarkdownTableCell } from "../../shared/markdown/table";
import { todayIsoDate } from "../../shared/time/today-iso-date";
import { urlsFor, flowCheckCommand, renderPhaseTemplate, renderRequiredCheckCommands, researchArtifactContract, finalValidationArtifactContract, renderValidationFindingsTemplate, implementationPlanArtifactContract, VALIDATION_FINDINGS_CANONICAL_FILL_RULES } from "./prompt-render-helpers";

function missingActiveIterationBlocker(phase: "implementation" | "iteration_validation", changeName?: string): Prompt {
  const advanceCommand = changeName === undefined ? "phasedev advance" : `phasedev advance --change ${shellQuote(changeName)}`;
  return {
    command: "next",
    phase,
    prompt: [
      `[PHASEDEV] BLOCKED: state.json is missing activeIteration for phase "${phase}".`,
      `Phase "${phase}" requires a numeric activeIteration to render an iteration-scoped contract.`,
      `Recovery: fix state.json to set activeIteration to the current iteration id, or run ${advanceCommand} to resync state.`
    ].join("\n"),
    blocked: true,
    reason: "Missing activeIteration in state.json"
  };
}

function artifactContractSimple(
  artifactId: string,
  resolvedOutputPath: string,
  templateName: string,
  selfCheckCommand: string,
  date = todayIsoDate(),
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


function validationFindingsContract(findingsPath: string, projectPath: string, blockingSeverity: BlockingSeverity, changeName?: string, iterationId?: number): string {
  const date = todayIsoDate();
  const changeFlag = changeName === undefined ? "" : ` --change ${shellQuote(changeName)}`;
  return renderArtifactContract({
    artifactId: "validation_findings.md",
    resolvedOutputPath: findingsPath,
    templateName: "artifacts/validation_findings",
    templateContent: renderValidationFindingsTemplate("iteration", date, blockingSeverity),
    selfCheckCommand: iterationId === undefined
      ? flowCheckCommand(projectPath, changeName)
      : `phasedev check-validation --project-path ${shellQuote(projectPath)} --scope iteration --iteration-id ${iterationId}${changeFlag}`,
    selfCheckFailureGuidance: iterationId === undefined
      ? undefined
      : "Artifact contract check must pass before reporting this phase complete. If it fails, fix only `validation_findings.md` and the current phase status in `iteration_plan.md` when allowed by the validation verdict, then rerun the same command.",
    canonicalFillRules: VALIDATION_FINDINGS_CANONICAL_FILL_RULES,
    date
  });
}

// ── Render Functions ───────────────────────────────────────

export function renderChangeIntake(projectPath: string, config: Config, activeChangePath: string | null, changeName?: string): string {
  const date = todayIsoDate();
  const changeRoot = activeChangePath ?? path.join(projectPath, SYSTEM_DIR, "changes", "<derive-slug-from-final-task>");
  const selfCheckCommand = flowCheckCommand(projectPath, changeName);

  let taskContext = "";
  if (activeChangePath) {
    const taskFilePath = path.join(activeChangePath, "intake_task.md");
    if (fs.existsSync(taskFilePath)) {
      taskContext = `\n\n=== CURRENT TASK DESCRIPTION ===\n${fs.readFileSync(taskFilePath, "utf-8")}\n================================`;
    }
  }

  return renderPhaseTemplate("change_intake", "phase1_change_intake", {
    date,
    project_path: projectPath,
    prd_artifact_contract: artifactContractSimple("prd.md", path.join(changeRoot, "prd.md"), "artifacts/prd", selfCheckCommand, date, undefined, false),
    rules_artifact_contract: artifactContractSimple("execution_contract.md", path.join(changeRoot, "execution_contract.md"), "artifacts/execution_contract", selfCheckCommand, date, undefined, false),
    self_check_command: selfCheckCommand
  }, config) + taskContext;
}

export function renderCodeResearch(projectPath: string, config: Config, paths: ReturnType<typeof buildChangePaths>, changeName?: string): string {
  const urls = urlsFor(paths);
  return renderPhaseTemplate("code_research", "phase2_code_research", {
    prd_path: urls.prd_path,
    rules_path: urls.rules_path,
    project_specs_path: toFileUrl(path.join(projectPath, SYSTEM_DIR, "specs")),
    project_path: projectPath,
    research_path: urls.research_path,
    research_artifact_contract: researchArtifactContract(paths.researchPath, projectPath, changeName),
    self_check_command: flowCheckCommand(projectPath, changeName)
  }, config);
}

export function renderTechnicalDesign(projectPath: string, config: Config, paths: ReturnType<typeof buildChangePaths>, changeName?: string): string {
  const urls = urlsFor(paths);
  return renderPhaseTemplate("technical_design", "phase3_technical_design", {
    prd_path: urls.prd_path,
    rules_path: urls.rules_path,
    research_path: urls.research_path,
    design_path: urls.design_path,
    date: todayIsoDate(),
    design_artifact_contract: artifactContractSimple("architecture/design.md", paths.designPath, "artifacts/design", flowCheckCommand(projectPath, changeName)),
    self_check_command: flowCheckCommand(projectPath, changeName)
  }, config);
}

export function renderIterationPlanning(projectPath: string, config: Config, paths: ReturnType<typeof buildChangePaths>, changeName?: string): string {
  const urls = urlsFor(paths);
  const date = todayIsoDate();
  const selfCheckCommand = flowCheckCommand(projectPath, changeName);
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

export function renderImplementation(projectPath: string, config: Config, paths: ReturnType<typeof buildChangePaths>, activeIterationId: number, changeName?: string): string | Prompt {
  const plan = parsePlan(paths.iterationPlanPath);
  const currentPhase = plan.find(p => p.id === activeIterationId) ?? null;
  const urls = urlsFor(paths);
  const testCommands = parseTestCommands(paths.executionContractPath).commands;

  if (!currentPhase) {
    return {
      command: "next",
      phase: "implementation",
      prompt: `[PHASEDEV] Iteration ${activeIterationId} not found in iteration plan. Check state.json and iteration_plan.md.`,
      blocked: true,
      reason: "Iteration not found in plan"
    };
  }

  // The iteration's required check commands come from execution_contract.md.
  // When a required command is missing there, this returns a testCommandBlocker
  // Prompt instead of a rendered contract.
  const testCommand = renderRequiredCheckCommands(currentPhase, testCommands, paths.executionContractPath);
  if (typeof testCommand !== "string") {
    return testCommand;
  }

  return renderPhaseTemplate("implementation", "phase5_implementation", {
    phase_id: `Iteration ${currentPhase.id}: ${currentPhase.name}`,
    plan_map: formatPlanMap(plan, currentPhase.id),
    phase_excerpt: formatPhaseExcerpt(currentPhase),
    test_command: testCommand,
    self_check_command: flowCheckCommand(projectPath, changeName),
    prd_path: urls.prd_path,
    rules_path: urls.rules_path,
    design_path: urls.design_path,
    plan_path: urls.plan_path
  }, config);
}

export function renderIterationValidation(projectPath: string, config: Config, paths: ReturnType<typeof buildChangePaths>, activeIterationId: number, changeName?: string): string | Prompt {
  const plan = parsePlan(paths.iterationPlanPath);
  const currentPhase = plan.find(p => p.id === activeIterationId) ?? null;
  const urls = urlsFor(paths);

  if (!currentPhase) {
    return {
      command: "next",
      phase: "iteration_validation",
      prompt: `[PHASEDEV] Iteration ${activeIterationId} not found in iteration plan. Check state.json and iteration_plan.md.`,
      blocked: true,
      reason: "Iteration not found in plan"
    };
  }

  const phaseLabel = `Iteration ${currentPhase.id}: ${currentPhase.name}`;

  return renderPhaseTemplate("iteration_validation", "phase6a_iteration_validation", {
    phase_id: phaseLabel,
    prd_path: urls.prd_path,
    rules_path: urls.rules_path,
    design_path: urls.design_path,
    plan_path: urls.plan_path,
    findings_path: urls.findings_path,
    date: todayIsoDate(),
    controller_changed_files_inventory: renderChangedFileInventory(projectPath, { phase: currentPhase }),
    validation_findings_artifact_contract: validationFindingsContract(paths.findingsPath, projectPath, config.blockingSeverity, changeName, currentPhase.id)
  }, config);
}

export function renderFinalValidation(projectPath: string, config: Config, paths: ReturnType<typeof buildChangePaths>, changeName?: string): string {
  const urls = urlsFor(paths);
  return renderPhaseTemplate("final_validation", "phase6b_final_validation", {
    prd_path: urls.prd_path,
    rules_path: urls.rules_path,
    design_path: urls.design_path,
    plan_path: urls.plan_path,
    findings_path: urls.findings_path,
    date: todayIsoDate(),
    controller_changed_files_inventory: renderChangedFileInventory(projectPath),
    validation_findings_artifact_contract: finalValidationArtifactContract(paths.findingsPath, projectPath, config.blockingSeverity, changeName)
  }, config);
}

export function renderFindingRepair(projectPath: string, config: Config, paths: ReturnType<typeof buildChangePaths>, changeName?: string): string {
  const urls = urlsFor(paths);
  return renderPhaseTemplate("finding_repair", "phase6r_finding_repair", {
    repair_queue: formatRepairQueue(paths.findingsPath, config.blockingSeverity),
    findings_path: urls.findings_path,
    plan_path: urls.plan_path,
    design_path: urls.design_path,
    prd_path: urls.prd_path,
    research_path: urls.research_path,
    rules_path: urls.rules_path,
    validation_findings_artifact_contract: validationFindingsContract(paths.findingsPath, projectPath, config.blockingSeverity, changeName)
  }, config);
}

export function renderArchiveContract(projectPath: string, config: Config, activeChangePath: string): string {
  const changeName = path.basename(activeChangePath);
  return renderTemplate("phase7_archive", archiveTemplateVariables(projectPath, changeName, activeChangePath, config));
}

// ── phase command ──────────────────────────────────────────

/**
 * Get the contract for the currently active phase.
 * Pure read-only: never mutates state. The only blocker it can return is the
 * missing-test-command blocker for implementation, because that contract
 * cannot be rendered without the commands from execution_contract.md.
 */
export function getPhasePrompt(projectPath: string, config: Config = loadConfig(), changeName?: string): Prompt {
  const state = loadFlowState(projectPath, changeName);
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

  const activeChangeDir = resolveChangeDir(projectPath, changeName);
  const pendingArchive = findPendingArchiveState(projectPath, changeName);
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

  const conflict = detectStateRouteConflict(state, resolveRoute(projectPath, changeName, config.blockingSeverity));
  if (conflict) {
    return {
      command: "next",
      phase: activePhase,
      prompt: conflict,
      blocked: true,
      reason: "State and route disagree on the current phase"
    };
  }

  const paths = buildChangePaths(changeDir);

  switch (activePhase) {
    case "change_intake":
      return {
        command: "next",
        phase: activePhase,
        prompt: renderChangeIntake(projectPath, config, changeDir, changeName),
        blocked: false
      };

    case "code_research":
      return {
        command: "next",
        phase: activePhase,
        prompt: renderCodeResearch(projectPath, config, paths, changeName),
        blocked: false
      };

    case "technical_design":
      return {
        command: "next",
        phase: activePhase,
        prompt: renderTechnicalDesign(projectPath, config, paths, changeName),
        blocked: false
      };

    case "iteration_planning":
      return {
        command: "next",
        phase: activePhase,
        prompt: renderIterationPlanning(projectPath, config, paths, changeName),
        blocked: false
      };

    case "implementation": {
      if (activeIteration === null) {
        return missingActiveIterationBlocker("implementation", changeName);
      }
      const rendered = renderImplementation(projectPath, config, paths, activeIteration, changeName);
      if (typeof rendered !== "string") {
        return rendered;
      }
      return {
        command: "next",
        phase: "implementation",
        prompt: rendered,
        blocked: false
      };
    }

    case "iteration_validation": {
      if (activeIteration === null) {
        return missingActiveIterationBlocker("iteration_validation", changeName);
      }
      const rendered = renderIterationValidation(projectPath, config, paths, activeIteration, changeName);
      if (typeof rendered !== "string") {
        return rendered;
      }
      return {
        command: "next",
        phase: "iteration_validation",
        prompt: rendered,
        blocked: false
      };
    }

    case "final_validation":
      return {
        command: "next",
        phase: activePhase,
        prompt: renderFinalValidation(projectPath, config, paths, changeName),
        blocked: false
      };

    case "finding_repair":
      return {
        command: "next",
        phase: activePhase,
        prompt: renderFindingRepair(projectPath, config, paths, changeName),
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

function formatRepairQueue(findingsPath: string, blockingSeverity: BlockingSeverity): string {
  if (!fs.existsSync(findingsPath)) {
    return [
      "## Current Repair Queue",
      "",
      "No findings file found.",
      "",
      "Full findings registry: unavailable."
    ].join("\n");
  }

  const queue = parseCurrentValidationFindings(findingsPath, blockingSeverity).filter(isQueuedRepairFinding);
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
