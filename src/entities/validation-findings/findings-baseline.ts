import { canonicalFindingKey, parseValidationFindingsArtifact } from "./parse-validation-findings";
import type { FindingsBaseline } from "../change/flow-state";

export interface FindingsBaselineRow {
  id: string;
  status: string;
  severity: string;
  className: string;
  iteration: string;
  finding: string;
  requiredFix: string;
}

const norm = (value: string): string => value.replace(/\s+/g, " ").trim();

export function checkFindingsAgainstBaseline(findingsPath: string, baseline: FindingsBaseline): string[] {
  const current = new Map(
    parseValidationFindingsArtifact(findingsPath).rows.map(row => [row.id, row])
  );
  const issues: string[] = [];
  for (const base of baseline.rows) {
    const row = current.get(base.id);
    if (!row) {
      issues.push(
        `Finding ${base.id} was deleted from validation_findings.md. Findings are append-only: restore the row. If the registry was edited intentionally by the user outside the flow, delete the change's findingsBaseline (run phasedev sync-state) and rerun.`
      );
      continue;
    }
    const stableChanged =
      norm(row.severity) !== norm(base.severity) ||
      norm(row.className) !== norm(base.className) ||
      norm(row.phase) !== norm(base.iteration) ||
      canonicalFindingKey(row.finding) !== canonicalFindingKey(base.finding) ||
      norm(row.requiredFix) !== norm(base.requiredFix);
    if (stableChanged) {
      issues.push(
        `Finding ${base.id} stable fields were rewritten. Only Status and Resolution may change; restore Severity/Class/Iteration/Finding/Required Fix.`
      );
    }
    if (base.status === "resolved" && row.status === "open") {
      issues.push(
        `Finding ${base.id} went resolved -> open. A resolved finding may only become reopened (with new evidence).`
      );
    }
  }
  return issues;
}
