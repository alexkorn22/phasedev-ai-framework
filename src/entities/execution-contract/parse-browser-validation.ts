import * as fs from "fs";
import { blankFencedCodeLines } from "../../shared/markdown/code-fences";
import { normalizeLineEndings } from "../../shared/markdown/normalize-line-endings";
import { isMarkdownTableSeparatorRow, splitMarkdownTableRow } from "../../shared/markdown/table";

export interface BrowserValidation {
  present: boolean;
  start?: string;
  url?: string;
  criteria?: string;
}

const REQUIRED_FIELDS = ["start", "url", "criteria"] as const;

export function parseBrowserValidation(filePath: string): BrowserValidation {
  if (!fs.existsSync(filePath)) {
    return { present: false };
  }

  const content = normalizeLineEndings(fs.readFileSync(filePath, "utf-8"));
  const lines = blankFencedCodeLines(content.split("\n"));
  const hasSectionHeading = lines.some(line => /^##\s+Browser Validation\s*$/i.test(line.trim()));
  if (!hasSectionHeading) {
    return { present: false };
  }

  let inSection = false;
  const values: Partial<Record<(typeof REQUIRED_FIELDS)[number], string>> = {};

  for (const line of lines) {
    if (/^##\s+Browser Validation\s*$/i.test(line.trim())) {
      inSection = true;
      continue;
    }

    if (inSection && /^##\s+/.test(line.trim())) {
      break;
    }

    if (!inSection) {
      continue;
    }

    if (!line.trim().startsWith("|")) {
      continue;
    }

    const cells = splitMarkdownTableRow(line);
    if (cells.length !== 2 || cells[0] === "Field" || isMarkdownTableSeparatorRow(cells)) {
      continue;
    }

    const key = cells[0].toLowerCase();
    if (!REQUIRED_FIELDS.includes(key as (typeof REQUIRED_FIELDS)[number])) {
      continue;
    }

    const value = cells[1].trim().replace(/^`(.+)`$/, "$1").trim();
    if (value.length > 0) {
      values[key as (typeof REQUIRED_FIELDS)[number]] = value;
    }
  }

  return {
    present: true,
    start: values.start,
    url: values.url,
    criteria: values.criteria
  };
}
