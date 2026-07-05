import { shellQuote } from "../../shared/shell/shell-quote";
import { buildChangePaths } from "../../entities/change/paths";
import { Config } from "../../entities/config/config";
import { Phase } from "../../entities/phase/types";
import { renderTemplate, resolveTemplatePath } from "../../shared/templates/render-template";
import { toFileUrl } from "./prompt-formatters";
import { renderSkillComplianceLine, renderSkillPolicy, renderPhaseSkillNote, renderPhaseSkillStep } from "./skill-policy";
import { Iteration } from "../../entities/iteration-plan/types";
import { TestCommands } from "../../entities/test-commands/parse-test-commands";
import { Prompt } from "../../entities/phase/types";
import { testCommandBlocker } from "./prompt-blockers";
import { renderValidationCommonContract } from "./validation-common-contract";
import { renderArtifactContract } from "./artifact-contract";
import { todayIsoDate } from "../../shared/time/today-iso-date";

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

export const PATH_RESOLUTION_RULE = [
  "Path resolution rule:",
  "- Flow artifact names in this prompt (e.g. `prd.md`, `execution_contract.md`, `research_facts.md`, `architecture/design.md`, `iteration_plan.md`, `validation_findings.md`) are paths inside the active change folder, not paths from the project repository root.",
  "- Write or update each flow artifact only at the absolute path given for it in this prompt; treat template comments, embedded rows, and allowlist entries as active-change-folder paths, never project-root paths.",
  "- Do not create or update project-root copies of these flow artifacts.",
  "- Run repository code, config, test, and runtime evidence searches under the active project root unless an explicit input path in this prompt points elsewhere."
].join("\n");

export const SELF_CHECK_FALLBACK = [
  "If the `phasedev` executable is unavailable, look once for a controller-provided or local equivalent that runs the same `check --project-path ...` subcommand (for example a repository-confirmed `npm exec -- phasedev check --project-path ...`, `bunx phasedev check --project-path ...`, or `bun run src/cli.ts check --project-path ...` when package/source entrypoint evidence supports it); use it only when repository evidence or controller output identifies it, and record the exact command used.",
  "If no equivalent is available, or the same non-actionable validator failure repeats after one concrete artifact fix and rerun, stop and report a blocker with the exact command and output. Do not loop on unavailable commands, and do not report the phase ready while the self-check has not passed."
].join("\n");

export function renderPhaseTemplate(
  phase: Phase,
  templateName: string,
  variables: Record<string, string>,
  config: Config
): string {
  return renderTemplate(templateName, {
    ...variables,
    path_resolution_rule: PATH_RESOLUTION_RULE,
    self_check_fallback: SELF_CHECK_FALLBACK,
    prd_template_path: toFileUrl(resolveTemplatePath("artifacts/prd")),
    research_template_path: toFileUrl(resolveTemplatePath("artifacts/research_facts")),
    design_template_path: toFileUrl(resolveTemplatePath("artifacts/design")),
    implementation_plan_template_path: toFileUrl(resolveTemplatePath("artifacts/iteration_plan")),
    rules_template_path: toFileUrl(resolveTemplatePath("artifacts/execution_contract")),
    validation_findings_template_path: toFileUrl(resolveTemplatePath("artifacts/validation_findings")),
    validation_common_contract: renderValidationCommonContract(phase, config),
    skill_policy: renderSkillPolicy(phase, config),
    skill_compliance_line: renderSkillComplianceLine(phase, config),
    phase_skill_step: renderPhaseSkillStep(phase, config),
    phase_skill_note: renderPhaseSkillNote(phase, config),
    skill_policy_inline_ref: "",
  });
}

// ── Required check commands ────────────────────────────────

function isKnownTestCommandKey(check: string): check is keyof TestCommands {
  return check === "unit" || check === "phase" || check === "full";
}

function requiredCheckKeys(currentPhase: Iteration): Array<keyof TestCommands> {
  const keys = (currentPhase.requiredChecks ?? [])
    .map(check => check.check.trim().toLowerCase())
    .filter(isKnownTestCommandKey);
  return keys.length > 0 ? Array.from(new Set(keys)) : ["unit"];
}

/**
 * Render the iteration's required check commands from execution_contract.md,
 * or return a testCommandBlocker Prompt when a required command is missing.
 */
export function renderRequiredCheckCommands(currentPhase: Iteration, testCommands: TestCommands, rulesPath: string): string | Prompt {
  const requiredChecks = currentPhase.requiredChecks ?? [];
  const checks = requiredChecks.length > 0
    ? requiredChecks
    : [{ check: "unit", command: testCommands.unit ?? "" }];
  const missingKnownKeys = requiredCheckKeys(currentPhase).filter(key => testCommands[key] === undefined);
  if (missingKnownKeys.length > 0) {
    return testCommandBlocker("implementation", rulesPath, missingKnownKeys);
  }

  return checks.map(check => {
    const normalizedCheck = check.check.trim().toLowerCase();
    return `- ${normalizedCheck}: \`${check.command}\``;
  }).join("\n");
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
    date: todayIsoDate(),
  });
}

const ITERATION_ALLOWED_VERDICTS = "ready, ready_with_risks, repair_required, repaired";
const FINAL_ALLOWED_VERDICTS = "ready, ready_with_risks, repair_required";
const REPAIRED_VERDICT_NOTE =
  "- repaired: use only in Repair Loop after actual blocking findings are resolved; do not use ready or ready_with_risks from Repair Loop.\n";

/**
 * Render validation_findings.md with the verdict list and `type` value bound
 * to the artifact variant, instead of string-patching prose after render.
 */
export function renderValidationFindingsTemplate(type: "iteration" | "final", date: string): string {
  return renderTemplate("artifacts/validation_findings", {
    date,
    artifact_type: type,
    allowed_verdicts: type === "iteration" ? ITERATION_ALLOWED_VERDICTS : FINAL_ALLOWED_VERDICTS,
    repaired_verdict_note: type === "iteration" ? REPAIRED_VERDICT_NOTE : "",
  });
}

export function finalValidationArtifactContract(findingsPath: string, projectPath: string): string {
  const date = todayIsoDate();

  return renderArtifactContract({
    artifactId: "validation_findings.md",
    resolvedOutputPath: findingsPath,
    templateName: "artifacts/validation_findings",
    templateContent: renderValidationFindingsTemplate("final", date),
    selfCheckCommand: flowFinalValidationCheckCommand(projectPath),
    selfCheckFailureGuidance:
      "Artifact contract check must pass before reporting this phase complete. If it fails, fix only `validation_findings.md`, then rerun the same command.",
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
