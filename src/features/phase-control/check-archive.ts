import * as fs from "fs";
import * as path from "path";
import { archiveDirectories, FLOW_ARCHIVE_STATE_FILE, readArchiveState, validateArchiveStateFile } from "../../entities/change/archive-state";
import { FLOW_STATE_FILE } from "../../entities/change/flow-state";
import { deltaSectionHeadings, isRuleCExempt, lintLiveSpecs, liveSpecsRootFor } from "./live-spec-lint";

export interface ArchiveCheckResult {
  ok: boolean;
  message: string;
  issues: string[];
  warnings: string[];
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
  const result = validateArchiveStateFile(archivePath, { requireCompleted: true });
  issues.push(...result.issues);

  return { changeName: result.state?.changeName ?? null };
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
        issues.push(`${relativeFile} contains unsupported delta spec section heading: ${line}`);
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
    issues.push(`${relativeFile} must include at least one delta spec requirements section.`);
  }
}

export function findOrphanedArchiveDirectories(projectPath: string): string[] {
  const orphans: string[] = [];

  for (const archivePath of archiveDirectories(projectPath)) {
    // An in_progress archive that has a live state.json (activePhase === "archive")
    // is the currently-tracked archive — not an orphan.
    const flowStatePath = path.join(archivePath, FLOW_STATE_FILE);
    if (fs.existsSync(flowStatePath)) {
      try {
        const flowStateRaw = JSON.parse(fs.readFileSync(flowStatePath, "utf-8"));
        if (flowStateRaw?.activePhase === "archive") {
          continue; // Actively tracked archive — skip
        }
      } catch {
        // Malformed state.json — fall through to normal orphan check
      }
    }

    const statePath = path.join(archivePath, FLOW_ARCHIVE_STATE_FILE);
    if (!fs.existsSync(statePath)) {
      orphans.push(`${archivePath}: orphan, no archive state (${FLOW_ARCHIVE_STATE_FILE} missing).`);
      continue;
    }

    const state = readArchiveState(archivePath);
    if (state && state.status !== "completed") {
      orphans.push(`${archivePath}: archive still in_progress (started ${state.startedAt}).`);
    }
  }

  return orphans;
}

export function checkArchiveCompletion(archivePath: string | undefined): ArchiveCheckResult {
  const issues: string[] = [];
  const archiveStat = archivePath ? fs.statSync(archivePath, { throwIfNoEntry: false }) : undefined;

  if (!archivePath) {
    issues.push("check-archive requires --archive-path <path>.");
  } else if (!archiveStat) {
    issues.push(`Archive path does not exist: ${archivePath}`);
  } else if (!archiveStat.isDirectory()) {
    issues.push(`Archive path must be a directory: ${archivePath}`);
  }

  let changeName: string | null = null;
  let warnings: string[] = [];
  if (archivePath && archiveStat?.isDirectory()) {
    changeName = validateArchiveState(archivePath, issues).changeName;

    const specsPath = path.join(archivePath, "specs");
    const specsStat = fs.statSync(specsPath, { throwIfNoEntry: false });
    if (specsStat && !specsStat.isDirectory()) {
      issues.push(`Archive specs path must be a directory when present: ${specsPath}`);
    } else {
      const touchedCapabilities = new Set<string>();
      const ruleCExemptCapabilities = new Set<string>();

      for (const relativeFile of relativeSpecFiles(specsPath)) {
        validateSpecPath(relativeFile, changeName, issues);
        if (relativeFile.endsWith("/spec.md")) {
          validateSpecContent(specsPath, relativeFile, issues);

          const capability = relativeFile.split("/")[0];
          touchedCapabilities.add(capability);
          const sections = deltaSectionHeadings(fs.readFileSync(path.join(specsPath, relativeFile), "utf-8"));
          if (isRuleCExempt(sections)) {
            ruleCExemptCapabilities.add(capability);
          }
        }
      }

      const liveSpecsRoot = liveSpecsRootFor(archivePath);
      if (liveSpecsRoot) {
        const lint = lintLiveSpecs(liveSpecsRoot, touchedCapabilities, ruleCExemptCapabilities);
        issues.push(...lint.errors);
        warnings = lint.warnings;
      }
    }
  }

  if (issues.length > 0) {
    return {
      ok: false,
      issues,
      warnings,
      message: [
        "[FLOW ARCHIVE CHECK] FAILED: archive is incomplete.",
        ...issues.map(issue => `- ${issue}`)
      ].join("\n")
    };
  }

  return {
    ok: true,
    issues: [],
    warnings,
    message: "[FLOW ARCHIVE CHECK] OK: archive is complete."
  };
}
