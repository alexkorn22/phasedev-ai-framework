import * as fs from "fs";
import * as path from "path";
import { FLOW_ARCHIVE_STATE_FILE } from "../../entities/flow-change/archive-state";

export interface ArchiveCheckResult {
  ok: boolean;
  message: string;
  issues: string[];
}

const ALLOWED_SECTION_HEADINGS = new Set([
  "## ADDED Requirements",
  "## MODIFIED Requirements",
  "## REMOVED Requirements",
  "## RENAMED Requirements"
]);

const CATCH_ALL_CAPABILITIES = new Set([
  "specification",
  "specifications",
  "spec",
  "change",
  "changes",
  "archive",
  "archives"
]);

const PLACEHOLDER_PATTERN = /\b(?:TBD|TODO|unknown|clarify later|to be decided)\b/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedPath(value: string): string {
  return path.resolve(value);
}

function relativeSpecFiles(specsPath: string): string[] {
  if (!fs.existsSync(specsPath)) {
    return [];
  }

  const files: string[] = [];

  function visit(directory: string): void {
    for (const item of fs.readdirSync(directory)) {
      const itemPath = path.join(directory, item);
      const stat = fs.statSync(itemPath);
      if (stat.isDirectory()) {
        visit(itemPath);
      } else if (stat.isFile()) {
        files.push(path.relative(specsPath, itemPath).replace(/\\/g, "/"));
      }
    }
  }

  visit(specsPath);
  return files.sort();
}

function validateArchiveState(archivePath: string, issues: string[]): { changeName: string | null } {
  const statePath = path.join(archivePath, FLOW_ARCHIVE_STATE_FILE);
  if (!fs.existsSync(statePath)) {
    issues.push(`${FLOW_ARCHIVE_STATE_FILE} is missing.`);
    return { changeName: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(statePath, "utf-8"));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Invalid JSON.";
    issues.push(`${FLOW_ARCHIVE_STATE_FILE} is not valid JSON: ${message}`);
    return { changeName: null };
  }

  if (!isRecord(parsed)) {
    issues.push(`${FLOW_ARCHIVE_STATE_FILE} must be a JSON object.`);
    return { changeName: null };
  }

  if (parsed.status !== "completed") {
    issues.push(`${FLOW_ARCHIVE_STATE_FILE} status must be "completed".`);
  }

  if (typeof parsed.completedAt !== "string" || parsed.completedAt.trim() === "") {
    issues.push(`${FLOW_ARCHIVE_STATE_FILE} must include completedAt as a non-empty string.`);
  }

  if (typeof parsed.changeName !== "string" || parsed.changeName.trim() === "") {
    issues.push(`${FLOW_ARCHIVE_STATE_FILE} must include changeName as a non-empty string.`);
  }

  if (typeof parsed.archivePath === "string" && normalizedPath(parsed.archivePath) !== normalizedPath(archivePath)) {
    issues.push(`${FLOW_ARCHIVE_STATE_FILE} archivePath must match --archive-path.`);
  }

  return { changeName: typeof parsed.changeName === "string" ? parsed.changeName : null };
}

function validateSpecPath(relativeFile: string, changeName: string | null, issues: string[]): void {
  const parts = relativeFile.split("/");
  if (parts.length !== 2 || parts[1] !== "spec.md") {
    issues.push(`Delta spec path must be specs/<capability>/spec.md: specs/${relativeFile}`);
    return;
  }

  const capability = parts[0];
  const normalizedCapability = capability.toLowerCase();
  if (CATCH_ALL_CAPABILITIES.has(normalizedCapability) || normalizedCapability === changeName?.toLowerCase()) {
    issues.push(`Capability name is too generic for delta spec: ${capability}`);
  }
}

function validateRequirementBody(
  relativeFile: string,
  sectionHeading: string | null,
  requirementHeading: string,
  bodyLines: string[],
  issues: string[]
): void {
  if (sectionHeading !== "## ADDED Requirements" && sectionHeading !== "## MODIFIED Requirements") {
    return;
  }

  const body = bodyLines.join("\n");
  if (!/\b(?:SHALL|MUST)\b/.test(body)) {
    issues.push(`${relativeFile} ${requirementHeading} under ${sectionHeading} must include normative SHALL or MUST text.`);
  }
}

function validateSpecContent(specsPath: string, relativeFile: string, issues: string[]): void {
  const filePath = path.join(specsPath, relativeFile);
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/);
  let currentSection: string | null = null;
  let currentRequirement: { heading: string; section: string | null; body: string[] } | null = null;
  let hasAllowedSection = false;

  if (PLACEHOLDER_PATTERN.test(content)) {
    issues.push(`${relativeFile} contains unresolved placeholder-like prose.`);
  }

  function flushRequirement(): void {
    if (!currentRequirement) {
      return;
    }
    validateRequirementBody(
      relativeFile,
      currentRequirement.section,
      currentRequirement.heading,
      currentRequirement.body,
      issues
    );
    currentRequirement = null;
  }

  for (const line of lines) {
    if (line.startsWith("## ")) {
      flushRequirement();
      if (!ALLOWED_SECTION_HEADINGS.has(line)) {
        issues.push(`${relativeFile} contains unsupported OpenSpec section heading: ${line}`);
      } else {
        hasAllowedSection = true;
        currentSection = line;
      }
      continue;
    }

    if (line.startsWith("### ")) {
      flushRequirement();
      if (!line.startsWith("### Requirement: ")) {
        issues.push(`${relativeFile} requirement headings must start with "### Requirement: ": ${line}`);
      }
      currentRequirement = { heading: line, section: currentSection, body: [] };
      continue;
    }

    if (line.startsWith("#### ")) {
      if (!line.startsWith("#### Scenario: ")) {
        issues.push(`${relativeFile} scenario headings must start with "#### Scenario: ": ${line}`);
      }
    }

    if (currentRequirement) {
      currentRequirement.body.push(line);
    }
  }

  flushRequirement();

  if (!hasAllowedSection) {
    issues.push(`${relativeFile} must include at least one OpenSpec requirements section.`);
  }
}

export function checkArchiveCompletion(archivePath: string | undefined): ArchiveCheckResult {
  const issues: string[] = [];

  if (!archivePath) {
    issues.push("check-archive requires --archive-path <path>.");
  } else if (!fs.existsSync(archivePath)) {
    issues.push(`Archive path does not exist: ${archivePath}`);
  } else if (!fs.statSync(archivePath).isDirectory()) {
    issues.push(`Archive path must be a directory: ${archivePath}`);
  }

  let changeName: string | null = null;
  if (archivePath && fs.existsSync(archivePath) && fs.statSync(archivePath).isDirectory()) {
    changeName = validateArchiveState(archivePath, issues).changeName;

    const specsPath = path.join(archivePath, "specs");
    if (fs.existsSync(specsPath) && !fs.statSync(specsPath).isDirectory()) {
      issues.push(`Archive specs path must be a directory when present: ${specsPath}`);
    } else {
      for (const relativeFile of relativeSpecFiles(specsPath)) {
        validateSpecPath(relativeFile, changeName, issues);
        if (relativeFile.endsWith("/spec.md")) {
          validateSpecContent(specsPath, relativeFile, issues);
        }
      }
    }
  }

  if (issues.length > 0) {
    return {
      ok: false,
      issues,
      message: [
        "[FLOW ARCHIVE CHECK] FAILED: archive is incomplete.",
        ...issues.map(issue => `- ${issue}`)
      ].join("\n")
    };
  }

  return {
    ok: true,
    issues: [],
    message: "[FLOW ARCHIVE CHECK] OK: archive is complete."
  };
}
