import { spawnSync } from "child_process";
import { Iteration } from "../../entities/iteration-plan/types";
import { isMarkdownTableSeparatorRow, splitMarkdownTableRow } from "../../shared/markdown/table";

export interface ChangedFileInventoryOptions {
  phase?: Iteration;
}

function escapeMarkdownTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

function normalizeStatusPath(rawPath: string): string {
  const renameTarget = rawPath.includes(" -> ") ? rawPath.split(" -> ").pop() ?? rawPath : rawPath;
  return renameTarget.replace(/^"|"$/g, "").replace(/\\/g, "/").trim();
}

function parseGitStatusLine(line: string): { status: string; filePath: string } | null {
  if (line.trim().length === 0 || line.length < 4) {
    return null;
  }

  return {
    status: line.slice(0, 2).trim(),
    filePath: normalizeStatusPath(line.slice(3))
  };
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

function pathMatchesSurface(filePath: string, patterns: string[]): boolean {
  return patterns.some(pattern => {
    if (/[*?[\]{}]/.test(pattern)) {
      return globToRegExp(pattern).test(filePath);
    }
    return filePath === pattern || filePath.startsWith(`${pattern.replace(/\/$/, "")}/`);
  });
}

export function renderChangedFileInventory(projectPath: string, options: ChangedFileInventoryOptions = {}): string {
  const result = spawnSync("git", ["-C", projectPath, "status", "--short", "--untracked-files=all", "--", "."], {
    encoding: "utf-8"
  });

  if (result.error || result.status !== 0) {
    const reason = result.error?.message || result.stderr.trim() || `git status exited with ${result.status}`;
    return [
      "## Controller Observed Changed Files",
      "",
      `Inventory unavailable: ${reason}. Build the changed-file inventory from read-only repository, filesystem, or manifest/output evidence before deciding the verdict; treat this as blocking only if the phase scope cannot be verified or the evidence is contradictory.`
    ].join("\n");
  }

  const rows = result.stdout
    .split(/\r?\n/)
    .map(parseGitStatusLine)
    .filter((entry): entry is { status: string; filePath: string } => entry !== null)
    .filter(entry => !entry.filePath.startsWith(".phasedev/"));

  if (rows.length === 0) {
    return [
      "## Controller Observed Changed Files",
      "",
      "No changed files outside .phasedev/** were observed by the controller. This is not automatically blocking: verify whether the current phase expected surfaces are generated, ignored, already committed, or otherwise provable through read-only filesystem or manifest/output evidence before deciding the verdict."
    ].join("\n");
  }

  if (options.phase) {
    const surfacePatterns = phaseExpectedSurfacePatterns(options.phase);
    const matchedRows = surfacePatterns.length > 0
      ? rows.filter(entry => pathMatchesSurface(entry.filePath, surfacePatterns))
      : rows;
    const outsideCount = rows.length - matchedRows.length;

    if (matchedRows.length === 0) {
      return [
        "## Controller Observed Changed Files",
        "",
        `No changed files outside .phasedev/** matched the current phase Expected Change Surface. ${outsideCount} changed file(s) outside the current phase surface were hidden from this phase-scoped inventory; use read-only repository evidence only if scope evidence is contradictory.`
      ].join("\n");
    }

    return [
      "## Controller Observed Changed Files",
      "",
      "| Status | Path |",
      "|---|---|",
      ...matchedRows.map(entry => `| ${escapeMarkdownTableCell(entry.status)} | ${escapeMarkdownTableCell(entry.filePath)} |`),
      ...(outsideCount > 0 ? [
        "",
        `${outsideCount} changed file(s) outside the current phase Expected Change Surface were hidden from this phase-scoped inventory.`
      ] : [])
    ].join("\n");
  }

  return [
    "## Controller Observed Changed Files",
    "",
    "| Status | Path |",
    "|---|---|",
    ...rows.map(entry => `| ${escapeMarkdownTableCell(entry.status)} | ${escapeMarkdownTableCell(entry.filePath)} |`)
  ].join("\n");
}
