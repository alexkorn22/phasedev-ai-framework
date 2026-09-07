import { Iteration } from "../../entities/iteration-plan/types";
import { escapeMarkdownTableCell, isMarkdownTableSeparatorRow, splitMarkdownTableRow } from "../../shared/markdown/table";
import { runGit } from "../../shared/shell/git";

export interface ChangedFileInventoryOptions {
  phase?: Iteration;
  diffBase?: string;
}

export interface ChangeScanEntry {
  status: string;
  filePath: string;
}

export type ChangeScan =
  | { ok: true; entries: ChangeScanEntry[] }
  | { ok: false; reason: string };

function normalizeStatusPath(rawPath: string): string {
  const renameTarget = rawPath.includes(" -> ") ? rawPath.split(" -> ").pop() ?? rawPath : rawPath;
  return renameTarget.replace(/^"|"$/g, "").replace(/\\/g, "/").trim();
}

function parseGitStatusLine(line: string): ChangeScanEntry | null {
  if (line.trim().length === 0 || line.length < 4) {
    return null;
  }

  return {
    status: line.slice(0, 2).trim(),
    filePath: normalizeStatusPath(line.slice(3))
  };
}

function parseGitDiffLine(line: string): ChangeScanEntry | null {
  if (line.trim().length === 0) {
    return null;
  }

  const parts = line.split("\t");
  if (parts.length < 2) {
    return null;
  }

  return {
    status: parts[0].trim(),
    filePath: normalizeStatusPath(parts[parts.length - 1])
  };
}

export function scanChangedFilesOutsidePhasedev(projectPath: string): ChangeScan {
  const result = runGit(projectPath, ["status", "--short", "--untracked-files=all", "--", "."]);
  if (!result.ok) {
    const reason = result.errorMessage ?? (result.stderr.trim() || `git status exited with ${result.status}`);
    return { ok: false, reason };
  }

  const entries = result.stdout
    .split(/\r?\n/)
    .map(parseGitStatusLine)
    .filter((entry): entry is ChangeScanEntry => entry !== null)
    .filter(entry => !entry.filePath.startsWith(".phasedev/"));

  return { ok: true, entries };
}

