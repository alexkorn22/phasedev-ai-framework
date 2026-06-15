import * as fs from "fs";
import * as path from "path";
import { Config, loadConfig } from "../../entities/config/config";
import { buildChangePaths, SYSTEM_DIR } from "../../entities/change/paths";
import { Prompt, Stage } from "../../entities/stage/types";
import { parseTestCommands } from "../../entities/test-commands/parse-test-commands";
import { shellQuote } from "../../shared/shell/shell-quote";
import { renderTemplate, resolveTemplatePath } from "../../shared/templates/render-template";
import { renderArtifactContract } from "./artifact-contract";
import { archivePrompt, startArchiveStage } from "./archive-stage";
import { renderChangedFileInventory } from "./changed-file-inventory";
import { archiveReadinessBlocker, approvalBlocker, invalidPlanBlocker, invalidPrdBlocker, prompt, validationFindingsBlocker, invalidResearchBlocker, invalidDesignBlocker, invalidRulesBlocker } from "./prompt-blockers";
import { toFileUrl } from "./prompt-formatters";
import { handlePhase, repairPrompt, Urls } from "./phase-routing";
import { renderSkillPolicy } from "./skill-policy";
import { resolveRoute } from "./flow-route";

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

function flowCheckCommand(projectPath: string, expectedRoute?: string): string {
  const baseCommand = `phasedev check --project-path ${shellQuote(projectPath)}`;
  return expectedRoute ? `${baseCommand} --expect-route ${expectedRoute}` : baseCommand;
}

function renderStageTemplate(stage: Exclude<Stage, "init">, templateName: string, variables: Record<string, string>, config: Config): string {
  return renderTemplate(templateName, {
    ...variables,
    prd_template_path: toFileUrl(resolveTemplatePath("artifacts/prd")),
    research_template_path: toFileUrl(resolveTemplatePath("artifacts/research_facts")),
    design_template_path: toFileUrl(resolveTemplatePath("artifacts/design")),
    implementation_plan_template_path: toFileUrl(resolveTemplatePath("artifacts/implementation_plan")),
    rules_template_path: toFileUrl(resolveTemplatePath("artifacts/rules")),
    validation_findings_template_path: toFileUrl(resolveTemplatePath("artifacts/validation_findings")),
    validation_common_contract: renderTemplate("validation_common", {}),
    skill_policy: renderSkillPolicy(stage, config)
  });
}

function artifactContract(artifactId: string, resolvedOutputPath: string, templateName: string, selfCheckCommand: string, date = new Date().toISOString().split("T")[0], selfCheckFailureGuidance?: string): string {
  return renderArtifactContract({
    artifactId,
    resolvedOutputPath,
    templateName,
    selfCheckCommand,
    selfCheckFailureGuidance,
    date
  });
}

function flowFinalValidationCheckCommand(projectPath: string): string {
  return `phasedev check-validation --project-path ${shellQuote(projectPath)} --scope final`;
}

function finalValidationArtifactContract(findingsPath: string, projectPath: string): string {
  return renderArtifactContract({
    artifactId: "validation_findings.md",
    resolvedOutputPath: findingsPath,
    templateName: "artifacts/validation_findings",
    selfCheckCommand: flowFinalValidationCheckCommand(projectPath),
    selfCheckFailureGuidance: "Stage is not complete until this command passes. If it fails, fix only `validation_findings.md`, then rerun the same command.",
    date: new Date().toISOString().split("T")[0]
  });
}

export function getNextPrompt(projectPath: string, config: Config = loadConfig()): Prompt {
  const route = resolveRoute(projectPath);

  switch (route.kind) {
    case "invalid_archive_state":
      return archiveReadinessBlocker(
        "Invalid archive state.",
        route.invalidArchiveState.statePath,
        route.invalidArchiveState.reason
      );
    case "pending_archive":
      return archivePrompt(projectPath, route.archiveState, config);
    case "setup": {
      let taskContext = "";
      const taskFile = process.env.FLOW_TASK_FILE;
      const date = new Date().toISOString().split("T")[0];
      const changeRoot = route.activeChangePath ?? path.join(projectPath, SYSTEM_DIR, "changes", "<derive-slug-from-final-task>");
      const selfCheckCommand = flowCheckCommand(projectPath, "setup_approval");
      if (taskFile && fs.existsSync(taskFile)) {
        const content = fs.readFileSync(taskFile, "utf-8");
        taskContext = `\n\n=== CURRENT TASK DESCRIPTION ===\n${content}\n================================`;
      }
      const setupSelfCheckGuidance = "Stage 0 is not complete until this command passes after both `prd.md` and `rules.md` exist. Do not run this check after only one setup artifact exists. If it fails, fix only setup artifact issues, then rerun the same command.";
      const basePrompt = renderStageTemplate("setup", "step0_setup", {
        date,
        project_path: projectPath,
        prd_artifact_contract: artifactContract("prd.md", path.join(changeRoot, "prd.md"), "artifacts/prd", selfCheckCommand, date, setupSelfCheckGuidance),
        rules_artifact_contract: artifactContract("rules.md", path.join(changeRoot, "rules.md"), "artifacts/rules", selfCheckCommand, date, setupSelfCheckGuidance),
        self_check_command: selfCheckCommand
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
        project_specs_path: toFileUrl(path.join(projectPath, SYSTEM_DIR, "specs")),
        research_path: urls.research_path,
        research_artifact_contract: artifactContract("research_facts.md", route.paths.researchPath, "artifacts/research_facts", flowCheckCommand(projectPath, "design")),
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
        design_artifact_contract: artifactContract("architecture/design.md", route.paths.designPath, "artifacts/design", flowCheckCommand(projectPath, "design_approval")),
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
        implementation_plan_artifact_contract: artifactContract("implementation_plan.md", route.paths.planPath, "artifacts/implementation_plan", flowCheckCommand(projectPath, "plan_approval")),
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
      return repairPrompt(urlsFor(route.paths), route.paths.findingsPath, config, projectPath);
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
      return handlePhase(route.paths.planPath, route.activePhase, urls, testCommands, route.paths.rulesPath, config, projectPath);
    }
    case "final_validation": {
      const urls = urlsFor(route.paths);
      return prompt("next", "final_validation", renderStageTemplate("final_validation", "step5b_val", {
        prd_path: urls.prd_path,
        rules_path: urls.rules_path,
        design_path: urls.design_path,
        plan_path: urls.plan_path,
        findings_path: urls.findings_path,
        date: new Date().toISOString().split("T")[0],
        controller_changed_files_inventory: renderChangedFileInventory(projectPath),
        validation_findings_artifact_contract: finalValidationArtifactContract(route.paths.findingsPath, projectPath)
      }, config));
    }
  }
}
