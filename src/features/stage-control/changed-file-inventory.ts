import { spawnSync } from "child_process";

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

export function renderChangedFileInventory(projectPath: string): string {
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

  return [
    "## Controller Observed Changed Files",
    "",
    "| Status | Path |",
    "|---|---|",
    ...rows.map(entry => `| ${escapeMarkdownTableCell(entry.status)} | ${escapeMarkdownTableCell(entry.filePath)} |`)
  ].join("\n");
}
