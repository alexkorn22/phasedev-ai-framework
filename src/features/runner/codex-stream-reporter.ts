export type CodexUsage = {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
};

export type CodexItem = {
  type: string;
  text?: string;
  command?: string;
  aggregated_output?: string;
  exit_code?: number;
  status?: string;
  changes?: Array<{ path?: string; kind?: string }>;
  server?: string;
  tool?: string;
  arguments?: unknown;
  result?: unknown;
  error?: { message?: string };
  query?: string;
  items?: Array<{ text?: string; completed?: boolean }>;
  message?: string;
};

export type CodexStreamEvent =
  | { type: "thread.started"; thread_id: string }
  | { type: "turn.started" }
  | { type: "turn.completed"; usage?: CodexUsage }
  | { type: "turn.failed"; error?: { message?: string } }
  | { type: "error"; message?: string }
  | { type: "item.started" | "item.updated" | "item.completed"; item: CodexItem };

function stringifyUnknown(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatUsage(usage?: CodexUsage): string {
  return [
    `input=${usage?.input_tokens ?? 0}`,
    `cached=${usage?.cached_input_tokens ?? 0}`,
    `output=${usage?.output_tokens ?? 0}`,
    `reasoning=${usage?.reasoning_output_tokens ?? 0}`
  ].join(", ");
}

function formatFileChange(item: CodexItem): string {
  const changes = item.changes?.map(change => `${change.kind ?? "change"} ${change.path ?? ""}`.trim()).join(", ");
  return `${item.status ?? "unknown"}${changes ? ` ${changes}` : ""}`;
}

function formatTodoList(item: CodexItem): string {
  return (item.items ?? [])
    .map(todo => `- [${todo.completed ? "x" : " "}] ${todo.text ?? ""}`)
    .join("\n");
}

function reportCodexItem(label: string, eventType: string, item: CodexItem, reporter: Pick<typeof console, "log">): void {
  if (eventType !== "item.completed") {
    reporter.log(`[CODEX ${label}] ${eventType}: ${item.type}`);
  }

  if (item.type === "agent_message") {
    reporter.log(`[CODEX ${label}] agent_message:\n${item.text ?? ""}`);
    return;
  }

  if (item.type === "reasoning") {
    reporter.log(`[CODEX ${label}] reasoning: ${item.text ?? ""}`);
    return;
  }

  if (item.type === "command_execution") {
    reporter.log(`[CODEX ${label}] command: ${item.command ?? ""}`);
    reporter.log(`[CODEX ${label}] command status: ${item.status ?? "unknown"}${item.exit_code === undefined ? "" : ` exit=${item.exit_code}`}`);
    if (item.aggregated_output) {
      reporter.log(`[CODEX ${label}] command output:\n${item.aggregated_output}`);
    }
    return;
  }

  if (item.type === "file_change") {
    reporter.log(`[CODEX ${label}] file_change: ${formatFileChange(item)}`);
    return;
  }

  if (item.type === "mcp_tool_call") {
    reporter.log(`[CODEX ${label}] mcp_tool_call: ${item.server ?? "unknown"}/${item.tool ?? "unknown"} ${item.status ?? "unknown"}`);
    if (item.arguments !== undefined) {
      reporter.log(`[CODEX ${label}] mcp arguments:\n${stringifyUnknown(item.arguments)}`);
    }
    if (item.result !== undefined) {
      reporter.log(`[CODEX ${label}] mcp result:\n${stringifyUnknown(item.result)}`);
    }
    if (item.error?.message) {
      reporter.log(`[CODEX ${label}] mcp error: ${item.error.message}`);
    }
    return;
  }

  if (item.type === "web_search") {
    reporter.log(`[CODEX ${label}] web_search: ${item.query ?? ""}`);
    return;
  }

  if (item.type === "todo_list") {
    reporter.log(`[CODEX ${label}] todo_list:\n${formatTodoList(item)}`);
    return;
  }

  if (item.type === "error") {
    reporter.log(`[CODEX ${label}] error: ${item.message ?? ""}`);
    return;
  }

  reporter.log(`[CODEX ${label}] ${item.type}:\n${stringifyUnknown(item)}`);
}

export function reportCodexStreamEvent(label: string, event: CodexStreamEvent, reporter: Pick<typeof console, "log">): string | null {
  if (event.type === "thread.started") {
    reporter.log(`[CODEX ${label}] thread.started: ${event.thread_id}`);
    return null;
  }

  if (event.type === "turn.started") {
    reporter.log(`[CODEX ${label}] turn.started`);
    return null;
  }

  if (event.type === "turn.completed") {
    reporter.log(`[CODEX ${label}] turn.completed usage: ${formatUsage(event.usage)}`);
    return null;
  }

  if (event.type === "turn.failed") {
    throw new Error(event.error?.message ?? "Codex turn failed.");
  }

  if (event.type === "error") {
    throw new Error(event.message ?? "Codex stream failed.");
  }

  reportCodexItem(label, event.type, event.item, reporter);
  return event.type === "item.completed" && event.item.type === "agent_message" ? event.item.text ?? "" : null;
}
