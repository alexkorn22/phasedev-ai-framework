import { createHash } from "crypto";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { iterationDiffBase, readCommitLog } from "../../entities/change/flow-state";
import { ParsedReceiptScope } from "../../entities/execution-receipts/scope";
import { runGit } from "../../shared/shell/git";

const EMPTY_TREE_SHA = "4b825dc642cb6eb6a060e54bf8d69288fbee4904";

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

function hashBytes(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function hashLiteral(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function readPathMetadata(projectPath: string, filePath: string): { kind: "missing" } | { kind: "deleted" } | { kind: "symlink"; target: string } | { kind: "file"; bytes: Buffer } {
  const absolute = path.join(projectPath, filePath);
  if (!fs.existsSync(absolute)) {
    return { kind: "missing" };
  }

  const stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink()) {
    return { kind: "symlink", target: fs.readlinkSync(absolute) };
  }
  if (stat.isDirectory()) {
    return { kind: "missing" };
  }
  return { kind: "file", bytes: fs.readFileSync(absolute) };
}

function digestPathContent(metadata: ReturnType<typeof readPathMetadata>): string {
  switch (metadata.kind) {
    case "missing":
      return hashLiteral("MISSING");
    case "deleted":
      return hashLiteral("DELETED");
    case "symlink":
      return hashLiteral(`SYMLINK:${metadata.target}`);
    case "file":
      return hashBytes(metadata.bytes);
  }
}

function gitShowBytes(projectPath: string, objectRef: string, filePath: string): Buffer | null {
  const result = spawnSync(
    "git",
    ["-C", projectPath, "show", `${objectRef}:${filePath}`],
    { encoding: "buffer", maxBuffer: 16 * 1024 * 1024 }
  );
  if (result.status !== 0 || result.stdout === undefined || result.stdout.length === 0) {
    return null;
  }
  return Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout);
}

function deletedObjectRef(layer: DiffDigestEntry["layer"], diffBase: string): string {
  if (layer === "committed") {
    return diffBase;
  }
  return "HEAD";
}

function contentHashForEntry(
  projectPath: string,
  filePath: string,
  status: string,
  layer: DiffDigestEntry["layer"],
  diffBase: string
): string {
  if (status.startsWith("D") || status === "D") {
    const bytes = gitShowBytes(projectPath, deletedObjectRef(layer, diffBase), filePath);
    if (bytes !== null) {
      return hashBytes(bytes);
    }
    return hashLiteral("DELETED");
  }

  const working = readPathMetadata(projectPath, filePath);
  if (working.kind === "file" || working.kind === "symlink") {
    return digestPathContent(working);
  }

  const headBytes = gitShowBytes(projectPath, "HEAD", filePath);
  if (headBytes !== null) {
    return hashBytes(headBytes);
  }

  return hashLiteral("MISSING");
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

function collectNameStatusEntries(
  projectPath: string,
  args: string[],
  layer: DiffDigestEntry["layer"],
  diffBase: string
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
      contentHash: contentHashForEntry(projectPath, entry.filePath, entry.status, layer, diffBase)
    }));
}

function collectUntrackedEntries(projectPath: string, diffBase: string): DiffDigestEntry[] {
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
      contentHash: contentHashForEntry(projectPath, filePath, "??", "untracked", diffBase)
    }));
}

export function buildDiffDigestEntries(
  projectPath: string,
  diffBase: string | null
): DiffDigestEntry[] {
  const base = diffBase ?? EMPTY_TREE_SHA;
  const entries = [
    ...collectNameStatusEntries(projectPath, ["diff", "--name-status", `${base}..HEAD`, "--", "."], "committed", base),
    ...collectNameStatusEntries(projectPath, ["diff", "--name-status", "--cached", "HEAD", "--", "."], "staged", base),
    ...collectNameStatusEntries(projectPath, ["diff", "--name-status", "HEAD", "--", "."], "unstaged", base),
    ...collectUntrackedEntries(projectPath, base)
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
