import * as fs from "fs";
import { readFrontmatter } from "../../shared/markdown/frontmatter";

export interface ApproveResult {
  ok: boolean;
  message: string;
}

export function approveArtifact(filePath: string, approvedBy?: string): ApproveResult {
  if (!fs.existsSync(filePath)) {
    return { ok: false, message: `File not found: ${filePath}` };
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const frontmatterMatch = content.match(/^\s*---([\s\S]*?)---/);
  if (!frontmatterMatch) {
    return { ok: false, message: `${filePath} does not contain YAML frontmatter.` };
  }

  const rawFrontmatter = frontmatterMatch[1];
  const beforeFrontmatter = content.slice(0, frontmatterMatch.index! + frontmatterMatch[0].indexOf(rawFrontmatter));
  const afterFrontmatter = content.slice(frontmatterMatch.index! + frontmatterMatch[0].length);

  // Preserve the exact raw frontmatter, replace or add approved/approved_by
  let lines = rawFrontmatter.split("\n");
  let hasApproved = false;
  let hasApprovedBy = false;

  const newLines = lines.map(line => {
    const approvedMatch = line.match(/^approved\s*:/);
    if (approvedMatch) {
      hasApproved = true;
      return "approved: true";
    }
    const approvedByMatch = line.match(/^approved_by\s*:/);
    if (approvedByMatch) {
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

  const newContent = beforeFrontmatter + "---\n" + newLines.join("\n") + "\n---" + afterFrontmatter;
  fs.writeFileSync(filePath, newContent, "utf-8");

  return {
    ok: true,
    message: `Approved: ${path.basename(filePath)}${approvedBy ? ` (by: ${approvedBy})` : ""}`
  };
}

import * as path from "path";
