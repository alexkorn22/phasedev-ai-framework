import * as fs from "fs";
import * as path from "path";
import { SYSTEM_DIR } from "../../entities/change/paths";
import { blankFencedCodeLines } from "../../shared/markdown/code-fences";

export interface LiveSpecLintResult {
  errors: string[];
  warnings: string[];
}

const DELTA_SECTION_HEADINGS = new Set([
  "## ADDED Requirements",
  "## MODIFIED Requirements",
  "## REMOVED Requirements",
  "## RENAMED Requirements"
]);

const RULE_C_EXEMPT_SECTIONS = new Set(["## REMOVED Requirements", "## RENAMED Requirements"]);

export function liveSpecsRootFor(archivePath: string): string | null {
  let current = path.resolve(archivePath);
  while (true) {
    if (path.basename(current) === SYSTEM_DIR) {
      return path.join(current, "specs");
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export function deltaSectionHeadings(content: string): Set<string> {
  const lines = blankFencedCodeLines(content.split(/\r?\n/));
  const sections = new Set<string>();
  for (const line of lines) {
    const trimmed = line.trim();
    if (DELTA_SECTION_HEADINGS.has(trimmed)) {
      sections.add(trimmed);
    }
  }
  return sections;
}

export function isRuleCExempt(sections: Set<string>): boolean {
  if (sections.size === 0) {
    return false;
  }
  return [...sections].every(section => RULE_C_EXEMPT_SECTIONS.has(section));
}

function lintLiveSpecContent(content: string, label: string): string[] {
  const problems: string[] = [];
  const lines = blankFencedCodeLines(content.split(/\r?\n/));
  let firstSectionHeading: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (DELTA_SECTION_HEADINGS.has(trimmed)) {
      problems.push(`${label}: delta heading "${trimmed}" must not appear in a live spec.`);
    }
    if (firstSectionHeading === null && trimmed.startsWith("## ")) {
      firstSectionHeading = trimmed;
    }
  }

  if (firstSectionHeading !== "## Purpose") {
    const found = firstSectionHeading ? ` (found "${firstSectionHeading}")` : "";
    problems.push(`${label}: first "##" heading must be "## Purpose"${found}.`);
  }

  return problems;
}

export function lintLiveSpecs(
  liveSpecsRoot: string,
  touchedCapabilities: Set<string>,
  ruleCExemptCapabilities: Set<string>
): LiveSpecLintResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const capability of [...touchedCapabilities].sort()) {
    if (ruleCExemptCapabilities.has(capability)) {
      continue;
    }
    if (!fs.existsSync(path.join(liveSpecsRoot, capability, "spec.md"))) {
      errors.push(
        `Live spec missing for capability with a delta in this archive: ${SYSTEM_DIR}/specs/${capability}/spec.md`
      );
    }
  }

  if (!fs.existsSync(liveSpecsRoot)) {
    return { errors, warnings };
  }

  for (const entry of fs.readdirSync(liveSpecsRoot).sort()) {
    const specPath = path.join(liveSpecsRoot, entry, "spec.md");
    if (!fs.existsSync(specPath)) {
      continue;
    }
    const problems = lintLiveSpecContent(fs.readFileSync(specPath, "utf-8"), `${entry}/spec.md`);
    if (touchedCapabilities.has(entry)) {
      errors.push(...problems);
    } else {
      warnings.push(...problems);
    }
  }

  return { errors, warnings };
}
