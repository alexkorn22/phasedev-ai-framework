import { blankFencedCodeLines } from "../../shared/markdown/code-fences";
import { readFrontmatterValue } from "../../shared/markdown/frontmatter";
import { bodyAfterFrontmatter } from "../../shared/markdown/headings";
import { normalizeLineEndings } from "../../shared/markdown/normalize-line-endings";
import { isMarkdownTableSeparatorRow, parseMarkdownTableBlocks, splitMarkdownTableRow } from "../../shared/markdown/table";
import * as fs from "fs";

export interface ValidationFindingState {
  id: string;
  latestStatus: string;
  severity: ValidationFindingSeverity;
  className: string;
  blocksPr: boolean;
  phase: string;
  canonicalFinding: string;
  requiredFix: string;
  latestEvidence: string;
}

export type ValidationFindingStatus = "open" | "reopened" | "resolved";
export type ValidationFindingSeverity = "MUST-FIX" | "RECOMMENDED" | "NIT";
export type ValidationFindingClass = "implementation" | "test" | "plan" | "design" | "requirements" | "validation" | "security" | "code_review";
export type ValidationFindingsVerdict = "ready" | "ready_with_risks" | "repaired" | "repair_required";
export type ValidationFindingsType = "iteration" | "final";

export type ValidationFindingIssueCode =
  | "verdict_ready_with_open_findings"
  | "verdict_ready_with_risks_with_open_blocking"
  | "verdict_repaired_with_open_blocking"
  | "generic";

export interface ValidationFindingIssue {
  code: ValidationFindingIssueCode;
  message: string;
}

export interface ValidationFindingRow {
  id: string;
  status: ValidationFindingStatus;
  severity: ValidationFindingSeverity;
  className: ValidationFindingClass;
  blocksPr: boolean;
  phase: string;
  finding: string;
  requiredFix: string;
}

export interface ValidationFindingsArtifact {
  exists: boolean;
  verdict: ValidationFindingsVerdict | "unknown";
  type: ValidationFindingsType | "unknown";
  rows: ValidationFindingRow[];
  issues: ValidationFindingIssue[];
  openRows: ValidationFindingRow[];
  openBlockingRows: ValidationFindingRow[];
  openNonBlockingRows: ValidationFindingRow[];
}

const STRICT_HEADERS = ["id", "status", "severity", "class", "iteration", "finding", "requiredfix"];
const ALLOWED_STATUSES = new Set(["open", "reopened", "resolved"]);
const ALLOWED_SEVERITIES = new Set(["MUST-FIX", "RECOMMENDED", "NIT"]);
const ALLOWED_CLASSES = new Set(["implementation", "test", "plan", "design", "requirements", "validation", "security", "code_review"]);

export function parseValidationVerdict(filePath: string): "ready" | "ready_with_risks" | "repaired" | "repair_required" | "unknown" {
  const verdict = readFrontmatterValue(filePath, "verdict")?.toLowerCase();
  if (verdict === "ready" || verdict === "ready_with_risks" || verdict === "repaired" || verdict === "repair_required") {
    return verdict;
  }

  return "unknown";
}

export function parseValidationVerdictType(filePath: string): "iteration" | "final" | "unknown" {
  const type = readFrontmatterValue(filePath, "type")?.toLowerCase();
  if (type === "iteration" || type === "final") {
    return type;
  }

  return "unknown";
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9?]+/g, "");
}

function canonicalFindingFor(value: string): string {
  return value
    .replace(/^reopened\s*\/\s*regression\s*:\s*/i, "")
    .trim();
}

function isOpenStatus(status: string): boolean {
  return status === "open" || status === "reopened";
}

function genericIssue(message: string): ValidationFindingIssue {
  return { code: "generic", message };
}

