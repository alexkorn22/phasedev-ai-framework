import { blankFencedCodeLines } from "../../shared/markdown/code-fences";
import {
  bodyAfterFrontmatter,
  deepHeadingName,
  headingName,
  topLevelHeadingName
} from "../../shared/markdown/headings";

export const BLOCKED_PLACEHOLDERS = [
  { pattern: /\bTBD\b/i, label: "TBD" },
  { pattern: /\bTODO\b/i, label: "TODO" },
  { pattern: /\bunknown\b/i, label: "unknown" },
  { pattern: /\bclarify later\b/i, label: "clarify later" },
  { pattern: /\bto be decided\b/i, label: "to be decided" }
];

/**
 * Required-section policy shared by artifacts with a fixed `##` outline.
 *
 * `membershipCaseInsensitive` governs the presence/unexpected checks;
 * `orderCaseInsensitive` governs the exact-order check. They are separate
 * because some artifacts (execution_contract, research_facts) intentionally
 * differ in how strictly heading case is enforced across the two checks.
 */
export interface SectionPolicy {
  required: string[];
  optional?: string[];
  mustBeLastIfPresent?: string[];
  membershipCaseInsensitive: boolean;
  orderCaseInsensitive: boolean;
}

export interface ArtifactStructureSpec {
  artifactName: string;
  title: string;
  frontmatter: "required" | "optional";
  checkDeepHeadings: boolean;
  checkHtmlComments: boolean;
  sections?: SectionPolicy;
}

export interface ArtifactStructure {
  issues: string[];
  body: string;
  hasFrontmatter: boolean;
  rawLines: string[];
  lines: string[];
  sections: string[];
}

export function validateArtifactStructure(content: string, spec: ArtifactStructureSpec): ArtifactStructure {
  const { body, hasFrontmatter } = bodyAfterFrontmatter(content);
  const rawLines = body.split("\n");
  const lines = blankFencedCodeLines(rawLines);
  const issues: string[] = [];
  const name = spec.artifactName;

  if (spec.frontmatter === "required" && !hasFrontmatter) {
    issues.push(`${name} must start with YAML frontmatter.`);
  }

  if (spec.checkHtmlComments && /<!--[\s\S]*?-->/.test(lines.join("\n"))) {
    issues.push(`${name} must not contain HTML template comments.`);
  }

  const blanked = lines.join("\n");
  for (const placeholder of BLOCKED_PLACEHOLDERS) {
    if (placeholder.pattern.test(blanked)) {
      issues.push(`${name} must not contain placeholder text: ${placeholder.label}.`);
    }
  }

  const topLevelHeadings = lines.map(topLevelHeadingName).filter((heading): heading is string => heading !== null);
  if (topLevelHeadings.length !== 1 || topLevelHeadings[0] !== spec.title) {
    issues.push(`${name} must contain exactly one top-level heading: \`# ${spec.title}\`.`);
  }

  if (spec.checkDeepHeadings) {
    for (const line of lines) {
      if (deepHeadingName(line)) {
        issues.push(`${name} must not contain headings deeper than \`##\`: \`${line.trim()}\`.`);
      }
    }
  }

  const sections = lines.map(headingName).filter((section): section is string => section !== null);
  if (spec.sections) {
    validateSectionPolicy(name, sections, spec.sections, issues);
  }

  return { issues, body, hasFrontmatter, rawLines, lines, sections };
}

function validateSectionPolicy(name: string, actual: string[], policy: SectionPolicy, issues: string[]): void {
  const membershipEquals = policy.membershipCaseInsensitive
    ? (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
    : (a: string, b: string) => a === b;
  const allowedSections = [...policy.required, ...(policy.optional ?? [])];
  const hasOptionalSections = (policy.optional?.length ?? 0) > 0;

  for (const section of policy.required) {
    if (!actual.some(candidate => membershipEquals(candidate, section))) {
      issues.push(`${name} must contain section \`## ${section}\`.`);
    }
  }

  for (const section of actual) {
    if (!allowedSections.some(allowed => membershipEquals(allowed, section))) {
      issues.push(`${name} contains unexpected section \`## ${section}\`.`);
    }
  }

  const normalize = (value: string): string => (policy.orderCaseInsensitive ? value.toLowerCase() : value);

  if (hasOptionalSections) {
    const requiredInActual = actual
      .filter(section => policy.required.some(required => membershipEquals(required, section)))
      .map(normalize);
    const requiredOrder = policy.required.map(normalize);
    if (
      requiredInActual.length !== requiredOrder.length ||
      requiredInActual.some((section, index) => section !== requiredOrder[index])
    ) {
      issues.push(
        `${name} required \`##\` sections must appear in this order: ${policy.required.map(section => `\`## ${section}\``).join(", ")}.`
      );
    }

    for (const section of policy.mustBeLastIfPresent ?? []) {
      const sectionIndex = actual.findIndex(candidate => membershipEquals(candidate, section));
      if (sectionIndex !== -1 && sectionIndex !== actual.length - 1) {
        issues.push(`${name} section \`## ${section}\` must be the last \`##\` section when present.`);
      }
    }
    return;
  }

  const actualOrder = actual.map(normalize);
  const requiredOrder = policy.required.map(normalize);
  if (actualOrder.length !== requiredOrder.length || actualOrder.some((section, index) => section !== requiredOrder[index])) {
    issues.push(`${name} \`##\` sections must exactly match this order: ${policy.required.map(section => `\`## ${section}\``).join(", ")}.`);
  }
}
