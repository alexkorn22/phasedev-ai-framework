import { ApprovalPolicy, ReasoningEffort, SandboxMode } from "./config";
import { CodexStreamEvent, CodexUsage, reportCodexStreamEvent } from "./codex-stream-reporter";
import type { IterationUsage } from "../../entities/iteration-log";

export interface CodexFileChange {
  path: string;
  kind: string;
}

export interface CodexThread {
  id?: string | null;
  run?(prompt: string): Promise<{ finalResponse?: string }>;
  runStreamed?(prompt: string): Promise<{ events: AsyncGenerator<CodexStreamEvent> }>;
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

export async function runCodexTurn(
  thread: CodexThread,
  prompt: string,
  label: string,
  reporter: Pick<typeof console, "log">,
  streamAgentOutput: boolean
): Promise<CodexTurnResult> {
  if (!streamAgentOutput || !thread.runStreamed) {
    if (!thread.run) {
      throw new Error("Codex thread must provide runStreamed() or run().");
    }
    return { finalResponse: (await thread.run(prompt)).finalResponse ?? "", fileChanges: [], usage: null };
  }

  const { events } = await thread.runStreamed(prompt);
  let finalResponse = "";
  let usage: IterationUsage | null = null;
  const fileChanges: CodexFileChange[] = [];

  for await (const event of events) {
    fileChanges.push(...fileChangesFromEvent(event));
    const capturedUsage = usageFromEvent(event);
    if (capturedUsage !== null) {
      usage = capturedUsage;
    }
    const agentMessage = reportCodexStreamEvent(label, event, reporter);
    if (agentMessage !== null) {
      finalResponse = agentMessage;
    }
  }

  return { finalResponse, fileChanges, usage };
}
