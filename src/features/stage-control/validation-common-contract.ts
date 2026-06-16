import { Stage } from "../../entities/stage/types";
import { renderTemplate } from "../../shared/templates/render-template";

type ValidationCommonVariableKey =
  | "validation_artifact_read_order"
  | "validation_scope_sources"
  | "validation_changed_file_scope"
  | "validation_budget_target"
  | "validation_stop_coverage_units"
  | "validation_inventory_blocker_scope"
  | "validation_requirements_pass";

type ValidationCommonVariables = Record<ValidationCommonVariableKey, string>;

const PHASE_VALIDATION_COMMON: ValidationCommonVariables = {
  validation_artifact_read_order: "`implementation_plan.md` current phase, then `prd.md`, `architecture/design.md`, `rules.md`, and existing `validation_findings.md` if present",
  validation_scope_sources: "the current phase `Goal`, `Expected Change Surface`, `Tasks`, `Checks`, `Check Evidence`, related `R#`, related `SC#`, and approved risk/design boundaries",
  validation_changed_file_scope: "tied to the current phase",
  validation_budget_target: "current-phase artifacts, current-phase changed files, and narrow searches needed to prove completeness or a concrete finding",
  validation_stop_coverage_units: "every current-phase task, related `R#`, related `SC#`, Check Evidence row, applicable risk/design boundary, and changed file",
  validation_inventory_blocker_scope: "expected current-phase surface",
  validation_requirements_pass: "confirm the current phase satisfies its approved plan/design/PRD trace and does not add unapproved behavior"
};

const FINAL_VALIDATION_COMMON: ValidationCommonVariables = {
  validation_artifact_read_order: "`prd.md`, `architecture/design.md`, `implementation_plan.md` all phases including `Generation Bundle`, `Phase Overview`, `Expected Change Surface`, `Checks`, and `Check Evidence`, then `rules.md`, and existing `validation_findings.md` if present",
  validation_scope_sources: "the full approved PRD `Intent`, every `R#`, every `SC#`, approved design decisions and risk boundaries, all implementation plan phases, `Generation Bundle`, phase `Expected Change Surface` entries, and all Check Evidence rows",
  validation_changed_file_scope: "in the full change set",
  validation_budget_target: "full-change artifacts, all changed files outside `.phasedev/**`, and narrow searches needed to prove completeness or a concrete finding",
  validation_stop_coverage_units: "every approved `R#`, `SC#`, applicable design/risk boundary, implementation phase, Check Evidence row, and changed file outside `.phasedev/**`",
  validation_inventory_blocker_scope: "expected full-change surface",
  validation_requirements_pass: "confirm the full change satisfies the approved PRD, approved design, and approved implementation plan without adding unapproved behavior"
};

export function renderValidationCommonContract(stage: Stage): string {
  const variables = stage === "final_validation" ? FINAL_VALIDATION_COMMON : PHASE_VALIDATION_COMMON;
  return renderTemplate("validation_common", variables);
}
