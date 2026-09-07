import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { CommitLog, iterationDiffBase, readCommitLog } from "../../entities/change/flow-state";
import { ParsedReceiptScope } from "../../entities/execution-receipts/scope";
import { runGit } from "../../shared/shell/git";

const EMPTY_TREE_SHA = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

export interface DiffDigestEntry {
  layer: "committed" | "staged" | "unstaged" | "untracked";
  status: string;
  filePath: string;
  contentHash: string;
}

function normalizePath(rawPath: string): string {
  const renameTarget = rawPath.includes(" -> ") ? rawPath.split(" -> ").pop() ?? rawPath : rawPath;
  return renameTarget.replace(/^"|"$/g, "").replace(/\\/g, "/").trim();
}

function isPhasedevPath(filePath: string): boolean {
  return filePath === ".phasedev" || filePath.startsWith(".phasedev/");
}

function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function readWorkingTreeFile(projectPath: string, filePath: string): string | null {
  const absolute = path.join(projectPath, filePath);
  if (!fs.existsSync(absolute) || fs.statSync(absolute).isDirectory()) {
    return null;
  }
  return fs.readFileSync(absolute, "utf-8");
}

function gitShowFile(projectPath: string, objectRef: string, filePath: string): string | null {
  const result = runGit(projectPath, ["show", `${objectRef}:${filePath}`]);
  if (!result.ok) {
    return null;
  }
  return result.stdout;
}

function parseNameStatusLine(line: string): { status: string; filePath: string } | null {
  if (line.trim().length === 0) {
    return null;
  }
  const parts = line.split("\t");
  if (parts.length < 2) {
    return null;
  }
  const status = parts[0].trim();
  const filePath = normalizePath(parts[parts.length - 1]);
  return { status, filePath };
}

function parseStatusLine(line: string): { status: string; filePath: string } | null {
  if (line.trim().length === 0 || line.length < 4) {
    return null;
  }
  return {
    status: line.slice(0, 2).trim(),
    filePath: normalizePath(line.slice(3))
  };
}

function collectNameStatusEntries(
  projectPath: string,
  args: string[],
  layer: DiffDigestEntry["layer"]
): DiffDigestEntry[] {
  const result = runGit(projectPath, args);
  if (!result.ok) {
    return [];
  }

  return result.stdout
    .split(/\r?\n/)
    .map(parseNameStatusLine)
    .filter((entry): entry is { status: string; filePath: string } => entry !== null)
    .filter(entry => !isPhasedevPath(entry.filePath))
    .map(entry => ({
      layer,
      status: entry.status,
      filePath: entry.filePath,
      contentHash: contentHashForEntry(projectPath, entry.filePath, entry.status)
    }));
}

function collectUntrackedEntries(projectPath: string): DiffDigestEntry[] {
  const result = runGit(projectPath, ["ls-files", "--others", "--exclude-standard", "--", "."]);
  if (!result.ok) {
    return [];
  }

  return result.stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !isPhasedevPath(line))
    .map(filePath => ({
      layer: "untracked" as const,
      status: "??",
      filePath: normalizePath(filePath),
      contentHash: contentHashForEntry(projectPath, filePath, "??")
    }));
}

function contentHashForEntry(
  projectPath: string,
  filePath: string,
  status: string
): string {
  if (status.startsWith("D") || status === "D") {
    return hashContent("DELETED");
  }

  const working = readWorkingTreeFile(projectPath, filePath);
  if (working !== null) {
    return hashContent(working);
  }

  const head = gitShowFile(projectPath, "HEAD", filePath);
  if (head !== null) {
    return hashContent(head);
  }

  return hashContent("MISSING");
}

export function buildDiffDigestEntries(
  projectPath: string,
  diffBase: string | null
): DiffDigestEntry[] {
  const base = diffBase ?? EMPTY_TREE_SHA;
  const entries = [
    ...collectNameStatusEntries(projectPath, ["diff", "--name-status", `${base}..HEAD`, "--", "."], "committed"),
    ...collectNameStatusEntries(projectPath, ["diff", "--name-status", "--cached", "HEAD", "--", "."], "staged"),
    ...collectNameStatusEntries(projectPath, ["diff", "--name-status", "HEAD", "--", "."], "unstaged"),
    ...collectUntrackedEntries(projectPath)
  ];

  entries.sort((left, right) => {
    const pathCompare = left.filePath.localeCompare(right.filePath);
    if (pathCompare !== 0) {
      return pathCompare;
    }
    return left.layer.localeCompare(right.layer);
  });

  return entries;
}

export function computeDiffDigest(projectPath: string, diffBase: string | null): string {
  const canonical = buildDiffDigestEntries(projectPath, diffBase)
    .map(entry => `${entry.layer}\t${entry.status}\t${entry.filePath}\t${entry.contentHash}`)
    .join("\n");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function resolveScopeDiffBase(
  statePath: string,
  scope: ParsedReceiptScope
): string | null {
  const log = readCommitLog(statePath);
  if (!log) {
    return null;
  }
  if (scope.kind === "final") {
    return log.start;
  }
  return iterationDiffBase(log, scope.iterationId);
}
