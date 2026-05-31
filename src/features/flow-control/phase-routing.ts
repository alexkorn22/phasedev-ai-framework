import * as fs from "fs";
import { FlowRalphConfig } from "../../entities/flow-config/config";
import { Phase } from "../../entities/implementation-plan/types";
import { updatePhaseStatus } from "../../entities/implementation-plan/update-phase-status";
import { TestCommands } from "../../entities/test-commands/parse-test-commands";
import { FlowPrompt, FlowStage } from "../../entities/flow-stage/types";
import { renderTemplate } from "../../shared/templates/render-template";
import { prompt, testCommandBlocker } from "./prompt-blockers";
import { formatAdditionalChecks, formatTaskList } from "./prompt-formatters";
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
    skill_policy: renderSkillPolicy(stage, config)
  });
}

export function handlePhase(planPath: string, activePhase: Phase, totalPhases: number, urls: Urls, testCommands: TestCommands, rulesPath: string, config: FlowRalphConfig): FlowPrompt {
  if (activePhase.status === "not_started") {
    updatePhaseStatus(planPath, activePhase.id, "in_progress");
    activePhase.status = "in_progress";
  }

  const allTasksCompleted = activePhase.tasks.length > 0 && activePhase.tasks.every(task => task.status === "completed");
  if (allTasksCompleted) {
    if (totalPhases === 1) {
      return prompt("next", "final_validation", renderStageTemplate("final_validation", "step5b_val", {
        prd_path: urls.prd_path,
        rules_path: urls.rules_path,
        design_path: urls.design_path,
        plan_path: urls.plan_path,
        findings_path: urls.findings_path,
        date: new Date().toISOString().split("T")[0]
      }, config));
    }

    return prompt("next", "phase_validation", renderStageTemplate("phase_validation", "step5a_val", {
      phase_id: `Phase ${activePhase.id}: ${activePhase.name}`,
      rules_path: urls.rules_path,
      design_path: urls.design_path,
      plan_path: urls.plan_path,
      findings_path: urls.findings_path,
      date: new Date().toISOString().split("T")[0]
    }, config));
  }

  const testCommand = getRequiredTestCommand("implementation", testCommands, "unit", rulesPath);
  if (typeof testCommand !== "string") return testCommand;

  return prompt("next", "implementation", renderStageTemplate("implementation", "step4_impl", {
    phase_id: `Phase ${activePhase.id}: ${activePhase.name}`,
    phase_tasks: formatTaskList(activePhase),
    test_command: testCommand,
    phase_checks: formatAdditionalChecks(activePhase),
    rules_path: urls.rules_path,
    design_path: urls.design_path,
    plan_path: urls.plan_path
  }, config));
}

export function repairPrompt(urls: Urls, findingsPath: string, config: FlowRalphConfig): FlowPrompt {
  return prompt("next", "repair", renderStageTemplate("repair", "step5r_repair", {
    open_findings: fs.existsSync(findingsPath) ? fs.readFileSync(findingsPath, "utf-8") : "No findings file found.",
    findings_path: urls.findings_path,
    plan_path: urls.plan_path,
    design_path: urls.design_path,
    prd_path: urls.prd_path,
    research_path: urls.research_path,
    rules_path: urls.rules_path
  }, config));
}
