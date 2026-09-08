import { Config } from "../../entities/config/config";
import { Phase } from "../../entities/phase/types";
import { renderTemplate } from "../../shared/templates/render-template";
import { renderSkillComplianceLine } from "./skill-policy";
import { renderBlockingSeverityPolicy } from "./blocking-severity-policy";

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
  validation_scope_sources: "the current iteration `Goal`, `Expected Change Surface`, `Tasks`, `Checks`, `Check Evidence`, related `R#`, related `SC#`, and approved risk/design boundaries",
  validation_changed_file_scope: "tied to the current iteration",
  validation_budget_target: "current-iteration artifacts, current-iteration changed files, and narrow searches needed to prove completeness or a concrete finding",
  validation_stop_coverage_units: "every current-iteration task, related `R#`, related `SC#`, Check Evidence row, applicable risk/design boundary, and changed file",
  validation_inventory_blocker_scope: "actual changed-file inventory for the current iteration",
  validation_requirements_pass: "confirm the current iteration satisfies its approved plan/design/PRD trace and does not add unapproved behavior",
  validation_execution_rule: "Validation mode is review-only: do not rerun tests, builds, browsers, migrations, deployments, or other execution gates.",
  validation_full_gate_line: "Full gate: not_applicable (review-only iteration validation)"
};

const FINAL_VALIDATION_COMMON: ValidationCommonVariables = {
  validation_artifact_read_order: "`prd.md`, `architecture/design.md`, `iteration_plan.md` all iterations including `Generation Bundle`, `Overview`, `Expected Change Surface`, `Checks`, and `Check Evidence`, then `execution_contract.md`, and existing `validation_findings.md` if present",
  validation_scope_sources: "the full approved PRD `Intent`, every `R#`, every `SC#`, approved design decisions and risk boundaries, all implementation plan iterations, `Generation Bundle`, iteration `Expected Change Surface` entries, and all Check Evidence rows",
  validation_changed_file_scope: "in the full change set",
  validation_budget_target: "full-change artifacts, all changed files outside `.phasedev/**`, and narrow searches needed to prove completeness or a concrete finding",
  validation_stop_coverage_units: "every approved `R#`, `SC#`, applicable design/risk boundary, implementation iteration, Check Evidence row, and changed file outside `.phasedev/**`",
  validation_inventory_blocker_scope: "expected full-change surface",
  validation_requirements_pass: "confirm the full change satisfies the approved PRD, approved design, and approved implementation plan without adding unapproved behavior",
  validation_execution_rule: "Validation mode is review-only with role-scoped execution gates: when `execution_contract.md` contains a Browser Validation section, browser scenarios are owned by `browser-qa` (record with `phasedev record-gate browser`); the authorized `full` gate command is owned by `implementation-check` and must be recorded with `phasedev record-gate full` before a terminal verdict. Do not rerun `unit`, `phase`, additional checks, builds, migrations, or deployments from roles that do not own these gates.",
  validation_full_gate_line: "Full gate: record the authorized full gate command and result with `phasedev record-gate full` (blocked/unavailable is gate evidence, not a finding)"
};

export function renderValidationCommonContract(phase: Phase, config: Config): string {
  const variables = phase === "final_validation" ? FINAL_VALIDATION_COMMON : PHASE_VALIDATION_COMMON;
  return renderTemplate("validation_common", {
    ...variables,
    skill_compliance_line: renderSkillComplianceLine(),
    blocking_severity_policy: renderBlockingSeverityPolicy(config.blockingSeverity)
  });
}
