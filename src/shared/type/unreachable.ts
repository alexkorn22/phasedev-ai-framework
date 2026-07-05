/**
 * Compile-time exhaustiveness guard for switches/if-chains over a
 * discriminated union. Call it in the branch TypeScript has narrowed to
 * `never`; if a new union member is added and that branch stops being
 * reachable-only-in-theory, the call site fails to compile until it is
 * handled explicitly.
 */
export function unreachable(value: never, context: string): never {
  throw new Error(`Unreachable ${context} case: ${JSON.stringify(value)}`);
}
