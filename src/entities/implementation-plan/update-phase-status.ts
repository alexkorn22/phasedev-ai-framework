import * as fs from "fs";

export function updatePhaseStatus(filePath: string, phaseId: number, status: "completed" | "in_progress" | "not_started"): void {
  if (!fs.existsSync(filePath)) return;

  let content = fs.readFileSync(filePath, "utf-8");
  const statusChar = status === "completed" ? "x" : status === "in_progress" ? "~" : " ";
  const phaseRegex = new RegExp(`(##\\s*Iteration\\s*${phaseId}\\s*:\\s*.*?\\s*\\[\\s*)(x|~| |\\/)\\s*(\\])`, "i");

  if (phaseRegex.test(content)) {
    content = content.replace(phaseRegex, `$1${statusChar}$3`);
    fs.writeFileSync(filePath, content, "utf-8");
  }
}
