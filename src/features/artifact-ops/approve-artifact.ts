import * as fs from "fs";
import * as path from "path";
import { writeFileAtomic } from "../../shared/fs/write-file-atomic";

export interface ApproveResult {
  ok: boolean;
  message: string;
}

export function approveArtifact(filePath: string, approvedBy?: string): ApproveResult {
  if (!fs.existsSync(filePath)) {
    return { ok: false, message: `File not found: ${filePath}` };
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const frontmatterMatch = content.match(/^(﻿?\s*)---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatterMatch) {
    return { ok: false, message: `${filePath} does not contain YAML frontmatter.` };
  }

  const prefix = frontmatterMatch[1];
  const afterFrontmatter = content.slice(frontmatterMatch.index! + frontmatterMatch[0].length);

  // Preserve the exact raw frontmatter lines, replace or add approved/approved_by
  const lines = frontmatterMatch[2].split(/\r?\n/);
  let hasApproved = false;
  let hasApprovedBy = false;

  const newLines = lines.map(line => {
    if (/^approved\s*:/.test(line)) {
      hasApproved = true;
      return "approved: true";
    }
    if (/^approved_by\s*:/.test(line)) {
      hasApprovedBy = true;
      return `approved_by: "${approvedBy ?? "phasedev approve"}"`;
    }
    return line;
  });

  if (!hasApproved) {
    newLines.push("approved: true");
  }
  if (!hasApprovedBy) {
    newLines.push(`approved_by: "${approvedBy ?? "phasedev approve"}"`);
  }

  const newContent = `${prefix}---\n${newLines.join("\n")}\n---${afterFrontmatter}`;
  writeFileAtomic(filePath, newContent);

  return {
    ok: true,
    message: `Approved: ${path.basename(filePath)}${approvedBy ? ` (by: ${approvedBy})` : ""}`
  };
}
