import * as fs from "fs";
import * as path from "path";
import { FlowRalphConfig, loadFlowRalphConfig } from "../../entities/flow-config/config";
import { buildChangePaths } from "../../entities/flow-change/paths";
import { FlowPrompt, FlowStage } from "../../entities/flow-stage/types";
import { parseTestCommands } from "../../entities/test-commands/parse-test-commands";
import { shellQuote } from "../../shared/shell/shell-quote";
import { renderTemplate, resolveTemplatePath } from "../../shared/templates/render-template";
import { archivePrompt, startArchiveStage } from "./archive-stage";
import { archiveReadinessBlocker, approvalBlocker, invalidPlanBlocker, invalidPrdBlocker, prompt, validationFindingsBlocker, invalidResearchBlocker, invalidDesignBlocker, invalidRulesBlocker } from "./prompt-blockers";
import { toFileUrl } from "./prompt-formatters";
import { handlePhase, repairPrompt, Urls } from "./phase-routing";
import { renderSkillPolicy } from "./skill-policy";
import { resolveFlowRoute } from "./flow-route";

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

function flowCheckCommand(projectPath: string, expectedRoute: string): string {
  const cliPath = path.resolve(__dirname, "..", "..", "flow-cli.ts");
  return `bun run ${shellQuote(cliPath)} check --project-path ${shellQuote(projectPath)} --expect-route ${expectedRoute}`;
}

function renderStageTemplate(stage: Exclude<FlowStage, "init">, templateName: string, variables: Record<string, string>, config: FlowRalphConfig): string {
  return renderTemplate(templateName, {
    ...variables,
    prd_template_path: toFileUrl(resolveTemplatePath("artifacts/prd")),
    research_template_path: toFileUrl(resolveTemplatePath("artifacts/research_facts")),
    design_template_path: toFileUrl(resolveTemplatePath("artifacts/design")),
    implementation_plan_template_path: toFileUrl(resolveTemplatePath("artifacts/implementation_plan")),
    rules_template_path: toFileUrl(resolveTemplatePath("artifacts/rules")),
    validation_findings_template_path: toFileUrl(resolveTemplatePath("artifacts/validation_findings")),
    skill_policy: renderSkillPolicy(stage, config)
  });
}

export function getNextPrompt(projectPath: string, config: FlowRalphConfig = loadFlowRalphConfig()): FlowPrompt {
  const route = resolveFlowRoute(projectPath);

  switch (route.kind) {
    case "pending_archive":
      return archivePrompt(projectPath, route.archiveState, config);
    case "setup": {
      let taskContext = "";
      const taskFile = process.env.FLOW_TASK_FILE;
      if (taskFile && fs.existsSync(taskFile)) {
        const content = fs.readFileSync(taskFile, "utf-8");
        taskContext = `\n\n=== CURRENT TASK DESCRIPTION ===\n${content}\n================================`;
      }
      const basePrompt = renderStageTemplate("setup", "step0_setup", {
        date: new Date().toISOString().split("T")[0],
        self_check_command: flowCheckCommand(projectPath, "setup_approval")
      }, config);
      return prompt("next", "setup", basePrompt + taskContext);
    }
    case "invalid_prd":
      return invalidPrdBlocker(route.paths.prdPath, route.issues);
    case "invalid_rules":
      return invalidRulesBlocker(route.paths.rulesPath, route.issues);
    case "setup_approval":
      return approvalBlocker("setup", "Setup incomplete", route.paths.prdPath, "prd.md & rules.md");
    case "research": {
      const urls = urlsFor(route.paths);
      return prompt("next", "research", renderStageTemplate("research", "step1_research", {
        prd_path: urls.prd_path,
        rules_path: urls.rules_path,
        research_path: urls.research_path,
        self_check_command: flowCheckCommand(projectPath, "design")
      }, config));
    }
    case "invalid_research":
      return invalidResearchBlocker(route.paths.researchPath, route.issues);
    case "design": {
      const urls = urlsFor(route.paths);
      return prompt("next", "design", renderStageTemplate("design", "step2_design", {
        prd_path: urls.prd_path,
        rules_path: urls.rules_path,
        research_path: urls.research_path,
        design_path: urls.design_path,
        date: new Date().toISOString().split("T")[0],
        self_check_command: flowCheckCommand(projectPath, "design_approval")
      }, config));
    }
    case "invalid_design":
      return invalidDesignBlocker(route.paths.designPath, route.issues);
    case "design_approval":
      return approvalBlocker("design", "Design requires review", route.paths.designPath, "architecture/design.md");
    case "plan": {
      const urls = urlsFor(route.paths);
      return prompt("next", "plan", renderStageTemplate("plan", "step3_plan", {
        prd_path: urls.prd_path,
        design_path: urls.design_path,
        rules_path: urls.rules_path,
        plan_path: urls.plan_path,
        date: new Date().toISOString().split("T")[0],
        self_check_command: flowCheckCommand(projectPath, "plan_approval")
      }, config));
    }
    case "plan_approval":
      return approvalBlocker("plan", "Plan requires review", route.paths.planPath, "implementation_plan.md");
    case "invalid_plan":
      return invalidPlanBlocker(route.paths.planPath, route.issues);
    case "invalid_findings":
      return validationFindingsBlocker(route.paths.findingsPath, route.issues);
    case "repair":
      return repairPrompt(urlsFor(route.paths), route.paths.findingsPath, config);
    case "archive_readiness_blocked":
      return archiveReadinessBlocker(
        "All implementation phases must be marked [x] before archive.",
        route.paths.planPath,
        "Final validation is ready, but implementation_plan.md still has an incomplete phase."
      );
    case "archive_ready":
      return startArchiveStage(projectPath, route.activeChangePath, new Date(), config);
    case "phase": {
      const urls = urlsFor(route.paths);
      const testCommands = parseTestCommands(route.paths.rulesPath).commands;
      return handlePhase(route.paths.planPath, route.activePhase, urls, testCommands, route.paths.rulesPath, config);
    }
    case "final_validation": {
      const urls = urlsFor(route.paths);
      return prompt("next", "final_validation", renderStageTemplate("final_validation", "step5b_val", {
        prd_path: urls.prd_path,
        rules_path: urls.rules_path,
        design_path: urls.design_path,
        plan_path: urls.plan_path,
        findings_path: urls.findings_path,
        date: new Date().toISOString().split("T")[0]
      }, config));
    }
  }
}
