import * as fs from "fs";
import { headingName, sectionLines } from "../../shared/markdown/headings";
import { validateArtifactStructure, ArtifactStructureSpec } from "../artifact-structure";

const REQUIRED_SECTIONS = ["Task", "Short Specification", "Plan"];

const STRUCTURE_SPEC: ArtifactStructureSpec = {
  artifactName: "worklog.md",
  title: "Worklog",
  frontmatter: "optional",
  checkDeepHeadings: false,
  checkHtmlComments: true
};

export interface ValidateWorklogOptions {
  requireAllSections?: boolean;
  requireVerification?: boolean;
}

export function isWorklogEmpty(content: string): boolean {
  if (!content || content.trim().length === 0) return true;
  const stripped = content
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^#+\s.*$/gm, "")
    .replace(/^---\s*[\s\S]*?---\s*/m, "")
    .trim();
  return stripped.length === 0;
}

export function validateWorklogContent(content: string, options: ValidateWorklogOptions = {}): string[] {
  if (isWorklogEmpty(content)) {
    return ["worklog.md is missing or empty (contains only template placeholders)."];
  }

  const structure = validateArtifactStructure(content, STRUCTURE_SPEC);
  const issues = [...structure.issues];

  const actualSections = structure.lines
    .map(headingName)
    .filter((s): s is string => s !== null)
    .map(s => s.toLowerCase());

  if (!actualSections.includes("task")) {
    issues.push('worklog.md must contain section `## Task`.');
  }

  if (options.requireAllSections) {
    for (const req of REQUIRED_SECTIONS) {
      if (!actualSections.includes(req.toLowerCase())) {
        issues.push(`worklog.md must contain section \`## ${req}\`.`);
      }
    }
  }

  const sectionsToCheck = options.requireAllSections ? REQUIRED_SECTIONS : ["Task"];

  for (const section of sectionsToCheck) {
    if (actualSections.includes(section.toLowerCase())) {
      const lines = sectionLines(structure.lines, section, true);
      const textWithoutComments = lines
        .join("\n")
        .replace(/<!--[\s\S]*?-->/g, "")
        .trim();

      if (textWithoutComments.length === 0) {
        issues.push(`worklog.md section "## ${section}" is empty.`);
      }
    }
  }

  if (options.requireVerification) {
    if (!actualSections.includes("verification")) {
      issues.push('worklog.md requires a "## Verification" section with test execution evidence.');
    } else {
      const vLines = sectionLines(structure.lines, "Verification", true);
      const vText = vLines
        .join("\n")
        .replace(/<!--[\s\S]*?-->/g, "")
        .trim();

      if (vText.length === 0) {
        issues.push(`worklog.md section "## Verification" is empty.`);
      }
    }
  }

  return issues;
}

export function validateWorklogArtifact(filePath: string, options: ValidateWorklogOptions = {}): string[] {
  if (!fs.existsSync(filePath)) {
    return ["worklog.md is missing or empty."];
  }

  const content = fs.readFileSync(filePath, "utf-8");
  return validateWorklogContent(content, options);
}
