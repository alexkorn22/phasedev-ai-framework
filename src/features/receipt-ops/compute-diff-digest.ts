import { createHash } from "crypto";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { iterationDiffBase, readCommitLog } from "../../entities/change/flow-state";
import { ParsedReceiptScope } from "../../entities/execution-receipts/scope";
import { runGit, isGitRepo } from "../../shared/shell/git";

const SHA_PATTERN = /^[0-9a-f]{40}$/;

export class DiffDigestError extends Error {
  readonly kind = "diff_digest_error";

  constructor(message: string) {
    super(message);
    this.name = "DiffDigestError";
  }
}

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

function repoHasHead(projectPath: string): boolean {
  const result = runGit(projectPath, ["rev-parse", "--verify", "HEAD"]);
  return result.ok;
}

function assertGitOk(result: ReturnType<typeof runGit>, commandLabel: string): void {
  if (!result.ok) {
    throw new DiffDigestError(
      `Diff digest blocked: ${commandLabel} failed (${result.failureReason ?? "unknown git error"}).`
    );
  }
}

function collectNameStatusEntries(
  projectPath: string,
  args: string[],
  layer: DiffDigestEntry["layer"],
  diffBase: string,
  commandLabel: string
): DiffDigestEntry[] {
  const result = runGit(projectPath, args);
  assertGitOk(result, commandLabel);

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
  assertGitOk(result, "git ls-files --others");

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

function assertValidDiffBase(diffBase: string): void {
  if (!SHA_PATTERN.test(diffBase)) {
    throw new DiffDigestError(`Diff digest blocked: invalid diff base "${diffBase}".`);
  }
}

export function buildDiffDigestEntries(
  projectPath: string,
  diffBase: string | null
): DiffDigestEntry[] {
  if (!isGitRepo(projectPath)) {
    return [];
  }

  if (diffBase !== null) {
    assertValidDiffBase(diffBase);
  }

  const deletedRefBase = diffBase ?? "HEAD";
  const hasHead = repoHasHead(projectPath);
  const entries = [
    ...(diffBase !== null && hasHead
      ? collectNameStatusEntries(
        projectPath,
        ["diff", "--name-status", `${diffBase}..HEAD`, "--", "."],
        "committed",
        deletedRefBase,
        `git diff --name-status ${diffBase}..HEAD`
      )
      : []),
    ...(hasHead
      ? [
        ...collectNameStatusEntries(
          projectPath,
          ["diff", "--name-status", "--cached", "HEAD", "--", "."],
          "staged",
          deletedRefBase,
          "git diff --name-status --cached HEAD"
        ),
        ...collectNameStatusEntries(
          projectPath,
          ["diff", "--name-status", "HEAD", "--", "."],
          "unstaged",
          deletedRefBase,
          "git diff --name-status HEAD"
        )
      ]
      : []),
    ...collectUntrackedEntries(projectPath, deletedRefBase)
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
  if (!isGitRepo(projectPath)) {
    return hashLiteral("NON_GIT_WORKSPACE");
  }

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
