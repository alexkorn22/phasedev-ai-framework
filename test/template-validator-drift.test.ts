import { describe, test, expect, beforeAll } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const repoRoot = path.resolve(__dirname, "..");

// ----- helpers -----

/**
 * Parse a TypeScript `const NAME = ["a", "b"]` array (single- or multi-line).
 */
function parseStringArray(content: string, varName: string): string[] {
  const re = new RegExp(`const ${varName}\\s*=\\s*\\[([^\\]]+)\\]`);
  const match = content.match(re);
  if (!match) throw new Error(`Could not find ${varName} array declaration`);
  const items: string[] = [];
  for (const m of match[1].matchAll(/"([^"]+)"/g)) {
    items.push(m[1]);
  }
  return items;
}

/**
 * Return all `## Heading` values from a markdown document.
 */
function extractHeadings(content: string): string[] {
  const headings: string[] = [];
  for (const match of content.matchAll(/^## (.+)$/gm)) {
    headings.push(match[1]);
  }
  return headings;
}

/**
 * Return the first line in `content` that includes `substring`.
 */
function findLine(content: string, substring: string): string {
  const line = content.split("\n").find((l) => l.includes(substring));
  if (!line) throw new Error(`Could not find line containing "${substring}"`);
  return line;
}

/**
 * Extract the first column of every table data row under a given ## section.
 * Skips the header row and the `|---|---|` separator row.
 */
function extractTableFirstColumn(content: string, sectionHeading: string): string[] {
  const lines = content.split("\n");
  let inSection = false;
  let separatorSeen = false;
  const fields: string[] = [];

  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (inSection) break; // reached next section
      if (line.includes(sectionHeading)) {
        inSection = true;
      }
      continue;
    }

    if (inSection) {
      if (line.includes("---")) {
        separatorSeen = true;
        continue;
      }
      const match = line.match(/^\| ([^|]+) \|/);
      if (match && separatorSeen) {
        fields.push(match[1].trim());
      }
    }
  }

  return fields;
}

// ----- file paths -----

const validateResearchPath = path.join(repoRoot, "src", "entities", "research-facts", "validate-research.ts");
const validateRulesPath = path.join(repoRoot, "src", "entities", "rules", "validate-rules.ts");
const researchFactsTemplatePath = path.join(repoRoot, "templates", "artifacts", "research_facts.md");
const phase1ChangeIntakePath = path.join(repoRoot, "templates", "phase1_change_intake.md");

// ----- shared content loaded once -----

let validatorResearchContent: string;
let validatorRulesContent: string;
let researchTemplateContent: string;
let intakeTemplateContent: string;

beforeAll(() => {
  validatorResearchContent = fs.readFileSync(validateResearchPath, "utf-8");
  validatorRulesContent = fs.readFileSync(validateRulesPath, "utf-8");
  researchTemplateContent = fs.readFileSync(researchFactsTemplatePath, "utf-8");
  intakeTemplateContent = fs.readFileSync(phase1ChangeIntakePath, "utf-8");
});

// ----- tests -----

describe("template ↔ validator drift", () => {
  test("PRD_ONLY_INTENT_FIELDS match template prd-only comment", () => {
    const fields = parseStringArray(validatorResearchContent, "PRD_ONLY_INTENT_FIELDS");
    expect(fields.length).toBeGreaterThan(0);

    const prdOnlyLine = findLine(researchTemplateContent, "allowed only for");
    for (const field of fields) {
      expect(prdOnlyLine).toContain(`\`${field}\``);
    }
  });

  test("execution_contract REQUIRED_SECTIONS match template", () => {
    const requiredSections = parseStringArray(validatorRulesContent, "REQUIRED_SECTIONS");
    expect(requiredSections.length).toBeGreaterThan(0);

    const sectionsLine = findLine(intakeTemplateContent, "five sections");
    for (const section of requiredSections) {
      expect(sectionsLine).toContain(section);
    }
  });

  test("research_facts REQUIRED_SECTIONS match template headings", () => {
    const requiredSections = parseStringArray(validatorResearchContent, "REQUIRED_SECTIONS");
    expect(requiredSections.length).toBeGreaterThan(0);

    const headings = extractHeadings(researchTemplateContent);
    expect(headings.length).toBeGreaterThan(0);

    for (const section of requiredSections) {
      expect(headings).toContain(section);
    }
  });

  test("REQUIRED_COMMAND_KEYS match template", () => {
    const commandKeys = parseStringArray(validatorRulesContent, "REQUIRED_COMMAND_KEYS");
    expect(commandKeys.length).toBeGreaterThan(0);

    const gatesLine = findLine(intakeTemplateContent, "gate commands for");
    for (const key of commandKeys) {
      expect(gatesLine).toContain(`\`${key}\``);
    }
  });

  test("research_facts INTENT_FIELDS match template table rows", () => {
    const intentFields = parseStringArray(validatorResearchContent, "INTENT_FIELDS");
    expect(intentFields.length).toBeGreaterThan(0);

    const tableFields = extractTableFirstColumn(researchTemplateContent, "PRD Intent Trace");
    expect(tableFields.length).toBeGreaterThan(0);

    for (const field of intentFields) {
      expect(tableFields).toContain(field);
    }
  });
});
