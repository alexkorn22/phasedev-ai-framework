import { shellQuote } from "../../shared/shell/shell-quote";
import { renderTemplate } from "../../shared/templates/render-template";
import { todayIsoDate } from "../../shared/time/today-iso-date";
import { BlockingSeverity } from "../../entities/validation-findings/blocking-severity";
import { renderBlockingSeverityPolicy } from "./blocking-severity-policy";
import { renderArtifactContract } from "./artifact-contract";

function changeFlag(changeName?: string): string {
  return changeName === undefined ? "" : ` --change ${shellQuote(changeName)}`;
}

export function flowFinalValidationCheckCommand(projectPath: string, changeName?: string): string {
  return `phasedev check-validation --project-path ${shellQuote(projectPath)} --scope final${changeFlag(changeName)}`;
}

const ITERATION_ALLOWED_VERDICTS = "ready, ready_with_risks, repair_required, repaired";
const FINAL_ALLOWED_VERDICTS = "ready, ready_with_risks, repair_required";
const REPAIRED_VERDICT_NOTE =
  "- repaired: use only in Repair Loop after actual blocking findings are resolved; do not use ready or ready_with_risks from Repair Loop.\n";

export function renderValidationFindingsTemplate(type: "iteration" | "final", date: string, blockingSeverity: BlockingSeverity): string {
  return renderTemplate("artifacts/validation_findings", {
    date,
    artifact_type: type,
    allowed_verdicts: type === "iteration" ? ITERATION_ALLOWED_VERDICTS : FINAL_ALLOWED_VERDICTS,
    repaired_verdict_note: type === "iteration" ? REPAIRED_VERDICT_NOTE : "",
    blocking_severity_policy: renderBlockingSeverityPolicy(blockingSeverity)
  });
}

export const VALIDATION_FINDINGS_CANONICAL_FILL_RULES = [
  "- Never write this artifact by hand: `phasedev add-finding` and `phasedev set-verdict` create it when missing, and every row or verdict change goes through the phasedev findings commands. The embedded template only documents the structure the CLI maintains.",
  "- If the Output path already exists, it is edited in place through those commands: never recreate it from the embedded template and never drop existing table rows.",
  "- The findings registry is append-only; the controller diffs it against a baseline snapshot and fails the self-check if rows were deleted or rewritten."
];

export const REVIEW_ROLE_VALIDATION_FINDINGS_CANONICAL_FILL_RULES = [
  "- Never write this artifact by hand: `phasedev add-finding` appends rows in this role. The embedded template only documents the structure the CLI maintains.",
  "- If the Output path already exists, append findings rows only through `phasedev add-finding`: never recreate it from the embedded template and never drop existing table rows.",
  "- The findings registry is append-only; the controller diffs it against a baseline snapshot and fails the self-check if rows were deleted or rewritten."
];

export function renderReviewRoleValidationFindingsTemplate(
  type: "iteration" | "final",
  date: string,
  blockingSeverity: BlockingSeverity
): string {
  return renderTemplate("artifacts/validation_findings_review_role", {
    date,
    artifact_type: type,
    repaired_verdict_note: type === "iteration" ? REPAIRED_VERDICT_NOTE : "",
    blocking_severity_policy: renderBlockingSeverityPolicy(blockingSeverity)
  });
}

export function finalValidationArtifactContract(
  findingsPath: string,
  projectPath: string,
  blockingSeverity: BlockingSeverity,
  changeName?: string
): string {
  const date = todayIsoDate();

  return renderArtifactContract({
    artifactId: "validation_findings.md",
    resolvedOutputPath: findingsPath,
    templateName: "artifacts/validation_findings",
    templateContent: renderValidationFindingsTemplate("final", date, blockingSeverity),
    selfCheckCommand: flowFinalValidationCheckCommand(projectPath, changeName),
    selfCheckFailureGuidance:
      "Artifact contract check must pass before reporting this phase complete. If it fails, fix only `validation_findings.md`, then rerun the same command.",
    canonicalFillRules: VALIDATION_FINDINGS_CANONICAL_FILL_RULES,
    date,
  });
}
