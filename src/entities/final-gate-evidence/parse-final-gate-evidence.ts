import * as fs from "fs";
import { blankFencedCodeLines } from "../../shared/markdown/code-fences";
import { normalizeLineEndings } from "../../shared/markdown/normalize-line-endings";
import { isMarkdownTableSeparatorRow, splitMarkdownTableRow } from "../../shared/markdown/table";

export type FinalGateName = "full" | "browser";
export type FinalGateResult = "passed" | "failed" | "blocked";

export interface FinalGateRow {
  gate: FinalGateName;
  result: FinalGateResult;
  command: string;
  evidence: string;
}

export interface FinalGateEvidenceArtifact {
  exists: boolean;
  rows: FinalGateRow[];
}

const ALLOWED_GATES = new Set<string>(["full", "browser"]);
const ALLOWED_RESULTS = new Set<string>(["passed", "failed", "blocked"]);

function stripCommandCell(value: string): string {
  return value.trim().replace(/^`(.+)`$/, "$1").trim();
}

export function parseFinalGateEvidence(filePath: string): FinalGateEvidenceArtifact {
  if (!fs.existsSync(filePath)) {
    return { exists: false, rows: [] };
  }

  const content = normalizeLineEndings(fs.readFileSync(filePath, "utf-8"));
  const lines = blankFencedCodeLines(content.split("\n"));
  const rows: FinalGateRow[] = [];
  let inTable = false;

  for (const line of lines) {
    if (!line.trim().startsWith("|")) {
      if (inTable) {
        break;
      }
      continue;
    }

    const cells = splitMarkdownTableRow(line);
    if (cells.length !== 4) {
      continue;
    }

    if (cells[0].toLowerCase() === "gate") {
      inTable = true;
      continue;
    }

    if (!inTable || isMarkdownTableSeparatorRow(cells)) {
      continue;
    }

    const gate = cells[0].toLowerCase();
    const result = cells[1].toLowerCase();
    if (!ALLOWED_GATES.has(gate) || !ALLOWED_RESULTS.has(result)) {
      continue;
    }

    rows.push({
      gate: gate as FinalGateName,
      result: result as FinalGateResult,
      command: stripCommandCell(cells[2]),
      evidence: cells[3]
    });
  }

  return { exists: true, rows };
}
