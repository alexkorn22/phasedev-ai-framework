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

export interface ApprovalEnvelope {
  approved: boolean;
  approvedBy: string | null;
  date: string | null;
}

export function readApprovalEnvelope(filePath: string): ApprovalEnvelope {
  const fm = readFrontmatter(filePath);
  if (!fm) {
    return { approved: false, approvedBy: null, date: null };
  }

  const approved = fm.approved === true || String(fm.approved).toLowerCase() === "true";
  const approvedByRaw = fm.approved_by;
  const approvedBy = approvedByRaw !== undefined && approvedByRaw !== null && String(approvedByRaw).trim() !== ""
    ? String(approvedByRaw).trim()
    : null;
  const date = fm.date !== undefined && fm.date !== null ? String(fm.date) : null;

  return { approved, approvedBy, date };
}

export function isApproved(filePath: string): boolean {
  return readApprovalEnvelope(filePath).approved;
}
