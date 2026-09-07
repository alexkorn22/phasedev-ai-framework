export type ParsedReceiptScope =
  | { kind: "final" }
  | { kind: "iteration"; iterationId: number };

export function formatReceiptScope(scope: ParsedReceiptScope): string {
  return scope.kind === "final" ? "final" : `iteration:${scope.iterationId}`;
}

export function parseReceiptScope(raw: string): ParsedReceiptScope | null {
  const trimmed = raw.trim();
  if (trimmed === "final") {
    return { kind: "final" };
  }

  const iterationMatch = /^iteration:(\d+)$/.exec(trimmed);
  if (iterationMatch) {
    const iterationId = Number.parseInt(iterationMatch[1], 10);
    if (Number.isInteger(iterationId) && iterationId > 0) {
      return { kind: "iteration", iterationId };
    }
    return null;
  }

  return null;
}
