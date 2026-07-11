import * as fs from "fs";
import { fencedCodeLineMask } from "../../shared/markdown/code-fences";
import { normalizeLineEndings } from "../../shared/markdown/normalize-line-endings";
import { writeFileAtomic } from "../../shared/fs/write-file-atomic";
import { ITERATION_HEADING_REGEX_SOURCE } from "./iteration-heading-regex";

/**
 * Count the number of non-fenced iteration headings for a given iteration ID.
 * Returns 0 if the file is missing. Useful to detect duplicate iteration IDs.
 */
export function countIterationHeadings(filePath: string, iterationId: number): number {
  if (!fs.existsSync(filePath)) return 0;

  const content = normalizeLineEndings(fs.readFileSync(filePath, "utf-8"));
  const iterationRegex = new RegExp(
    `^(##\\s*Iteration\\s*${iterationId}\\s*:\\s*.*?\\s*\\[\\s*)(x|~| |\\/)(\\s*\\])[ \\t]*$`,
    "i"
  );

  const lines = content.split("\n");
  const fenceMask = fencedCodeLineMask(lines);

  let count = 0;
  for (let index = 0; index < lines.length; index++) {
    if (fenceMask[index]) continue;
    if (iterationRegex.test(lines[index])) count++;
  }
  return count;
}

/**
 * Flip an iteration heading checkbox. Returns true only when the heading was
 * matched and the file rewritten; false when the file is missing or no heading
 * matched, so callers can refuse to advance instead of silently proceeding on a
 * plan that was never updated.
 */
export function updateIterationStatus(filePath: string, iterationId: number, status: "completed" | "in_progress" | "not_started"): boolean {
  if (!fs.existsSync(filePath)) return false;

  const content = normalizeLineEndings(fs.readFileSync(filePath, "utf-8"));
  const statusChar = status === "completed" ? "x" : status === "in_progress" ? "~" : " ";
  // Anchored to a whole heading line (mirrors ITERATION_HEADING_REGEX_SOURCE) so
  // that inline mentions of an iteration heading in task text, tables, or deeper
  // headings (### Iteration ...) are never rewritten by mistake. Fenced code
  // is skipped: an example heading inside ``` must never be edited.
  // Content is normalized to LF above, so the rewritten file always has
  // consistent line endings even when the source plan used CRLF.
  // Note: uses a different capture-group structure for replacement ($1$3) than
  // the shared ITERATION_HEADING_REGEX_SOURCE, so it constructs its own regex.
  const iterationRegex = new RegExp(
    `^(##\\s*Iteration\\s*${iterationId}\\s*:\\s*.*?\\s*\\[\\s*)(x|~| |\\/)(\\s*\\])[ \\t]*$`,
    "i"
  );

  const lines = content.split("\n");
  const fenceMask = fencedCodeLineMask(lines);

  for (let index = 0; index < lines.length; index++) {
    if (fenceMask[index]) continue;
    if (!iterationRegex.test(lines[index])) continue;

    lines[index] = lines[index].replace(iterationRegex, `$1${statusChar}$3`);
    writeFileAtomic(filePath, lines.join("\n"));
    return true;
  }

  return false;
}
