import { readFrontmatterValue } from "../../shared/markdown/frontmatter";

export function parseValidationVerdict(filePath: string): "ready" | "ready_with_risks" | "repaired" | "repair_required" | "unknown" {
  const verdict = readFrontmatterValue(filePath, "verdict")?.toLowerCase();
  if (verdict === "ready" || verdict === "ready_with_risks" || verdict === "repaired" || verdict === "repair_required") {
    return verdict;
  }

  return "unknown";
}

export function parseValidationVerdictType(filePath: string): "phase" | "final" | "unknown" {
  const type = readFrontmatterValue(filePath, "type")?.toLowerCase();
  if (type === "phase" || type === "final") {
    return type;
  }

  return "unknown";
}
