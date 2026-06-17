import { ApprovalPolicy, ReasoningEffort, SandboxMode } from "./config";
import { CodexStreamEvent, CodexUsage, reportCodexStreamEvent } from "./codex-stream-reporter";
import type { IterationFailure, IterationUsage } from "../../entities/iteration-log";

export interface CodexFileChange {
  path: string;
  kind: string;
}

export interface CodexThread {
  id?: string | null;
  run?(prompt: string, options?: CodexTurnOptions): Promise<{ finalResponse?: string }>;
  runStreamed?(prompt: string, options?: CodexTurnOptions): Promise<{ events: AsyncGenerator<CodexStreamEvent> }>;
}

export interface CodexTurnOptions {
  signal?: AbortSignal;
}

export interface CodexTurnWatchdogConfig {
  enabled: boolean;
  turnTimeoutMs: number;
  inactivityTimeoutMs: number;
  statusIntervalMs: number;
  abortGraceMs: number;
}

export interface RunCodexTurnOptions {
  watchdog?: CodexTurnWatchdogConfig;
}

export interface CodexFactory {
  startThread(options: {
    workingDirectory: string;
    model: string;
    modelReasoningEffort: ReasoningEffort;
    sandboxMode: SandboxMode;
    approvalPolicy: ApprovalPolicy;
    networkAccessEnabled: boolean;
  }): CodexThread;
}

export interface CodexTurnResult {
  finalResponse: string;
  fileChanges: CodexFileChange[];
  usage: IterationUsage | null;
}

type TimeoutKind = "turn" | "inactivity" | "abort_grace";

export class CodexTurnTimeoutError extends Error {
  readonly failure: IterationFailure;
  readonly fileChanges: CodexFileChange[];

  constructor(failure: IterationFailure, fileChanges: CodexFileChange[]) {
    super(failure.message);
    this.name = "CodexTurnTimeoutError";
    this.failure = failure;
    this.fileChanges = fileChanges;
  }
}

export async function createDefaultCodexFactory(): Promise<CodexFactory> {
  const mod = await import("@openai/codex-sdk");
  const codex = new mod.Codex();
  return {
    startThread(options) {
      return codex.startThread(options);
    }
  };
}

function fileChangesFromEvent(event: CodexStreamEvent): CodexFileChange[] {
  if (event.type !== "item.completed" || event.item.type !== "file_change") {
    return [];
  }

  return (event.item.changes ?? []).flatMap(change => {
    if (!change.path) {
      return [];
    }

    return [{ path: change.path, kind: change.kind ?? "change" }];
  });
}

function usageFromEvent(event: CodexStreamEvent): IterationUsage | null {
  if (event.type !== "turn.completed" || !event.usage) {
    return null;
  }
  const u: CodexUsage = event.usage;
  return {
    inputTokens: u.input_tokens ?? 0,
    cachedInputTokens: u.cached_input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    reasoningOutputTokens: u.reasoning_output_tokens ?? 0
  };
}

function summarizeEvent(event: CodexStreamEvent): string {
  if (event.type === "thread.started") {
    return `thread.started ${event.thread_id}`;
  }

  if (event.type === "turn.started" || event.type === "turn.completed" || event.type === "turn.failed" || event.type === "error") {
    return event.type;
  }

  const item = event.item;
  if (item.type === "command_execution") {
    return `${event.type} command_execution ${item.status ?? "unknown"} ${item.command ?? ""}`.trim();
  }

  if (item.type === "file_change") {
    const changes = item.changes?.map(change => `${change.kind ?? "change"} ${change.path ?? ""}`.trim()).join(", ");
    return `${event.type} file_change ${item.status ?? "unknown"}${changes ? ` ${changes}` : ""}`;
  }

  if (item.type === "mcp_tool_call") {
    return `${event.type} mcp_tool_call ${item.server ?? "unknown"}/${item.tool ?? "unknown"} ${item.status ?? "unknown"}`;
  }

  return `${event.type} ${item.type}`;
}

function makeTimeoutMessage(timeoutKind: TimeoutKind, timeoutMs: number): string {
  if (timeoutKind === "inactivity") {
    return `Codex turn timed out after ${timeoutMs}ms without stream activity.`;
  }

  if (timeoutKind === "abort_grace") {
    return `Codex turn did not stop within ${timeoutMs}ms after abort.`;
  }

  return `Codex turn timed out after ${timeoutMs}ms.`;
}

