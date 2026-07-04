import * as fs from "fs";
import * as path from "path";
import { Config, loadConfig } from "../../entities/config/config";
import { SYSTEM_DIR } from "../../entities/change/paths";
import { Prompt } from "../../entities/phase/types";
import { parseTestCommands } from "../../entities/test-commands/parse-test-commands";
import { renderArtifactContract } from "./artifact-contract";
import { archivePrompt, startArchiveStage } from "./archive-stage";
import { renderChangedFileInventory } from "./changed-file-inventory";
import { archiveReadinessBlocker, approvalBlocker, invalidPlanBlocker, invalidPrdBlocker, prompt, validationFindingsBlocker, invalidResearchBlocker, invalidDesignBlocker, invalidRulesBlocker } from "./prompt-blockers";
import { toFileUrl } from "./prompt-formatters";
import { handlePhase, repairPrompt } from "./iteration-routing";
import { resolveRoute } from "./flow-route";
import { urlsFor, flowCheckCommand, flowFinalValidationCheckCommand, renderPhaseTemplate, researchArtifactContract, finalValidationArtifactContract, implementationPlanArtifactContract } from "../../shared/prompt/phase-render-helpers";

function artifactContract(artifactId: string, resolvedOutputPath: string, templateName: string, selfCheckCommand: string, date = new Date().toISOString().split("T")[0], selfCheckFailureGuidance?: string, includeSelfCheck?: boolean): string {
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
    case "change_intake": {
      let taskContext = "";
      const taskFile = process.env.FLOW_TASK_FILE;
      const date = new Date().toISOString().split("T")[0];
      const changeRoot = route.activeChangePath ?? path.join(projectPath, SYSTEM_DIR, "changes", "<derive-slug-from-final-task>");
      const selfCheckCommand = flowCheckCommand(projectPath);
      if (taskFile && fs.existsSync(taskFile)) {
        const content = fs.readFileSync(taskFile, "utf-8");
        taskContext = `\n\n=== CURRENT TASK DESCRIPTION ===\n${content}\n================================`;
      }
      const basePrompt = renderPhaseTemplate("change_intake", "phase1_change_intake", {
        date,
        project_path: projectPath,
        prd_artifact_contract: artifactContract("prd.md", path.join(changeRoot, "prd.md"), "artifacts/prd", selfCheckCommand, date, undefined, false),
        rules_artifact_contract: artifactContract("execution_contract.md", path.join(changeRoot, "execution_contract.md"), "artifacts/execution_contract", selfCheckCommand, date, undefined, false),
        self_check_command: selfCheckCommand
      }, config);
      return prompt("next", "change_intake", basePrompt + taskContext);
    }
    case "invalid_prd":
      return invalidPrdBlocker(route.paths.prdPath, route.issues);
    case "invalid_execution_contract":
      return invalidRulesBlocker(route.paths.executionContractPath, route.issues);
    case "change_intake_approval":
      return approvalBlocker("change_intake", "Setup incomplete", route.paths.prdPath, "prd.md & execution_contract.md");
    case "code_research": {
      const urls = urlsFor(route.paths);
      return prompt("next", "code_research", renderPhaseTemplate("code_research", "phase2_code_research", {
        prd_path: urls.prd_path,
        rules_path: urls.rules_path,
        project_specs_path: toFileUrl(path.join(projectPath, SYSTEM_DIR, "specs")),
        project_path: projectPath,
        research_path: urls.research_path,
        research_artifact_contract: researchArtifactContract(route.paths.researchPath, projectPath),
        self_check_command: flowCheckCommand(projectPath)
      }, config));
    }
    case "invalid_code_research":
      return invalidResearchBlocker(route.paths.researchPath, route.issues);
    case "technical_design": {
      const urls = urlsFor(route.paths);
      return prompt("next", "technical_design", renderPhaseTemplate("technical_design", "phase3_technical_design", {
        prd_path: urls.prd_path,
        rules_path: urls.rules_path,
        research_path: urls.research_path,
        design_path: urls.design_path,
        date: new Date().toISOString().split("T")[0],
        design_artifact_contract: artifactContract("architecture/design.md", route.paths.designPath, "artifacts/design", flowCheckCommand(projectPath)),
        self_check_command: flowCheckCommand(projectPath)
      }, config));
    }
    case "invalid_technical_design":
      return invalidDesignBlocker(route.paths.designPath, route.issues);
    case "technical_design_approval":
      return approvalBlocker("technical_design", "Design requires review", route.paths.designPath, "architecture/design.md");
    case "iteration_planning": {
      const urls = urlsFor(route.paths);
      const date = new Date().toISOString().split("T")[0];
      const selfCheckCommand = flowCheckCommand(projectPath);
      return prompt("next", "iteration_planning", renderPhaseTemplate("iteration_planning", "phase4_iteration_planning", {
        prd_path: urls.prd_path,
        design_path: urls.design_path,
        rules_path: urls.rules_path,
        plan_path: urls.plan_path,
        date,
        implementation_plan_artifact_contract: implementationPlanArtifactContract(route.paths.iterationPlanPath, selfCheckCommand, date),
        self_check_command: selfCheckCommand
      }, config));
    }
    case "iteration_planning_approval":
      return approvalBlocker("iteration_planning", "Plan requires review", route.paths.iterationPlanPath, "iteration_plan.md");
    case "invalid_iteration_planning":
      return invalidPlanBlocker(route.paths.iterationPlanPath, route.issues);
    case "invalid_findings":
      return validationFindingsBlocker(route.paths.findingsPath, route.issues);
    case "finding_repair":
      return repairPrompt(urlsFor(route.paths), route.paths.findingsPath, config, projectPath);
    case "archive_readiness_blocked":
      return archiveReadinessBlocker(
        "All implementation iterations must be marked [x] before archive.",
        route.paths.iterationPlanPath,
        "Final validation is ready, but iteration_plan.md still has an incomplete phase."
      );
    case "archive_ready":
      return startArchiveStage(projectPath, route.activeChangePath, new Date(), config);
    case "iteration": {
      const urls = urlsFor(route.paths);
      const testCommands = parseTestCommands(route.paths.executionContractPath).commands;
      return handlePhase(route.paths.iterationPlanPath, route.activeIteration, urls, testCommands, route.paths.executionContractPath, config, projectPath);
    }
    case "final_validation": {
      const urls = urlsFor(route.paths);
      return prompt("next", "final_validation", renderPhaseTemplate("final_validation", "phase6b_final_validation", {
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
