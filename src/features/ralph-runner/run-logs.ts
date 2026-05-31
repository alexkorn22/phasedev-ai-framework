import * as fs from "fs";
import * as path from "path";

export function formatLogDate(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  const dd = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const yyyy = date.getFullYear();
  return `${hh}:${mm}:${ss} ${dd}.${month}.${yyyy}`;
}

export function initializeMarkdownLog(logDir: string, reporter: Pick<typeof console, "log">): void {
  try {
    const mdLogPath = path.join(logDir, "log.md");
    if (!fs.existsSync(mdLogPath)) {
      fs.mkdirSync(path.dirname(mdLogPath), { recursive: true });
      fs.writeFileSync(
        mdLogPath,
        "# Agent Response Log\n\nHere are logged responses from the flow-ralph agent.\n\n---\n",
        "utf-8"
      );
    }
  } catch (error) {
    reporter.log(`[FLOW RALPH] Failed to initialize log.md: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function formatAgentResponseLogEntry(
  iteration: number,
  stage: string,
  model: string,
  reasoningEffort: string,
  response: string,
  now: () => Date
): string {
  const timestamp = formatLogDate(now());
  return [
    `## [${timestamp}] Iteration: ${iteration} | Stage: ${stage}`,
    `**Model:** ${model} (${reasoningEffort})`,
    "",
    response,
    "",
    "---",
    "",
    ""
  ].join("\n");
}

export function logAgentResponse(
  logDir: string,
  iteration: number,
  stage: string,
  model: string,
  reasoningEffort: string,
  response: string,
  now: () => Date,
  reporter: Pick<typeof console, "log">
): string | null {
  try {
    const mdLogPath = path.join(logDir, "log.md");
    let existingContent = "";
    if (fs.existsSync(mdLogPath)) {
      existingContent = fs.readFileSync(mdLogPath, "utf-8");
    }

    const logEntry = formatAgentResponseLogEntry(iteration, stage, model, reasoningEffort, response, now);

    fs.mkdirSync(path.dirname(mdLogPath), { recursive: true });
    fs.writeFileSync(mdLogPath, logEntry + existingContent, "utf-8");
    return logEntry;
  } catch (error) {
    reporter.log(`[FLOW RALPH] Failed to write to log.md: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
