import * as fs from "fs";
import { parse as parseYaml } from "yaml";
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

export function isApproved(filePath: string): boolean {
  const fm = readFrontmatter(filePath);
  if (!fm) {
    return false;
  }
  return fm.approved === true || String(fm.approved).toLowerCase() === "true";
}
