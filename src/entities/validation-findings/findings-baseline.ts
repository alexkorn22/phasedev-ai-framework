import * as fs from "fs";
import { parseValidationFindingsArtifact, canonicalFindingKey } from "./parse-validation-findings";
import { writeFileAtomic } from "../../shared/fs/write-file-atomic";

export interface FindingsBaselineRow {
  id: string;
  status: string;
  severity: string;
  className: string;
  iteration: string;
  finding: string;
  requiredFix: string;
}

export interface FindingsBaseline {
  rows: FindingsBaselineRow[];
}

const norm = (value: string): string => value.replace(/\s+/g, " ").trim();

export function writeFindingsBaseline(findingsPath: string, baselinePath: string): void {
  const rows: FindingsBaselineRow[] = fs.existsSync(findingsPath)
    ? parseValidationFindingsArtifact(findingsPath).rows.map(row => ({
        id: row.id,
        status: row.status,
        severity: row.severity,
        className: row.className,
        iteration: row.phase,
        finding: row.finding,
        requiredFix: row.requiredFix
      }))
    : [];
  writeFileAtomic(baselinePath, JSON.stringify({ rows }, null, 2));
}

export function checkFindingsAgainstBaseline(findingsPath: string, baselinePath: string): string[] {
  if (!fs.existsSync(baselinePath)) return [];
  let baseline: FindingsBaseline;
  try {
    baseline = JSON.parse(fs.readFileSync(baselinePath, "utf-8")) as FindingsBaseline;
  } catch {
    return [
      `Findings baseline is unreadable: ${baselinePath}. Delete it or restore valid JSON, then rerun.`
    ];
  }
  const current = new Map(
    parseValidationFindingsArtifact(findingsPath).rows.map(row => [row.id, row])
  );
  const issues: string[] = [];
  for (const base of baseline.rows) {
    const row = current.get(base.id);
    if (!row) {
      issues.push(
        `Finding ${base.id} was deleted from validation_findings.md. Findings are append-only: restore the row. If the registry was edited intentionally by the user outside the flow, delete .findings-baseline.json in the active change folder and rerun.`
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
