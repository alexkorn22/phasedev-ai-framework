import * as fs from "fs";
import * as path from "path";
import { FlowStage } from "../../entities/flow-stage/types";
import { FlowSnapshot } from "./flow-snapshot";

export interface IterationLog {
  iteration: number;
  startedAt: string;
  completedAt: string;
  threadId?: string | null;
  stage: FlowStage;
  model?: string;
  reasoningEffort?: string;
  beforeSnapshot: FlowSnapshot;
  afterSnapshot: FlowSnapshot;
  nextBlocked: boolean;
  finalResponse: string;
  status: "completed" | "blocked" | "archived" | "no_progress";
  stopReason?: string;
}

export function createRunId(now: Date): string {
  return `${now.toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`;
}

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

export function appendLog(logPath: string, entry: IterationLog): void {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, "utf-8");
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

export function logAgentResponse(
  logDir: string,
  iteration: number,
  stage: string,
  model: string,
  reasoningEffort: string,
  response: string,
  now: () => Date,
  reporter: Pick<typeof console, "log">
): void {
  try {
    const mdLogPath = path.join(logDir, "log.md");
    let existingContent = "";
    if (fs.existsSync(mdLogPath)) {
      existingContent = fs.readFileSync(mdLogPath, "utf-8");
    }

    const timestamp = formatLogDate(now());
    const logEntry = [
      `## [${timestamp}] Iteration: ${iteration} | Stage: ${stage}`,
      `**Model:** ${model} (${reasoningEffort})`,
      "",
      response,
      "",
      "---",
      "",
      ""
    ].join("\n");

    fs.mkdirSync(path.dirname(mdLogPath), { recursive: true });
    fs.writeFileSync(mdLogPath, logEntry + existingContent, "utf-8");
  } catch (error) {
    reporter.log(`[FLOW RALPH] Failed to write to log.md: ${error instanceof Error ? error.message : String(error)}`);
  }
}
