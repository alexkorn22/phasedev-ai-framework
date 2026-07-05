import { createHash } from "crypto";
import * as fs from "fs";
import { parse as parseYaml } from "yaml";
import { bodyAfterFrontmatter } from "./headings";
import { normalizeLineEndings } from "./normalize-line-endings";

export function readFrontmatter(filePath: string): Record<string, any> | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const content = normalizeLineEndings(fs.readFileSync(filePath, "utf-8"));
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!frontmatterMatch) {
    return null;
  }

  try {
    const parsed = parseYaml(frontmatterMatch[1]);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

export function readFrontmatterValue(filePath: string, key: string): string | null {
  const fm = readFrontmatter(filePath);
  if (!fm) {
    return null;
  }
  const value = fm[key];
  return value !== undefined && value !== null ? String(value) : null;
}

export function approvalContentHash(content: string): string {
  const { body } = bodyAfterFrontmatter(normalizeLineEndings(content));
  return createHash("sha256").update(body.trim(), "utf-8").digest("hex").slice(0, 12);
}

export function isApproved(filePath: string): boolean {
  const fm = readFrontmatter(filePath);
  if (!fm) {
    return false;
  }
  const approved = fm.approved === true || String(fm.approved).toLowerCase() === "true";
  if (!approved) {
    return false;
  }

  const storedHash = fm.approved_hash;
  if (storedHash === undefined || storedHash === null || String(storedHash).length === 0) {
    // Legacy approval stamped before content hashing existed.
    return true;
  }

  return String(storedHash) === approvalContentHash(fs.readFileSync(filePath, "utf-8"));
}
