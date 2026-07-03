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
import { handlePhase, repairPrompt, Urls } from "./iteration-routing";
import { renderSkillPolicy } from "./skill-policy";
import { renderValidationCommonContract } from "./validation-common-contract";
import { resolveRoute } from "./flow-route";

function urlsFor(paths: ReturnType<typeof buildChangePaths>): Urls {
  return {
    prd_path: toFileUrl(paths.prdPath),
    rules_path: toFileUrl(paths.executionContractPath),
    research_path: toFileUrl(paths.researchPath),
    design_path: toFileUrl(paths.designPath),
    plan_path: toFileUrl(paths.iterationPlanPath),
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
    rules_template_path: toFileUrl(resolveTemplatePath("artifacts/execution_contract")),
    validation_findings_template_path: toFileUrl(resolveTemplatePath("artifacts/validation_findings")),
    validation_common_contract: renderValidationCommonContract(stage),
    skill_policy: renderSkillPolicy(stage, config)
  });
}

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

const IMPLEMENTATION_PLAN_CANONICAL_FILL_RULES = [
  "- `iteration_plan.md` is a human approval artifact and a downstream machine contract; keep prose concise and put review decisions inside existing template fields only.",
  "- Keep `approved: false`; only the user can approve the plan.",
  "- Keep exactly the non-iteration `##` sections from the template, then sequential `## Iteration N: Name [ ]` headings. Planning initializes every iteration status as `[ ]`.",
  "- Fill `Approval Summary` as the compact review surface: scope, out-of-scope work, sequencing risk, and validation.",
  "- Fill `Generation Bundle`, `Overview`, each iteration `Goal`, `Expected Change Surface`, `Tasks`, `Checks`, and `Check Evidence` from approved PRD/design/execution_contract only.",
  "- Every `R#`, every `SC#`, each `SC#` Evidence type, every risk boundary, and every relevant approved `D#` must appear in concrete iteration, task, check, evidence, or change-surface trace content.",
  "- Do not use vague trace labels such as `all requirements`; reference concrete `R#`, `SC#`, and relevant `D#` IDs.",
  "- Use concise tables, grouped lists, and short paragraphs inside existing template sections when they improve review speed; do not add review-only sections or decorative content.",
  "- Do not use emoji in `iteration_plan.md`; keep machine-sensitive approval artifacts plain text."
];

function implementationPlanArtifactContract(planPath: string, selfCheckCommand: string, date: string): string {
  return renderArtifactContract({
    artifactId: "iteration_plan.md",
    resolvedOutputPath: planPath,
    templateName: "artifacts/iteration_plan",
    selfCheckCommand,
    includeSelfCheck: false,
    canonicalFillRules: IMPLEMENTATION_PLAN_CANONICAL_FILL_RULES,
    date
  });
}

const RESEARCH_TEMPLATE_SAMPLE_VALUES = [
  "Requested target from PRD.",
  "Requested risk boundary from PRD.",
  "Current implementation partially supports the requested target; F1 records what exists and what does not yet fully support the target.",
  "Current tests or configuration partially cover this boundary; F2 records current enforcement gaps without claiming target completion.",
  "src/file.ts:42",
  "test/file.test.ts:12",
  ".phasedev/specs/foo/spec.md:12",
  "Current implementation does X.",
  "Tests verify behavior X.",
  "Existing spec describes capability Y."
];

function researchArtifactContract(researchPath: string, projectPath: string): string {
  return renderArtifactContract({
    artifactId: "research_facts.md",
    resolvedOutputPath: researchPath,
    templateName: "artifacts/research_facts",
    selfCheckCommand: flowCheckCommand(projectPath, "design"),
    includeSelfCheck: false,
    blockedFinalArtifactContent: RESEARCH_TEMPLATE_SAMPLE_VALUES,
    date: new Date().toISOString().split("T")[0]
  });
}

function flowFinalValidationCheckCommand(projectPath: string): string {
  return `phasedev check-validation --project-path ${shellQuote(projectPath)} --scope final`;
}

