import * as fs from "fs";
import { normalizeLineEndings } from "../../shared/markdown/normalize-line-endings";
import { validateArtifactStructure, validateTableShape, type ArtifactStructureSpec, type TableShapeSpec } from "../artifact-structure";

const REQUIRED_INTENT_FIELDS = [
  "Change type",
  "Why",
  "Target state",
  "Risk boundaries"
];

const ALLOWED_CHANGE_TYPES = new Set(["feature", "fix", "refactor", "infra", "experiment"]);
const ALLOWED_EVIDENCE_TYPES = new Set(["unit", "phase", "full", "review", "manual", "smoke"]);

const REQUIRED_SECTIONS = [
  "Intent",
  "Requirements",
  "Success Criteria"
];

const REQUIREMENTS_HEADERS = ["ID", "Requirement"];
const SUCCESS_CRITERIA_HEADERS = ["ID", "Verifies", "Criterion", "Evidence"];

const STRUCTURE_SPEC: ArtifactStructureSpec = {
  artifactName: "prd.md",
  title: "PRD",
  frontmatter: "required",
  checkDeepHeadings: true,
  checkHtmlComments: true,
  sections: {
    required: REQUIRED_SECTIONS,
    membershipCaseInsensitive: true,
    orderCaseInsensitive: true
  }
};

const INTENT_TABLE: TableShapeSpec = { section: "Intent", headers: ["Field", "Value"], mode: "filtered", rowChecks: false };
const REQUIREMENTS_TABLE: TableShapeSpec = { section: "Requirements", headers: REQUIREMENTS_HEADERS, mode: "filtered", rowChecks: false };
const SUCCESS_CRITERIA_TABLE: TableShapeSpec = { section: "Success Criteria", headers: SUCCESS_CRITERIA_HEADERS, mode: "filtered", rowChecks: false };

function parseIntentRows(lines: string[]): Array<{ field: string; value: string }> {
  const dataRows = validateTableShape(lines, INTENT_TABLE, []);
  return dataRows.map(row => ({ field: row.cells[0] ?? "", value: row.cells[1] ?? "" }));
}

function validateIntent(lines: string[], issues: string[]): void {
  const dataRows = validateTableShape(lines, INTENT_TABLE, issues);
  const actualFields = dataRows.map(row => row.cells[0] ?? "");

  for (const field of actualFields) {
    if (!REQUIRED_INTENT_FIELDS.includes(field)) {
      issues.push(`Intent field \`${field}\` is not allowed.`);
    }
  }

  if (actualFields.length !== REQUIRED_INTENT_FIELDS.length || actualFields.some((field, index) => field !== REQUIRED_INTENT_FIELDS[index])) {
    issues.push(`Intent fields must exactly match this order: ${REQUIRED_INTENT_FIELDS.map(field => `\`${field}\``).join(", ")}.`);
  }

  const values = new Map(parseIntentRows(lines).map(row => [row.field, row.value]));
  for (const field of REQUIRED_INTENT_FIELDS) {
    const value = values.get(field);
    if (!value || value.trim().length === 0) {
      issues.push(`Intent field \`${field}\` must be present and non-empty.`);
    }
  }

  const changeType = values.get("Change type")?.trim();
  if (changeType && !ALLOWED_CHANGE_TYPES.has(changeType)) {
    issues.push("Intent field `Change type` must be one of: feature, fix, refactor, infra, experiment.");
  }
}

function validateRequirements(lines: string[], issues: string[]): Set<string> {
  const dataRows = validateTableShape(lines, REQUIREMENTS_TABLE, issues);
  const requirementIds = new Set<string>();

  if (dataRows.length === 0) {
    issues.push("Section `## Requirements` must contain at least one requirement row like `R1`.");
  }

  for (const row of dataRows) {
    const id = row.cells[0] ?? "";
    const requirement = row.cells[1] ?? "";
    if (!/^R\d+$/.test(id)) {
      issues.push(`Requirements row ${row.rowNumber} ID must use \`R#\` format.`);
    }
    if (requirement.trim().length === 0) {
      issues.push(`Requirements row ${row.rowNumber} Requirement must be non-empty.`);
    }
    if (requirementIds.has(id)) {
      issues.push(`Requirements table contains duplicate ID \`${id}\`.`);
    }
    if (id.length > 0) {
      requirementIds.add(id);
    }
  }

  return requirementIds;
}

function parseVerifies(value: string): string[] {
  return value.split(",").map(item => item.trim()).filter(Boolean);
}

function validateSuccessCriteria(lines: string[], requirementIds: Set<string>, issues: string[]): void {
  const dataRows = validateTableShape(lines, SUCCESS_CRITERIA_TABLE, issues);
  const criteriaIds = new Set<string>();

  if (dataRows.length === 0) {
    issues.push("Section `## Success Criteria` must contain at least one success criterion row like `SC1`.");
  }

  for (const row of dataRows) {
    const id = row.cells[0] ?? "";
    const verifies = row.cells[1] ?? "";
    const criterion = row.cells[2] ?? "";
    const evidence = row.cells[3] ?? "";

    if (!/^SC\d+$/.test(id)) {
      issues.push(`Success Criteria row ${row.rowNumber} ID must use \`SC#\` format.`);
    }
    if (criteriaIds.has(id)) {
      issues.push(`Success Criteria table contains duplicate ID \`${id}\`.`);
    }
    if (id.length > 0) {
      criteriaIds.add(id);
    }
    if (criterion.trim().length === 0) {
      issues.push(`Success Criteria row ${row.rowNumber} Criterion must be non-empty.`);
    }
    if (evidence.trim().length === 0) {
      issues.push(`Success Criteria row ${row.rowNumber} Evidence must be non-empty.`);
    } else if (!ALLOWED_EVIDENCE_TYPES.has(evidence.trim())) {
      issues.push(`Success Criteria row ${row.rowNumber} Evidence must be one of: unit, phase, full, review, manual, smoke.`);
    }

    const verifiedIds = parseVerifies(verifies);
    if (verifiedIds.length === 0) {
      issues.push(`Success Criteria row ${row.rowNumber} Verifies must reference at least one R#.`);
    }
    for (const reqId of verifiedIds) {
      if (!/^R\d+$/.test(reqId)) {
        issues.push(`Success Criteria row ${row.rowNumber} Verifies value \`${reqId}\` must use \`R#\` format.`);
      } else if (!requirementIds.has(reqId)) {
        issues.push(`Success Criteria row ${row.rowNumber} Verifies references unknown requirement \`${reqId}\`.`);
      }
    }
  }
}

export function validatePrdArtifact(filePath: string): string[] {
  if (!fs.existsSync(filePath)) {
    return ["prd.md does not exist."];
  }

  const content = normalizeLineEndings(fs.readFileSync(filePath, "utf-8"));
  const { issues, lines } = validateArtifactStructure(content, STRUCTURE_SPEC);

  validateIntent(lines, issues);
  const requirementIds = validateRequirements(lines, issues);
  validateSuccessCriteria(lines, requirementIds, issues);

  return issues;
}
