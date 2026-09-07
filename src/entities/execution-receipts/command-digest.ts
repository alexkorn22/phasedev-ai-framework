import { createHash } from "crypto";
import { normalizeTestCommand } from "../test-commands/resolve-check-commands";

export function digestCommand(command: string): string {
  const normalized = normalizeTestCommand(command);
  return createHash("sha256").update(`command:${normalized}`, "utf8").digest("hex");
}
