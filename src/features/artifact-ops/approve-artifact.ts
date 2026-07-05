import * as fs from "fs";
import * as path from "path";
import { writeFileAtomic } from "../../shared/fs/write-file-atomic";
import { approvalContentHash, matchFrontmatterBlock } from "../../shared/markdown/frontmatter";

export interface ApproveResult {
  ok: boolean;
  message: string;
}

export function approveArtifact(filePath: string, approvedBy?: string): ApproveResult {
  if (!fs.existsSync(filePath)) {
    return { ok: false, message: `File not found: ${filePath}` };
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const block = matchFrontmatterBlock(content);
  if (!block) {
    return { ok: false, message: `${filePath} does not contain YAML frontmatter.` };
  }

  const contentHash = approvalContentHash(content);
  const prefix = block.prefix;
  const afterFrontmatter = content.slice(block.endIndex);

  // Preserve the exact raw frontmatter lines, replace or add approved/approved_by/approved_hash
  const lines = block.yaml.split(/\r?\n/);
  let hasApproved = false;
  let hasApprovedBy = false;
  let hasApprovedHash = false;

  const newLines = lines.map(line => {
    if (/^approved\s*:/.test(line)) {
      hasApproved = true;
      return "approved: true";
    }
    if (/^approved_by\s*:/.test(line)) {
      hasApprovedBy = true;
      return `approved_by: "${approvedBy ?? "phasedev approve"}"`;
    }
    if (/^approved_hash\s*:/.test(line)) {
      hasApprovedHash = true;
      return `approved_hash: "${contentHash}"`;
    }
    return line;
  });

  if (!hasApproved) {
    newLines.push("approved: true");
  }
  if (!hasApprovedBy) {
    newLines.push(`approved_by: "${approvedBy ?? "phasedev approve"}"`);
  }
  if (!hasApprovedHash) {
    newLines.push(`approved_hash: "${contentHash}"`);
  }

  const newContent = `${prefix}---\n${newLines.join("\n")}\n---${afterFrontmatter}`;
  writeFileAtomic(filePath, newContent);

  return {
    ok: true,
    message: `Approved: ${path.basename(filePath)}${approvedBy ? ` (by: ${approvedBy})` : ""}`
  };
}
