import * as fs from "fs";
import { normalizeLineEndings } from "./normalize-line-endings";

export function readFrontmatterValue(filePath: string, key: string): string | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const content = normalizeLineEndings(fs.readFileSync(filePath, "utf-8"));
  const frontmatterMatch = content.match(/^\s*---([\s\S]*?)---/);
  if (!frontmatterMatch) {
    return null;
  }

  const valueMatch = frontmatterMatch[1].match(new RegExp(`${key}\\s*:\\s*([^\\s]+)`, "i"));
  return valueMatch?.[1] ?? null;
}

export function isApproved(filePath: string): boolean {
  return readFrontmatterValue(filePath, "approved")?.toLowerCase() === "true";
}
