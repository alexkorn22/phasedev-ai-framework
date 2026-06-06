import * as fs from "fs";
import { FlowRalphConfig } from "../../entities/flow-config/config";
import { Phase } from "../../entities/implementation-plan/types";
import { updatePhaseStatus } from "../../entities/implementation-plan/update-phase-status";
import { parseTestCommands, TestCommands } from "../../entities/test-commands/parse-test-commands";
import { FlowPrompt, FlowStage } from "../../entities/flow-stage/types";
import { parseCurrentValidationFindings, ValidationFindingState } from "../../entities/validation-findings/parse-validation-findings";
import { renderTemplate, resolveTemplatePath } from "../../shared/templates/render-template";
import { prompt, testCommandBlocker } from "./prompt-blockers";
import { formatAdditionalChecks, formatPhaseExcerpt, formatTaskList, toFileUrl } from "./prompt-formatters";
import { renderSkillPolicy } from "./skill-policy";

export interface Urls {
  prd_path: string;
  rules_path: string;
  research_path: string;
  design_path: string;
  plan_path: string;
  findings_path: string;
}

function getRequiredTestCommand(stage: FlowStage, testCommands: TestCommands, key: keyof TestCommands, rulesPath: string): string | FlowPrompt {
  const command = testCommands[key];
  return command ?? testCommandBlocker(stage, rulesPath, [key]);
}

function renderStageTemplate(stage: Exclude<FlowStage, "init">, templateName: string, variables: Record<string, string>, config: FlowRalphConfig): string {
  return renderTemplate(templateName, {
    ...variables,
    prd_template_path: toFileUrl(resolveTemplatePath("artifacts/prd")),
    implementation_plan_template_path: toFileUrl(resolveTemplatePath("artifacts/implementation_plan")),
    validation_findings_template_path: toFileUrl(resolveTemplatePath("artifacts/validation_findings")),
    skill_policy: renderSkillPolicy(stage, config)
  });
}

export function handlePhase(planPath: string, activePhase: Phase, urls: Urls, testCommands: TestCommands, rulesPath: string, config: FlowRalphConfig): FlowPrompt {
  if (activePhase.status === "not_started") {
    updatePhaseStatus(planPath, activePhase.id, "in_progress");
    activePhase.status = "in_progress";
  }

  const allTasksCompleted = activePhase.tasks.length > 0 && activePhase.tasks.every(task => task.status === "completed");
  if (allTasksCompleted) {
    return prompt("next", "phase_validation", renderStageTemplate("phase_validation", "step5a_val", {
      phase_id: `Phase ${activePhase.id}: ${activePhase.name}`,
      prd_path: urls.prd_path,
      rules_path: urls.rules_path,
      design_path: urls.design_path,
      plan_path: urls.plan_path,
      findings_path: urls.findings_path,
      date: new Date().toISOString().split("T")[0]
    }, config));
  }

  const parsed = parseTestCommands(rulesPath);
  if (parsed.missing.length > 0) {
    return testCommandBlocker("implementation", rulesPath, parsed.missing);
  }

  const testCommand = getRequiredTestCommand("implementation", testCommands, "unit", rulesPath);
  if (typeof testCommand !== "string") return testCommand;

  return prompt("next", "implementation", renderStageTemplate("implementation", "step4_impl", {
    phase_id: `Phase ${activePhase.id}: ${activePhase.name}`,
    phase_tasks: formatTaskList(activePhase),
    phase_excerpt: formatPhaseExcerpt(activePhase),
    test_command: testCommand,
    phase_checks: formatAdditionalChecks(activePhase),
    prd_path: urls.prd_path,
    rules_path: urls.rules_path,
    design_path: urls.design_path,
    plan_path: urls.plan_path
  }, config));
}

function escapeMarkdownTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

function isQueuedRepairFinding(finding: ValidationFindingState): boolean {
  return finding.blocksPr && ["open", "reopened"].includes(finding.latestStatus);
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
    "| ID | Severity | Class | Phase | Finding | Required Fix |",
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

export function repairPrompt(urls: Urls, findingsPath: string, config: FlowRalphConfig): FlowPrompt {
  return prompt("next", "repair", renderStageTemplate("repair", "step5r_repair", {
    repair_queue: formatRepairQueue(findingsPath),
    findings_path: urls.findings_path,
    plan_path: urls.plan_path,
    design_path: urls.design_path,
    prd_path: urls.prd_path,
    research_path: urls.research_path,
    rules_path: urls.rules_path
  }, config));
}