function headingLevel(line: string): number | null {
  const match = line.match(/^(#{1,6})\s+/);
  return match?.[1]?.length ?? null;
}

function stripInlineCode(value: string): string {
  return value.trim().replace(/^`(.+)`$/, "$1").trim();
}

function splitSurfacePatterns(value: string): string[] {
  return value
    .split(/,\s*/)
    .map(stripInlineCode)
    .filter(pattern => pattern.length > 0);
}

function phaseExpectedSurfacePatterns(phase: Iteration): string[] {
  const lines = (phase.rawContent ?? "").split("\n");
  const headingIndex = lines.findIndex(line => /^###\s+Expected Change Surface\s*$/i.test(line.trim()));
  if (headingIndex === -1) {
    return [];
  }

  const boundaryIndex = lines.findIndex((line, index) => {
    const level = headingLevel(line.trim());
    return index > headingIndex && level !== null && level <= 3;
  });
  const sectionLines = lines.slice(headingIndex + 1, boundaryIndex === -1 ? lines.length : boundaryIndex);

  return sectionLines
    .filter(line => line.trim().startsWith("|"))
    .map(splitMarkdownTableRow)
    .filter(cells => cells.length > 0 && !isMarkdownTableSeparatorRow(cells))
    .slice(1)
    .flatMap(cells => splitSurfacePatterns(cells[0] ?? ""));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

export type SurfaceClassification = "expected" | "outside expected";

function classifyAgainstSurface(filePath: string, patterns: string[]): SurfaceClassification {
  if (patterns.length === 0) {
    return "outside expected";
  }
  return pathMatchesSurface(filePath, patterns) ? "expected" : "outside expected";
}

function renderClassifiedInventory(rows: ChangeScanEntry[], surfacePatterns: string[]): string {
  const classifiedRows = rows.map(entry => ({
    ...entry,
    classification: classifyAgainstSurface(entry.filePath, surfacePatterns)
  }));
  const expectedCount = classifiedRows.filter(entry => entry.classification === "expected").length;
  const outsideCount = classifiedRows.length - expectedCount;

  return [
    "## Controller Observed Changed Files",
    "",
    "Expected Change Surface rows are a forecast/traceability aid, not a hard allowlist. Every actual changed file is listed below and classified against the current iteration surface.",
    "",
    "| Status | Path | Surface |",
    "|---|---|---|",
    ...classifiedRows.map(entry =>
      `| ${escapeMarkdownTableCell(entry.status)} | ${escapeMarkdownTableCell(entry.filePath)} | ${entry.classification} |`
    ),
    "",
    `Summary: ${expectedCount} expected, ${outsideCount} outside expected (${classifiedRows.length} changed file(s) total).`
  ].join("\n");
}

function globToRegExp(pattern: string): RegExp {
  let expression = "^";
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index];
    if (char === "*" && pattern[index + 1] === "*") {
      expression += ".*";
      index++;
    } else if (char === "*") {
      expression += "[^/]*";
    } else if (char === "?") {
      expression += "[^/]";
    } else {
      expression += escapeRegExp(char);
    }
  }
  expression += "$";
  return new RegExp(expression);
}

export function pathMatchesSurface(filePath: string, patterns: string[]): boolean {
  return patterns.some(pattern => {
    if (/[*?[\]{}]/.test(pattern)) {
      return globToRegExp(pattern).test(filePath);
    }
    return filePath === pattern || filePath.startsWith(`${pattern.replace(/\/$/, "")}/`);
  });
}

const INVENTORY_UNAVAILABLE_BODY =
  "Build the changed-file inventory from read-only repository, filesystem, or manifest/output evidence before deciding the verdict; treat this as blocking only if the phase scope cannot be verified or the evidence is contradictory.";

function unavailableInventory(reason: string): string {
  return [
    "## Controller Observed Changed Files",
    "",
    `Inventory unavailable: ${reason}. ${INVENTORY_UNAVAILABLE_BODY}`
  ].join("\n");
}

export function renderChangedFileInventory(projectPath: string, options: ChangedFileInventoryOptions = {}): string {
  const scan = scanChangedFilesOutsidePhasedev(projectPath);
  if (!scan.ok) {
    return unavailableInventory(scan.reason);
  }

  let rows: ChangeScanEntry[] = scan.entries;

  if (options.diffBase) {
    const diff = runGit(projectPath, ["diff", "--name-status", options.diffBase, "HEAD", "--", "."]);
    if (!diff.ok) {
      const reason = diff.errorMessage ?? (diff.stderr.trim() || `git diff exited with ${diff.status}`);
      return unavailableInventory(reason);
    }

    const merged = new Map<string, ChangeScanEntry>();
    for (const entry of diff.stdout.split(/\r?\n/).map(parseGitDiffLine)) {
      if (entry && !entry.filePath.startsWith(".phasedev/")) {
        merged.set(entry.filePath, entry);
      }
    }
    for (const entry of scan.entries) {
      merged.set(entry.filePath, entry); // working tree overrides committed diff
    }
    rows = [...merged.values()];
  }

  if (rows.length === 0) {
    return [
      "## Controller Observed Changed Files",
      "",
      "No changed files outside .phasedev/** were observed by the controller. This is not automatically blocking: verify whether the current phase expected surfaces are generated, ignored, already committed, or otherwise provable through read-only filesystem or manifest/output evidence before deciding the verdict."
    ].join("\n");
  }

  if (options.phase) {
    const surfacePatterns = phaseExpectedSurfacePatterns(options.phase);
    return renderClassifiedInventory(rows, surfacePatterns);
  }

  return [
    "## Controller Observed Changed Files",
    "",
    "| Status | Path |",
    "|---|---|",
    ...rows.map(entry => `| ${escapeMarkdownTableCell(entry.status)} | ${escapeMarkdownTableCell(entry.filePath)} |`)
  ].join("\n");
}
