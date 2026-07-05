import * as fs from "fs";
import { blankFencedCodeLines } from "../../shared/markdown/code-fences";
import { normalizeLineEndings } from "../../shared/markdown/normalize-line-endings";
import { isMarkdownTableSeparatorRow, splitMarkdownTableRow } from "../../shared/markdown/table";

export interface PrdTraceIds {
  requirements: string[];
  criteria: string[];
}

export interface PrdTraceability {
  intent: Map<string, string>;
  requirements: string[];
  criteria: string[];
}

function collectFirstColumnIds(lines: string[], sectionName: string, idPattern: RegExp): string[] {
  const ids: string[] = [];
  let currentSection = "";

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      currentSection = heading[1].trim().toLowerCase();
      continue;
    }

    if (currentSection !== sectionName.toLowerCase() || !line.trim().startsWith("|")) {
      continue;
    }

    const cells = splitMarkdownTableRow(line);
    const id = cells[0] ?? "";
    if (cells[0] === "ID" || isMarkdownTableSeparatorRow(cells)) {
      continue;
    }
    if (idPattern.test(id)) {
      ids.push(id);
    }
  }

  return ids;
}

function collectIntentValues(lines: string[]): Map<string, string> {
  const values = new Map<string, string>();
  let currentSection = "";

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      currentSection = heading[1].trim().toLowerCase();
      continue;
    }

    if (currentSection !== "intent" || !line.trim().startsWith("|")) {
      continue;
    }

    const cells = splitMarkdownTableRow(line);
    if (cells[0] === "Field" || isMarkdownTableSeparatorRow(cells)) {
      continue;
    }

    const field = cells[0] ?? "";
    const value = cells[1] ?? "";
    if (field.length > 0) {
      values.set(field, value);
    }
  }

  return values;
}

function readPrdLines(prdPath: string): string[] {
  const content = normalizeLineEndings(fs.readFileSync(prdPath, "utf-8"));
  return blankFencedCodeLines(content.split("\n"));
}

export function extractRequirementsAndCriteriaFromPrd(prdPath: string): PrdTraceIds {
  if (!fs.existsSync(prdPath)) {
    return { requirements: [], criteria: [] };
  }

  const lines = readPrdLines(prdPath);
  return {
    requirements: collectFirstColumnIds(lines, "Requirements", /^R\d+$/),
    criteria: collectFirstColumnIds(lines, "Success Criteria", /^SC\d+$/)
  };
}

export function extractPrdTraceability(prdPath: string): PrdTraceability {
  if (!fs.existsSync(prdPath)) {
    return { intent: new Map(), requirements: [], criteria: [] };
  }

  const lines = readPrdLines(prdPath);
  return {
    intent: collectIntentValues(lines),
    requirements: collectFirstColumnIds(lines, "Requirements", /^R\d+$/),
    criteria: collectFirstColumnIds(lines, "Success Criteria", /^SC\d+$/)
  };
}
