/**
 * Shared source for the iteration heading regex used by both
 * parsePlan (static match) and updateIterationStatus (dynamic replacement).
 *
 * Matches: ## Iteration N: Name [x|~| |/]
 * Groups: 1 = id, 2 = name, 3 = status marker
 */
export const ITERATION_HEADING_REGEX_SOURCE =
  String.raw`##\s*Iteration\s*(\d+)\s*:\s*(.+?)\s*\[\s*(x|~| |\/)\s*\]`;
