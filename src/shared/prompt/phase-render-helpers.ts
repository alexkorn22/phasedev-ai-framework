import { shellQuote } from "../shell/shell-quote";
import { buildChangePaths } from "../../entities/change/paths";
import { Config } from "../../entities/config/config";
import { Phase } from "../../entities/phase/types";
import { renderTemplate, resolveTemplatePath } from "../templates/render-template";
import { toFileUrl } from "../../features/phase-control/prompt-formatters";
import { renderSkillComplianceLine, renderSkillPolicy, renderStageSkillNote, renderStageSkillStep } from "../../features/phase-control/skill-policy";
import { renderValidationCommonContract } from "../../features/phase-control/validation-common-contract";
import { renderArtifactContract } from "../../features/phase-control/artifact-contract";

// ── Helpers ────────────────────────────────────────────────

export function urlsFor(paths: ReturnType<typeof buildChangePaths>) {
  return {
    prd_path: toFileUrl(paths.prdPath),
    rules_path: toFileUrl(paths.executionContractPath),
    research_path: toFileUrl(paths.researchPath),
    design_path: toFileUrl(paths.designPath),
    plan_path: toFileUrl(paths.iterationPlanPath),
    findings_path: toFileUrl(paths.findingsPath),
  };
}

export function flowCheckCommand(projectPath: string): string {
  return `phasedev check --project-path ${shellQuote(projectPath)}`;
}

export function flowFinalValidationCheckCommand(projectPath: string): string {
  return `phasedev check-validation --project-path ${shellQuote(projectPath)} --scope final`;
}

export function renderPhaseTemplate(
  phase: Phase,
  templateName: string,
  variables: Record<string, string>,
  config: Config
): string {
  return renderTemplate(templateName, {
    ...variables,
    prd_template_path: toFileUrl(resolveTemplatePath("artifacts/prd")),
    research_template_path: toFileUrl(resolveTemplatePath("artifacts/research_facts")),
    design_template_path: toFileUrl(resolveTemplatePath("artifacts/design")),
    implementation_plan_template_path: toFileUrl(resolveTemplatePath("artifacts/implementation_plan")),
    rules_template_path: toFileUrl(resolveTemplatePath("artifacts/execution_contract")),
    validation_findings_template_path: toFileUrl(resolveTemplatePath("artifacts/validation_findings")),
    validation_common_contract: renderValidationCommonContract(phase, config),
    skill_policy: renderSkillPolicy(phase, config),
    skill_compliance_line: renderSkillComplianceLine(phase, config),
    stage_skill_step: renderStageSkillStep(phase, config),
    stage_skill_note: renderStageSkillNote(phase, config),
    skill_policy_inline_ref: "",
  });
}

// ── Artifact Contracts ─────────────────────────────────────

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
  "Existing spec describes capability Y.",
];

export function researchArtifactContract(researchPath: string, projectPath: string): string {
  return renderArtifactContract({
    artifactId: "research_facts.md",
    resolvedOutputPath: researchPath,
    templateName: "artifacts/research_facts",
    selfCheckCommand: flowCheckCommand(projectPath),
    includeSelfCheck: false,
    blockedFinalArtifactContent: RESEARCH_TEMPLATE_SAMPLE_VALUES,
    date: new Date().toISOString().split("T")[0],
  });
}

export function finalValidationArtifactContract(findingsPath: string, projectPath: string): string {
  const date = new Date().toISOString().split("T")[0];
  const finalTemplateContent = renderTemplate("artifacts/validation_findings", { date })
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
    selfCheckFailureGuidance:
      "Artifact contract check must pass before reporting this stage complete. If it fails, fix only `validation_findings.md`, then rerun the same command.",
    date,
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
  "- Do not use emoji in `iteration_plan.md`; keep machine-sensitive approval artifacts plain text.",
];

export function implementationPlanArtifactContract(planPath: string, selfCheckCommand: string, date: string): string {
  return renderArtifactContract({
    artifactId: "iteration_plan.md",
    resolvedOutputPath: planPath,
    templateName: "artifacts/iteration_plan",
    selfCheckCommand,
    includeSelfCheck: false,
    canonicalFillRules: IMPLEMENTATION_PLAN_CANONICAL_FILL_RULES,
    date,
  });
}
