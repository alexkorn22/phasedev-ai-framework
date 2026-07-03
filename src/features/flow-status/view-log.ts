import * as fs from "fs";
import * as path from "path";
import { SYSTEM_DIR } from "../../entities/change/paths";

export interface LogEntry {
  timestamp?: string;
  level?: string;
  message?: string;
  [key: string]: unknown;
}

export function viewLog(projectPath: string, tail?: number): string {
  const logsDir = path.join(projectPath, SYSTEM_DIR, "logs");
  const logFile = path.join(logsDir, "ralph-log.jsonl");

  if (!fs.existsSync(logFile)) {
    return "No logs found at .phasedev/logs/ralph-log.jsonl";
  }

  const content = fs.readFileSync(logFile, "utf-8");
  const lines = content.trim().split("\n").filter(Boolean);

  if (lines.length === 0) {
    return "Log file is empty.";
  }

  const tailLines = tail ? lines.slice(-tail) : lines;

  const formatted = tailLines.map((line, index) => {
    try {
      const parsed = JSON.parse(line);
      const timestamp = parsed.timestamp ?? "";
      const level = parsed.level ?? "INFO";
      const message = parsed.message ?? JSON.stringify(parsed);
      return `[${level}] ${timestamp} ${message}`;
    } catch {
      return line;
    }
  });

  const header = tail
    ? `--- Last ${Math.min(tail, lines.length)} of ${lines.length} log entries ---`
    : `--- ${lines.length} log entries ---`;

  return `${header}\n${formatted.join("\n")}`;
}
