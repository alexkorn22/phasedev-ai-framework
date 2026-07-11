export function parseConfigGetKey(args: string[]): string {
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--project-path" || arg === "-p" || arg === "--config") { i++; continue; }
    if (arg === "set") continue;
    if (arg.startsWith("--")) continue;
    return arg;
  }
  return "";
}
