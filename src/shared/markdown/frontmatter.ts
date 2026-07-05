import { createHash } from "crypto";
import * as fs from "fs";
import { parse as parseYaml } from "yaml";
import { normalizeLineEndings } from "./normalize-line-endings";

export interface FrontmatterBlock {
  prefix: string;
  yaml: string;
  endIndex: number;
}

export function matchFrontmatterBlock(content: string): FrontmatterBlock | null {
  const match = content.match(/^(﻿?\s*)---\r?\n([\s\S]*?)\r?\n---(?=\r?\n|$)/);
  if (!match) {
    return null;
  }
  return { prefix: match[1], yaml: match[2], endIndex: (match.index ?? 0) + match[0].length };
}

function parseFrontmatterFromContent(content: string): Record<string, any> | null {
  const block = matchFrontmatterBlock(content);
  if (!block) {
    return null;
  }

  try {
    const parsed = parseYaml(block.yaml);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

export function readFrontmatter(filePath: string): Record<string, any> | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const content = normalizeLineEndings(fs.readFileSync(filePath, "utf-8"));
  return parseFrontmatterFromContent(content);
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
  const normalized = normalizeLineEndings(content);
  const block = matchFrontmatterBlock(normalized);
  const body = block ? normalized.slice(block.endIndex) : normalized;
  return createHash("sha256").update(body.trim(), "utf-8").digest("hex").slice(0, 12);
}

export function isApproved(filePath: string): boolean {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const content = normalizeLineEndings(fs.readFileSync(filePath, "utf-8"));
  const fm = parseFrontmatterFromContent(content);
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

  return String(storedHash) === approvalContentHash(content);
}
