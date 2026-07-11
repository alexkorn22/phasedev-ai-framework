export class FlagValueError extends Error {}

export function parseStringOption(args: string[], option: string): string | undefined {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === option) {
      const value = args[i + 1];
      if (value === undefined) {
        return undefined;
      }
      if (value.startsWith("--")) {
        throw new FlagValueError(`Option ${option} requires a value, got flag "${value}" instead.`);
      }
      return value;
    }
  }
  return undefined;
}
