import * as fs from "fs";
import { normalizeLineEndings } from "../../shared/markdown/normalize-line-endings";
import { sectionLines } from "../../shared/markdown/headings";
import { validateArtifactStructure, validateTableShape, type ArtifactStructureSpec, type TableShapeSpec } from "../artifact-structure";

const REQUIRED_SECTIONS = ["Test Commands", "Constraints", "Verification Gates", "Manual Checks", "Environment Notes"];
const REQUIRED_COMMAND_KEYS = ["unit", "phase", "full"];
const TABLE_HEADERS = ["Gate", "Command"];

const STRUCTURE_SPEC: ArtifactStructureSpec = {
  artifactName: "execution_contract.md",
  title: "Rules",
  frontmatter: "required",
  checkDeepHeadings: true,
  checkHtmlComments: true,
  sections: {
    required: REQUIRED_SECTIONS,
    membershipCaseInsensitive: true,
    orderCaseInsensitive: false
  }
};

const TEST_COMMANDS_TABLE: TableShapeSpec = { section: "Test Commands", headers: TABLE_HEADERS, mode: "filtered", rowChecks: false };

function validateTestCommands(lines: string[], issues: string[]): void {
  const tableLines = sectionLines(lines, "Test Commands").filter(line => line.trim().startsWith("|"));
  if (tableLines.length === 0) {
    issues.push("Section `## Test Commands` must contain a markdown table.");
    return;
  }

  const dataRows = validateTableShape(lines, TEST_COMMANDS_TABLE, issues);
  const parsedRows: Array<{ key: string; value: string }> = [];
  for (const row of dataRows) {
    if (row.cells.length !== TABLE_HEADERS.length) {
      issues.push(`Test Commands row ${row.rowNumber} must have exactly ${TABLE_HEADERS.length} cells.`);
      continue;
    }
    const key = row.cells[0].toLowerCase();
    const value = row.cells[1].replace(/^`(.+)`$/, "$1").trim();
    parsedRows.push({ key, value });
    if (!REQUIRED_COMMAND_KEYS.includes(key)) {
      issues.push(`Test Commands gate \`${row.cells[0]}\` is not allowed; expected unit, phase, or full.`);
    }
    if (value.length === 0) {
      issues.push(`Test Commands command \`${row.cells[0]}\` must be non-empty.`);
    }
  }

  const actualKeys = parsedRows.map(row => row.key);
  if (actualKeys.length !== REQUIRED_COMMAND_KEYS.length || actualKeys.some((key, index) => key !== REQUIRED_COMMAND_KEYS[index])) {
    issues.push(`Test Commands must contain exactly these gates in order: ${REQUIRED_COMMAND_KEYS.map(key => `\`${key}\``).join(", ")}.`);
  }

  const seen = new Set<string>();
  for (const row of parsedRows) {
    if (seen.has(row.key)) {
      issues.push(`Test Commands contains duplicate gate \`${row.key}\`.`);
    }
    seen.add(row.key);
  }
}

export function validateRulesArtifact(filePath: string): string[] {
  if (!fs.existsSync(filePath)) {
    return ["execution_contract.md does not exist."];
  }

  const content = normalizeLineEndings(fs.readFileSync(filePath, "utf-8"));
  const { issues, lines } = validateArtifactStructure(content, STRUCTURE_SPEC);

  validateTestCommands(lines, issues);
  return issues;
}
