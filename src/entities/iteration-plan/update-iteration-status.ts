import * as fs from "fs";

export function updateIterationStatus(filePath: string, iterationId: number, status: "completed" | "in_progress" | "not_started"): void {
  if (!fs.existsSync(filePath)) return;

  let content = fs.readFileSync(filePath, "utf-8");
  const statusChar = status === "completed" ? "x" : status === "in_progress" ? "~" : " ";
  const iterationRegex = new RegExp(`(##\\s*Iteration\\s*${iterationId}\\s*:\\s*.*?\\s*\\[\\s*)(x|~| |\\/)\\s*(\\])`, "i");

  if (iterationRegex.test(content)) {
    content = content.replace(iterationRegex, `$1${statusChar}$3`);
    fs.writeFileSync(filePath, content, "utf-8");
  }
}
