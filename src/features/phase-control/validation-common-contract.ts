import { Config } from "../../entities/config/config";
import { Phase } from "../../entities/phase/types";
import { renderTemplate } from "../../shared/templates/render-template";
import { renderSkillComplianceLine, renderSkillPolicyInlineRef } from "./skill-policy";

type ValidationCommonVariableKey =
  | "validation_artifact_read_order"
  | "validation_scope_sources"
  | "validation_changed_file_scope"
  | "validation_budget_target"
  | "validation_stop_coverage_units"
  | "validation_inventory_blocker_scope"
  | "validation_requirements_pass"
  | "validation_execution_rule"
  | "validation_full_gate_line";

type ValidationCommonVariables = Record<ValidationCommonVariableKey, string>;

const PHASE_VALIDATION_COMMON: ValidationCommonVariables = {
  validation_artifact_read_order: "`iteration_plan.md` current iteration, then `prd.md`, `architecture/design.md`, `execution_contract.md`, and existing `validation_findings.md` if present",
  validation_scope_sources: "the current phase `Goal`, `Expected Change Surface`, `Tasks`, `Checks`, `Check Evidence`, related `R#`, related `SC#`, and approved risk/design boundaries",
  validation_changed_file_scope: "tied to the current phase",
  validation_budget_target: "current-phase artifacts, current-phase changed files, and narrow searches needed to prove completeness or a concrete finding",
  validation_stop_coverage_units: "every current-phase task, related `R#`, related `SC#`, Check Evidence row, applicable risk/design boundary, and changed file",
  validation_inventory_blocker_scope: "expected current-phase surface",
  validation_requirements_pass: "confirm the current phase satisfies its approved plan/design/PRD trace and does not add unapproved behavior",
  validation_execution_rule: "Validation mode is review-only: do not rerun tests, builds, browsers, migrations, deployments, or other execution gates.",
  validation_full_gate_line: "Full gate: not_applicable (review-only iteration validation)"
};

const FINAL_VALIDATION_COMMON: ValidationCommonVariables = {
  validation_artifact_read_order: "`prd.md`, `architecture/design.md`, `iteration_plan.md` all iterations including `Generation Bundle`, `Overview`, `Expected Change Surface`, `Checks`, and `Check Evidence`, then `execution_contract.md`, and existing `validation_findings.md` if present",
  validation_scope_sources: "the full approved PRD `Intent`, every `R#`, every `SC#`, approved design decisions and risk boundaries, all implementation plan phases, `Generation Bundle`, phase `Expected Change Surface` entries, and all Check Evidence rows",
  validation_changed_file_scope: "in the full change set",
  validation_budget_target: "full-change artifacts, all changed files outside `.phasedev/**`, and narrow searches needed to prove completeness or a concrete finding",
  validation_stop_coverage_units: "every approved `R#`, `SC#`, applicable design/risk boundary, implementation phase, Check Evidence row, and changed file outside `.phasedev/**`",
  validation_inventory_blocker_scope: "expected full-change surface",
  validation_requirements_pass: "confirm the full change satisfies the approved PRD, approved design, and approved implementation plan without adding unapproved behavior",
  validation_execution_rule: "Validation mode is review-only with exactly one required execution: run the `full` gate command from `execution_contract.md` exactly once from the project root and record its result before deciding the verdict. Do not rerun `unit`, `phase`, additional checks, builds, browsers, migrations, or deployments.",
  validation_full_gate_line: "Full gate: <exact full command> -> passed / failed / unavailable"
};

export function renderValidationCommonContract(stage: Phase, config: Config): string {
  const variables = stage === "final_validation" ? FINAL_VALIDATION_COMMON : PHASE_VALIDATION_COMMON;
  return renderTemplate("validation_common", {
    ...variables,
    skill_policy_inline_ref: renderSkillPolicyInlineRef(stage, config),
    skill_compliance_line: renderSkillComplianceLine(stage, config)
  });
}