function finalValidationArtifactContract(findingsPath: string, projectPath: string): string {
  const finalTemplateContent = renderTemplate("artifacts/validation_findings", {
    date: new Date().toISOString().split("T")[0]
  })
    .replace("type: phase", "type: final")
    .replace(
      "verdict must be exactly one of: ready, ready_with_risks, repair_required, repaired.",
      "verdict must be exactly one of: ready, ready_with_risks, repair_required."
    )
    .replace(
      "- repaired: use only in Repair Loop after actual blocking findings are resolved; do not use ready or ready_with_risks from Repair Loop.\n",
      ""
    );

  return renderArtifactContract({
    artifactId: "validation_findings.md",
    resolvedOutputPath: findingsPath,
    templateName: "artifacts/validation_findings",
    templateContent: finalTemplateContent,
    selfCheckCommand: flowFinalValidationCheckCommand(projectPath),
    selfCheckFailureGuidance: "Artifact contract check must pass before reporting this stage complete. If it fails, fix only `validation_findings.md`, then rerun the same command.",
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
    case "change_intake": {
      let taskContext = "";
      const taskFile = process.env.FLOW_TASK_FILE;
      const date = new Date().toISOString().split("T")[0];
      const changeRoot = route.activeChangePath ?? path.join(projectPath, SYSTEM_DIR, "changes", "<derive-slug-from-final-task>");
      const selfCheckCommand = flowCheckCommand(projectPath, "change_intake_approval");
      if (taskFile && fs.existsSync(taskFile)) {
        const content = fs.readFileSync(taskFile, "utf-8");
        taskContext = `\n\n=== CURRENT TASK DESCRIPTION ===\n${content}\n================================`;
      }
      const basePrompt = renderStageTemplate("change_intake", "stage1_change_intake", {
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
      return prompt("next", "code_research", renderStageTemplate("code_research", "stage2_code_research", {
        prd_path: urls.prd_path,
        rules_path: urls.rules_path,
        project_specs_path: toFileUrl(path.join(projectPath, SYSTEM_DIR, "specs")),
        project_path: projectPath,
        research_path: urls.research_path,
        research_artifact_contract: researchArtifactContract(route.paths.researchPath, projectPath),
        self_check_command: flowCheckCommand(projectPath, "technical_design")
      }, config));
    }
    case "invalid_code_research":
      return invalidResearchBlocker(route.paths.researchPath, route.issues);
    case "technical_design": {
      const urls = urlsFor(route.paths);
      return prompt("next", "technical_design", renderStageTemplate("technical_design", "stage3_technical_design", {
        prd_path: urls.prd_path,
        rules_path: urls.rules_path,
        research_path: urls.research_path,
        design_path: urls.design_path,
        date: new Date().toISOString().split("T")[0],
        design_artifact_contract: artifactContract("architecture/design.md", route.paths.designPath, "artifacts/design", flowCheckCommand(projectPath, "technical_design_approval")),
        self_check_command: flowCheckCommand(projectPath, "technical_design_approval")
      }, config));
    }
    case "invalid_technical_design":
      return invalidDesignBlocker(route.paths.designPath, route.issues);
    case "technical_design_approval":
      return approvalBlocker("technical_design", "Design requires review", route.paths.designPath, "architecture/design.md");
    case "iteration_planning": {
      const urls = urlsFor(route.paths);
      const date = new Date().toISOString().split("T")[0];
      const selfCheckCommand = flowCheckCommand(projectPath, "iteration_planning_approval");
      return prompt("next", "iteration_planning", renderStageTemplate("iteration_planning", "stage4_iteration_planning", {
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
    case "phase": {
      const urls = urlsFor(route.paths);
      const testCommands = parseTestCommands(route.paths.executionContractPath).commands;
      return handlePhase(route.paths.iterationPlanPath, route.activeIteration, urls, testCommands, route.paths.executionContractPath, config, projectPath);
    }
    case "final_validation": {
      const urls = urlsFor(route.paths);
      return prompt("next", "final_validation", renderStageTemplate("final_validation", "stage6b_final_validation", {
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
