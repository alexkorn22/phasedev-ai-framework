import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { CommitLog, iterationDiffBase, readCommitLog } from "../../entities/change/flow-state";
import { ParsedReceiptScope } from "../../entities/execution-receipts/scope";
import { runGit } from "../../shared/shell/git";

const EMPTY_TREE_SHA = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

export interface DiffDigestEntry {
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

function collectCommittedChanges(projectPath: string, diffBase: string | null): Map<string, string> {
  const entries = new Map<string, string>();
  const base = diffBase ?? EMPTY_TREE_SHA;
  const result = runGit(projectPath, ["diff", "--name-status", `${base}..HEAD`, "--", "."]);
  if (!result.ok) {
    return entries;
  }
  for (const line of result.stdout.split(/\r?\n/)) {
    const parsed = parseNameStatusLine(line);
    if (!parsed || isPhasedevPath(parsed.filePath)) {
      continue;
    }
    entries.set(parsed.filePath, parsed.status);
  }
  return entries;
}

function collectWorkingTreeChanges(projectPath: string): Map<string, string> {
  const entries = new Map<string, string>();

  const unstaged = runGit(projectPath, ["diff", "--name-status", "--", "."]);
  if (unstaged.ok) {
    for (const line of unstaged.stdout.split(/\r?\n/)) {
      const parsed = parseNameStatusLine(line);
      if (!parsed || isPhasedevPath(parsed.filePath)) {
        continue;
      }
      entries.set(parsed.filePath, parsed.status);
    }
  }

  const staged = runGit(projectPath, ["diff", "--name-status", "--cached", "--", "."]);
  if (staged.ok) {
    for (const line of staged.stdout.split(/\r?\n/)) {
      const parsed = parseNameStatusLine(line);
      if (!parsed || isPhasedevPath(parsed.filePath)) {
        continue;
      }
      entries.set(parsed.filePath, parsed.status);
    }
  }

  const status = runGit(projectPath, ["status", "--short", "--untracked-files=all", "--", "."]);
  if (status.ok) {
    for (const line of status.stdout.split(/\r?\n/)) {
      const parsed = parseStatusLine(line);
      if (!parsed || isPhasedevPath(parsed.filePath)) {
        continue;
      }
      entries.set(parsed.filePath, parsed.status || "??");
    }
  }

  return entries;
}

function mergeStatusMaps(...maps: Map<string, string>[]): Map<string, string> {
  const merged = new Map<string, string>();
  for (const map of maps) {
    for (const [filePath, status] of map) {
      merged.set(filePath, status);
    }
  }
  return merged;
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
  const merged = mergeStatusMaps(
    collectCommittedChanges(projectPath, diffBase),
    collectWorkingTreeChanges(projectPath)
  );

  const entries: DiffDigestEntry[] = [];
  for (const [filePath, status] of merged) {
    entries.push({
      status,
      filePath,
      contentHash: contentHashForEntry(projectPath, filePath, status)
    });
  }

  entries.sort((left, right) => left.filePath.localeCompare(right.filePath));
  return entries;
}

export function computeDiffDigest(projectPath: string, diffBase: string | null): string {
  const entries = buildDiffDigestEntries(projectPath, diffBase);
  const canonical = entries
    .map(entry => `${entry.status}\t${entry.filePath}\t${entry.contentHash}`)
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
