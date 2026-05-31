import * as fs from "fs";
import { FlowRalphConfig, loadFlowRalphConfig } from "../../entities/flow-config/config";
import { isDesignApproved, isPlanApproved, isSetupApproved } from "../../entities/flow-change/approval";
import { findActiveChangeDir } from "../../entities/flow-change/active-change";
import { buildChangePaths } from "../../entities/flow-change/paths";
import { FlowPrompt, FlowStage } from "../../entities/flow-stage/types";
import { parsePlan } from "../../entities/implementation-plan/parse-plan";
import { validatePlanStructure } from "../../entities/implementation-plan/validate-plan";
import { parseTestCommands } from "../../entities/test-commands/parse-test-commands";
import { parseValidationVerdict, parseValidationVerdictType } from "../../entities/validation-findings/parse-validation-findings";
import { renderTemplate } from "../../shared/templates/render-template";
import { getPendingArchivePrompt, startArchiveStage } from "./archive-stage";
import { archiveReadinessBlocker, approvalBlocker, invalidPlanBlocker, prompt } from "./prompt-blockers";
import { toFileUrl } from "./prompt-formatters";
import { handlePhase, repairPrompt, Urls } from "./phase-routing";
import { renderSkillPolicy } from "./skill-policy";

function urlsFor(paths: ReturnType<typeof buildChangePaths>): Urls {
  return {
    prd_path: toFileUrl(paths.prdPath),
    rules_path: toFileUrl(paths.rulesPath),
    research_path: toFileUrl(paths.researchPath),
    design_path: toFileUrl(paths.designPath),
    plan_path: toFileUrl(paths.planPath),
    findings_path: toFileUrl(paths.findingsPath)
  };
}

function renderStageTemplate(stage: Exclude<FlowStage, "init">, templateName: string, variables: Record<string, string>, config: FlowRalphConfig): string {
  return renderTemplate(templateName, {
    ...variables,
    skill_policy: renderSkillPolicy(stage, config)
  });
}

function handleResearchAndDesign(changeDir: string, urls: Urls, designPath: string, researchPath: string, config: FlowRalphConfig): FlowPrompt | null {
  if (!fs.existsSync(researchPath)) {
    return prompt("next", "research", renderStageTemplate("research", "step1_research", { prd_path: urls.prd_path, rules_path: urls.rules_path, research_path: urls.research_path }, config));
  }

  if (!fs.existsSync(designPath)) {
    return prompt("next", "design", renderStageTemplate("design", "step2_design", { prd_path: urls.prd_path, rules_path: urls.rules_path, research_path: urls.research_path, design_path: urls.design_path, date: new Date().toISOString().split("T")[0] }, config));
  }

  if (!isDesignApproved(changeDir)) {
    return approvalBlocker("design", "Design requires review", designPath, "architecture/design.md");
  }

  return null;
}

function handlePlanAndExecution(projectPath: string, changeDir: string, urls: Urls, planPath: string, findingsPath: string, rulesPath: string, config: FlowRalphConfig): FlowPrompt {
  if (!fs.existsSync(planPath)) {
    return prompt("next", "plan", renderStageTemplate("plan", "step3_plan", { design_path: urls.design_path, rules_path: urls.rules_path, plan_path: urls.plan_path, date: new Date().toISOString().split("T")[0] }, config));
  }

  if (!isPlanApproved(changeDir)) {
    return approvalBlocker("plan", "Plan requires review", planPath, "implementation_plan.md");
  }

  const verdict = parseValidationVerdict(findingsPath);
  const verdictType = parseValidationVerdictType(findingsPath);

  if (fs.existsSync(findingsPath) && (verdict === "repair_required" || verdict === "unknown")) {
    return repairPrompt(urls, findingsPath, config);
  }

  const planPhases = parsePlan(planPath);
  const planIssues = validatePlanStructure(planPhases);
  if (planIssues.length > 0) {
    return invalidPlanBlocker(planPath, planIssues);
  }

  const isFinalValReady = fs.existsSync(findingsPath) &&
                          verdictType === "final" &&
                          (verdict === "ready" || verdict === "ready_with_risks");
  if (isFinalValReady) {
    const allPhasesCompleted = planPhases.length > 0 && planPhases.every(phase => phase.status === "completed");
    if (!allPhasesCompleted) {
      return archiveReadinessBlocker(
        "All implementation phases must be marked [x] before archive.",
        planPath,
        "Final validation is ready, but implementation_plan.md still has an incomplete phase."
      );
    }

    return startArchiveStage(projectPath, changeDir, new Date(), config);
  }

  const testCommands = parseTestCommands(rulesPath).commands;
  const activePhase = planPhases.find(phase => phase.status === "in_progress" || phase.status === "not_started");
  if (activePhase) {
    return handlePhase(planPath, activePhase, planPhases.length, urls, testCommands, rulesPath, config);
  }

  return prompt("next", "final_validation", renderStageTemplate("final_validation", "step5b_val", {
    prd_path: urls.prd_path,
    rules_path: urls.rules_path,
    design_path: urls.design_path,
    plan_path: urls.plan_path,
    findings_path: urls.findings_path,
    date: new Date().toISOString().split("T")[0]
  }, config));
}

export function getNextPrompt(projectPath: string, config: FlowRalphConfig = loadFlowRalphConfig()): FlowPrompt {
  const pendingArchivePrompt = getPendingArchivePrompt(projectPath, config);
  if (pendingArchivePrompt) {
    return pendingArchivePrompt;
  }

  const changeDir = findActiveChangeDir(projectPath);
  if (!changeDir) {
    return prompt("next", "setup", renderStageTemplate("setup", "step0_setup", { date: new Date().toISOString().split("T")[0] }, config));
  }

  const paths = buildChangePaths(changeDir);
  if (!fs.existsSync(paths.prdPath) || !fs.existsSync(paths.rulesPath)) {
    return prompt("next", "setup", renderStageTemplate("setup", "step0_setup", { date: new Date().toISOString().split("T")[0] }, config));
  }

  if (!isSetupApproved(changeDir).approved) {
    return approvalBlocker("setup", "Setup incomplete", paths.prdPath, "prd.md & rules.md");
  }

  const urls = urlsFor(paths);
  const researchOrDesignPrompt = handleResearchAndDesign(changeDir, urls, paths.designPath, paths.researchPath, config);
  if (researchOrDesignPrompt) {
    return researchOrDesignPrompt;
  }

  return handlePlanAndExecution(projectPath, changeDir, urls, paths.planPath, paths.findingsPath, paths.rulesPath, config);
}
