import { ApprovalPolicy, ReasoningEffort, SandboxMode } from "./config";
import { CodexStreamEvent, reportCodexStreamEvent } from "./codex-stream-reporter";

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

export async function runCodexTurn(thread: CodexThread, prompt: string, label: string, reporter: Pick<typeof console, "log">, streamAgentOutput: boolean): Promise<{ finalResponse: string; fileChanges: CodexFileChange[] }> {
  if (!streamAgentOutput || !thread.runStreamed) {
    if (!thread.run) {
      throw new Error("Codex thread must provide runStreamed() or run().");
    }
    return { finalResponse: (await thread.run(prompt)).finalResponse ?? "", fileChanges: [] };
  }

  const { events } = await thread.runStreamed(prompt);
  let finalResponse = "";
  const fileChanges: CodexFileChange[] = [];

  for await (const event of events) {
    fileChanges.push(...fileChangesFromEvent(event));
    const agentMessage = reportCodexStreamEvent(label, event, reporter);
    if (agentMessage !== null) {
      finalResponse = agentMessage;
    }
  }

  return { finalResponse, fileChanges };
}
