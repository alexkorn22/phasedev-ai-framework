import { createHash } from "crypto";
import * as fs from "fs";
import { parse as parseYaml } from "yaml";
import { normalizeLineEndings } from "./normalize-line-endings";
import { escapeMarkdownTableCell, isMarkdownTableSeparatorRow, splitMarkdownTableRow } from "./table";

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

// Task checkboxes ([x], [~], [ ], [/]) track execution progress and are
// expected to change during implementation without re-approval; only the
// task text itself is a plan-content change.
function normalizeTaskCheckboxes(body: string): string {
  return body.replace(/^(\s*-\s*)\[\s*(?:x|~| |\/)\s*\]/gim, "$1[ ]");
}

// Check Evidence rows record run results (Result, Evidence, Notes) that are
// filled in while a plan is being executed; only the Check name and Command
// Or Method are plan content, so only those columns affect the hash.
function normalizeCheckEvidenceTables(body: string): string {
  const lines = body.split("\n");
  const headingPattern = /^###\s+Check Evidence\s*$/i;

  for (let index = 0; index < lines.length; index++) {
    if (!headingPattern.test(lines[index].trim())) {
      continue;
    }

    let rowIndex = index + 1;
    while (rowIndex < lines.length && !lines[rowIndex].trim().startsWith("|")) {
      if (/^#{1,3}\s+/.test(lines[rowIndex].trim())) {
        break;
      }
      rowIndex++;
    }

    rowIndex += 2; // skip header row and separator row
    while (rowIndex < lines.length && lines[rowIndex].trim().startsWith("|")) {
      const cells = splitMarkdownTableRow(lines[rowIndex]);
      if (cells.length === 5 && !isMarkdownTableSeparatorRow(cells)) {
        const normalizedCells = [cells[0], cells[1], "pending", "", ""].map(escapeMarkdownTableCell);
        lines[rowIndex] = `| ${normalizedCells.join(" | ")} |`;
      }
      rowIndex++;
    }
  }

  return lines.join("\n");
}

export function approvalContentHash(content: string): string {
  const normalized = normalizeLineEndings(content);
  const block = matchFrontmatterBlock(normalized);
  let body = block ? normalized.slice(block.endIndex) : normalized;
  // Normalize iteration status markers in headings ([x], [~], [ ], [/] → [ ])
  // so that status changes don't invalidate the approval hash while actual
  // content changes still do.
  body = body.replace(
    /(##\s*Iteration\s+\d+\s*:\s*.+?)\s*\[\s*(?:x|~| |\/)\s*\]/gi,
    "$1 [ ]",
  );
  body = normalizeTaskCheckboxes(body);
  body = normalizeCheckEvidenceTables(body);
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
    // Approval without content hash is rejected (hand-edited or legacy).
    // The framework always writes approved_hash alongside approved: true.
    return false;
  }

  return String(storedHash) === approvalContentHash(content);
}
