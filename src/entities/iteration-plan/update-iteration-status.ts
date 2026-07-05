import * as fs from "fs";
import { fencedCodeLineMask } from "../../shared/markdown/code-fences";
import { normalizeLineEndings } from "../../shared/markdown/normalize-line-endings";
import { writeFileAtomic } from "../../shared/fs/write-file-atomic";

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
  // Anchored to a whole heading line (mirrors parsePlan's phaseRegex) so that
  // inline mentions of an iteration heading in task text, tables, or deeper
  // headings (### Iteration ...) are never rewritten by mistake. Fenced code
  // is skipped: an example heading inside ``` must never be edited.
  // Content is normalized to LF above, so the rewritten file always has
  // consistent line endings even when the source plan used CRLF.
  const iterationRegex = new RegExp(`^(##\\s*Iteration\\s*${iterationId}\\s*:\\s*.*?\\s*\\[\\s*)(x|~| |\\/)(\\s*\\])[ \\t]*$`, "i");

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