export async function runCodexTurn(
  thread: CodexThread,
  prompt: string,
  label: string,
  reporter: Pick<typeof console, "log">,
  streamAgentOutput: boolean,
  options: RunCodexTurnOptions = {}
): Promise<CodexTurnResult> {
  const watchdog = options.watchdog;
  const controller = watchdog?.enabled ? new AbortController() : null;
  const startedAt = Date.now();
  let lastEventAt: Date | null = null;
  let lastEventSummary: string | null = null;
  let timeoutFailure: IterationFailure | null = null;
  let finalResponse = "";
  let usage: IterationUsage | null = null;
  const fileChanges: CodexFileChange[] = [];
  let turnTimer: ReturnType<typeof setTimeout> | null = null;
  let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  let statusTimer: ReturnType<typeof setInterval> | null = null;
  let timeoutPoll: ReturnType<typeof setInterval> | null = null;
  let activeIterator: AsyncGenerator<CodexStreamEvent> | null = null;

  const buildFailure = (timeoutKind: TimeoutKind, timeoutMs: number): IterationFailure => ({
    kind: "codex_turn_timeout",
    timeoutKind,
    message: makeTimeoutMessage(timeoutKind, timeoutMs),
    elapsedMs: Date.now() - startedAt,
    timeoutMs,
    lastEventAt: lastEventAt?.toISOString() ?? null,
    lastEventSummary,
    threadId: thread.id ?? null
  });

  function clearWatchdogTimers(): void {
    if (turnTimer) clearTimeout(turnTimer);
    if (inactivityTimer) clearTimeout(inactivityTimer);
    if (statusTimer) clearInterval(statusTimer);
    if (timeoutPoll) clearInterval(timeoutPoll);
    turnTimer = null;
    inactivityTimer = null;
    statusTimer = null;
    timeoutPoll = null;
  }

  function throwTimeout(failure: IterationFailure): never {
    throw new CodexTurnTimeoutError(failure, [...fileChanges]);
  }

  function triggerTimeout(timeoutKind: TimeoutKind, timeoutMs: number): void {
    if (timeoutFailure) {
      return;
    }

    timeoutFailure = buildFailure(timeoutKind, timeoutMs);
    controller?.abort();
    void activeIterator?.return(undefined).catch(() => undefined);
  }

  function resetInactivityTimer(): void {
    if (!watchdog?.enabled || !controller) {
      return;
    }

    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
    }
    inactivityTimer = setTimeout(() => triggerTimeout("inactivity", watchdog.inactivityTimeoutMs), watchdog.inactivityTimeoutMs);
  }

  async function runWithStream(): Promise<CodexTurnResult> {
    if (!thread.runStreamed) {
      throw new Error("Codex thread must provide runStreamed() or run().");
    }

    const { events } = await thread.runStreamed(prompt, { signal: controller?.signal });
    activeIterator = events;

    for await (const event of events) {
      lastEventAt = new Date();
      lastEventSummary = summarizeEvent(event);
      resetInactivityTimer();
      fileChanges.push(...fileChangesFromEvent(event));
      const capturedUsage = usageFromEvent(event);
      if (capturedUsage !== null) {
        usage = capturedUsage;
      }
      const agentMessage = streamAgentOutput ? reportCodexStreamEvent(label, event, reporter) : (
        event.type === "item.completed" && event.item.type === "agent_message" ? event.item.text ?? "" : null
      );
      if (agentMessage !== null) {
        finalResponse = agentMessage;
      }
    }

    if (timeoutFailure) {
      throwTimeout(timeoutFailure);
    }

    return { finalResponse, fileChanges, usage };
  }

  async function runBuffered(): Promise<CodexTurnResult> {
    if (!thread.run) {
      throw new Error("Codex thread must provide runStreamed() or run().");
    }
    const result = await thread.run(prompt, { signal: controller?.signal });
    if (timeoutFailure) {
      throwTimeout(timeoutFailure);
    }
    return { finalResponse: result.finalResponse ?? "", fileChanges: [], usage: null };
  }

  const turnPromise = (thread.runStreamed ? runWithStream() : runBuffered()).catch(error => {
    if (timeoutFailure) {
      throwTimeout(timeoutFailure);
    }
    throw error;
  });

  if (!watchdog?.enabled || !controller) {
    return turnPromise;
  }

  resetInactivityTimer();
  turnTimer = setTimeout(() => triggerTimeout("turn", watchdog.turnTimeoutMs), watchdog.turnTimeoutMs);
  statusTimer = setInterval(() => {
    reporter.log(`[PHASEDEV RUNNER] Codex watchdog: stage ${label} running ${Math.round((Date.now() - startedAt) / 1000)}s`);
  }, watchdog.statusIntervalMs);

  const timeoutPromise = new Promise<CodexTurnResult>((_, reject) => {
    timeoutPoll = setInterval(() => {
      if (!timeoutFailure) {
        return;
      }

      if (timeoutPoll) {
        clearInterval(timeoutPoll);
        timeoutPoll = null;
      }
      setTimeout(() => {
        reject(new CodexTurnTimeoutError(timeoutFailure ?? buildFailure("abort_grace", watchdog.abortGraceMs), [...fileChanges]));
      }, watchdog.abortGraceMs);
    }, 1);
  });

  try {
    return await Promise.race([turnPromise, timeoutPromise]);
  } finally {
    clearWatchdogTimers();
    const iterator = activeIterator as AsyncGenerator<CodexStreamEvent> | null;
    if (timeoutFailure && iterator) {
      void iterator.return(undefined).catch(() => undefined);
    }
  }
}