function artifactWithDerivedRows(
  exists: boolean,
  verdict: ValidationFindingsArtifact["verdict"],
  type: ValidationFindingsArtifact["type"],
  rows: ValidationFindingRow[],
  issues: ValidationFindingIssue[]
): ValidationFindingsArtifact {
  const openRows = rows.filter(row => isOpenStatus(row.status));
  const openBlockingRows = openRows.filter(row => row.severity === "MUST-FIX");
  const openNonBlockingRows = openRows.filter(row => row.severity !== "MUST-FIX");

  return {
    exists,
    verdict,
    type,
    rows,
    issues,
    openRows,
    openBlockingRows,
    openNonBlockingRows
  };
}

export function parseValidationFindingsArtifact(filePath: string): ValidationFindingsArtifact {
  if (!fs.existsSync(filePath)) {
    return artifactWithDerivedRows(false, "unknown", "unknown", [], []);
  }

  const verdict = parseValidationVerdict(filePath);
  const type = parseValidationVerdictType(filePath);
  const content = normalizeLineEndings(fs.readFileSync(filePath, "utf-8"));
  const { body, hasFrontmatter } = bodyAfterFrontmatter(content);
  const bodyLines = blankFencedCodeLines(body.split("\n"));
  const issues: ValidationFindingIssue[] = [];
  const rows: ValidationFindingRow[] = [];

  if (!hasFrontmatter) {
    issues.push(genericIssue("validation_findings.md must start with YAML frontmatter."));
  }
  if (verdict === "unknown") {
    issues.push(genericIssue("YAML field `verdict` must be one of: ready, ready_with_risks, repaired, repair_required."));
  }
  if (type === "unknown") {
    issues.push(genericIssue("YAML field `type` must be one of: iteration, final."));
  }

  const tableBlocks = parseMarkdownTableBlocks(bodyLines);
  if (tableBlocks.length !== 1) {
    issues.push(genericIssue(`validation_findings.md must contain exactly one markdown table, found ${tableBlocks.length}.`));
  }

  const nonTableContent = bodyLines.filter(line => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !trimmed.startsWith("|");
  });
  if (nonTableContent.length > 0) {
    issues.push(genericIssue("validation_findings.md may contain only YAML frontmatter and one findings table."));
  }

  const tableBlock = tableBlocks[0];
  if (!tableBlock) {
    return artifactWithDerivedRows(true, verdict, type, rows, issues);
  }

  const headerCells = splitMarkdownTableRow(bodyLines[tableBlock.start]);
  const normalizedHeaders = headerCells.map(normalizeHeader);
  if (normalizedHeaders.length !== STRICT_HEADERS.length || !STRICT_HEADERS.every((header, index) => normalizedHeaders[index] === header)) {
    issues.push(genericIssue("Findings table columns must be exactly: ID, Status, Severity, Class, Iteration, Finding, Required Fix."));
  }

  const separatorIndex = tableBlock.start + 1;
  if (separatorIndex > tableBlock.end || !isMarkdownTableSeparatorRow(splitMarkdownTableRow(bodyLines[separatorIndex]))) {
    issues.push(genericIssue("Findings table must include a separator row immediately after the header."));
  }

  const seenIds = new Set<string>();
  const dataStart = separatorIndex + 1;
  for (let rowIndex = dataStart; rowIndex <= tableBlock.end; rowIndex++) {
    const cells = splitMarkdownTableRow(bodyLines[rowIndex]);
    if (isMarkdownTableSeparatorRow(cells)) {
      issues.push(genericIssue(`Findings table row ${rowIndex + 1} contains an unexpected separator.`));
      continue;
    }

    if (cells.length !== STRICT_HEADERS.length) {
      issues.push(genericIssue(`Findings table row ${rowIndex + 1} must have exactly ${STRICT_HEADERS.length} cells.`));
      continue;
    }

    const [id = "", rawStatus = "", rawSeverity = "", rawClassName = "", phase = "", finding = "", requiredFix = ""] = cells;
    const status = rawStatus.toLowerCase();
    const severity = rawSeverity;
    const className = rawClassName.toLowerCase();
    if (id.length === 0) {
      issues.push(genericIssue(`Findings table row ${rowIndex + 1} has an empty ID.`));
    }
    if (seenIds.has(id)) {
      issues.push(genericIssue(`Findings table contains duplicate ID \`${id}\`.`));
    }
    seenIds.add(id);
    if (!ALLOWED_STATUSES.has(status)) {
      issues.push(genericIssue(`Finding ${id || `row ${rowIndex + 1}`} has invalid Status \`${rawStatus}\`.`));
    }
    if (!ALLOWED_SEVERITIES.has(severity)) {
      issues.push(genericIssue(`Finding ${id || `row ${rowIndex + 1}`} has invalid Severity \`${rawSeverity}\`.`));
    }
    if (!ALLOWED_CLASSES.has(className)) {
      issues.push(genericIssue(`Finding ${id || `row ${rowIndex + 1}`} has invalid Class \`${rawClassName}\`.`));
    }
    const securitySeverityMismatch = ALLOWED_CLASSES.has(className) && className === "security" && severity !== "MUST-FIX";
    if (securitySeverityMismatch) {
      issues.push(genericIssue(`Finding ${id || `row ${rowIndex + 1}`} has Class \`security\`; security findings must use Severity \`MUST-FIX\`.`));
    }
    if (phase.length === 0) {
      issues.push(genericIssue(`Finding ${id || `row ${rowIndex + 1}`} has an empty Iteration.`));
    }
    if (finding.length === 0) {
      issues.push(genericIssue(`Finding ${id || `row ${rowIndex + 1}`} has an empty Finding.`));
    }
    if (requiredFix.length === 0) {
      issues.push(genericIssue(`Finding ${id || `row ${rowIndex + 1}`} has an empty Required Fix.`));
    }

    if (
      id.length > 0 &&
      ALLOWED_STATUSES.has(status) &&
      ALLOWED_SEVERITIES.has(severity) &&
      ALLOWED_CLASSES.has(className) &&
      !securitySeverityMismatch &&
      phase.length > 0 &&
      finding.length > 0 &&
      requiredFix.length > 0
    ) {
      rows.push({
        id,
        status: status as ValidationFindingStatus,
        severity: severity as ValidationFindingSeverity,
        className: className as ValidationFindingClass,
        blocksPr: severity === "MUST-FIX",
        phase,
        finding,
        requiredFix
      });
    }
  }

  const artifact = artifactWithDerivedRows(true, verdict, type, rows, issues);
  if (artifact.issues.length === 0) {
    if (artifact.verdict === "ready" && artifact.openRows.length > 0) {
      artifact.issues.push({
        code: "verdict_ready_with_open_findings",
        message: "`verdict: ready` is allowed only when there are no open or reopened findings."
      });
    }
    if (artifact.verdict === "ready_with_risks" && artifact.openBlockingRows.length > 0) {
      artifact.issues.push({
        code: "verdict_ready_with_risks_with_open_blocking",
        message: "`verdict: ready_with_risks` is not allowed while open or reopened MUST-FIX findings exist."
      });
    }
    if (artifact.verdict === "repair_required" && artifact.openBlockingRows.length === 0) {
      artifact.issues.push(genericIssue("`verdict: repair_required` requires at least one open or reopened MUST-FIX finding."));
    }
    if (artifact.verdict === "repaired" && artifact.openBlockingRows.length > 0) {
      artifact.issues.push({
        code: "verdict_repaired_with_open_blocking",
        message: "`verdict: repaired` is not allowed while open or reopened MUST-FIX findings exist."
      });
    }
  }

  return artifact;
}

export function parseCurrentValidationFindings(filePath: string): ValidationFindingState[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  return parseValidationFindingsArtifact(filePath).rows.map(row => {
    const canonicalFinding = canonicalFindingFor(row.finding);

    return {
      id: row.id,
      latestStatus: row.status,
      severity: row.severity,
      className: row.className,
      blocksPr: row.blocksPr,
      phase: row.phase,
      canonicalFinding,
      requiredFix: row.requiredFix,
      latestEvidence: row.finding
    };
  });
}
