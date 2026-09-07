import { parseFindingRowIteration } from "../validation-findings/parse-validation-findings";
import { Iteration } from "../iteration-plan/types";
import { TestCommands } from "./parse-test-commands";
import { renderMarkdownInlineCode } from "../../shared/markdown/inline-code";

export const FOCUSED_TEST_COMMAND_GATES = ["unit", "phase"] as const;
export type FocusedTestCommandGate = (typeof FOCUSED_TEST_COMMAND_GATES)[number];

export const TEST_TARGETS_PLACEHOLDER = "{{test_targets}}";

const UNSAFE_TARGET_PATTERN = /[;&|`<>]|\r|\n|&&|\|\||\$\(|\$\{|<<|<\(|>\(/;

export type FocusedCheckRecipeGate = FocusedTestCommandGate;

export function countTestTargetsPlaceholders(recipe: string): number {
  const normalized = normalizeTestCommand(recipe);
  let count = 0;
  let index = normalized.indexOf(TEST_TARGETS_PLACEHOLDER);
  while (index !== -1) {
    count += 1;
    index = normalized.indexOf(TEST_TARGETS_PLACEHOLDER, index + TEST_TARGETS_PLACEHOLDER.length);
  }
  return count;
}

export function validateFocusedCheckRecipe(gate: FocusedCheckRecipeGate, recipe: string): string[] {
  const normalized = normalizeTestCommand(recipe);
  const issues: string[] = [];
  if (normalized.length === 0) {
    issues.push(`Test Commands command \`${gate}\` must be non-empty.`);
    return issues;
  }

  const placeholderCount = countTestTargetsPlaceholders(normalized);
  if (placeholderCount > 1) {
    issues.push(`Test Commands command \`${gate}\` must contain at most one \`{{test_targets}}\` placeholder.`);
  }

  return issues;
}

export function validateFullCheckRecipe(recipe: string): string[] {
  const normalized = normalizeTestCommand(recipe);
  if (normalized.length === 0) {
    return ["Test Commands command `full` must be non-empty."];
  }
  if (checkRecipeHasTestTargetsPlaceholder(normalized)) {
    return ["Test Commands command `full` must not contain `{{test_targets}}` placeholders."];
  }
  return [];
}
export interface ResolvedFocusedCheck {
  gate: FocusedTestCommandGate;
  command: string;
}

export interface RepairFindingScope {
  iterationIds: number[];
  hasFinalScopeFindings: boolean;
}

export interface QueuedRepairFinding {
  phase: string;
  blocksPr: boolean;
  latestStatus: string;
}

export function normalizeTestCommand(value: string): string {
  return value.trim().replace(/^`(.+)`$/, "$1").replace(/\s+/g, " ").trim();
}

export function checkRecipeHasTestTargetsPlaceholder(recipe: string): boolean {
  return recipe.includes(TEST_TARGETS_PLACEHOLDER);
}

function tokenizeTargetSubstitution(targets: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (const char of targets) {
    if (quote) {
      current += char;
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

function dequoteToken(token: string): string {
  const trimmed = token.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function isRunnerFlagToken(token: string): boolean {
  const unquoted = dequoteToken(token);
  if (unquoted.length === 0) {
    return false;
  }
  return unquoted.startsWith("-");
}

function tokenizeCommand(command: string): string[] {
  return tokenizeTargetSubstitution(command);
}

function tokenLooksLikeExplicitTarget(token: string): boolean {
  const unquoted = dequoteToken(token);
  if (isRunnerFlagToken(token)) {
    return false;
  }
  return unquoted.includes("/") || unquoted.includes("**") || /\.(test|spec)\./i.test(unquoted);
}

function recipeRequiresExplicitTargets(recipe: string): boolean {
  return tokenizeCommand(normalizeTestCommand(recipe)).some(tokenLooksLikeExplicitTarget);
}

function evidenceMatchesLegacyExactSuperset(recipe: string, executed: string): boolean {
  const recipeTokens = tokenizeCommand(normalizeTestCommand(recipe));
  const executedTokens = tokenizeCommand(normalizeTestCommand(executed));
  if (recipeTokens.length === 0 || executedTokens.length < recipeTokens.length) {
    return false;
  }

  for (let index = 0; index < recipeTokens.length; index += 1) {
    if (recipeTokens[index] !== executedTokens[index]) {
      return false;
    }
  }

  for (let index = recipeTokens.length; index < executedTokens.length; index += 1) {
    if (isRunnerFlagToken(executedTokens[index])) {
      return false;
    }
    if (UNSAFE_TARGET_PATTERN.test(executedTokens[index])) {
      return false;
    }
  }

  return true;
}
function hasUnquotedShellComment(targets: string): boolean {
  let quote: '"' | "'" | null = null;
  for (const char of targets) {
    if (quote) {
      if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "#") {
      return true;
    }
  }
  return quote !== null;
}

export function isSafeTestTargetSubstitution(targets: string): boolean {
  const trimmed = targets.trim();
  if (trimmed.length === 0) {
    return false;
  }
  if (hasUnquotedShellComment(trimmed)) {
    return false;
  }
  if (UNSAFE_TARGET_PATTERN.test(trimmed)) {
    return false;
  }

  const tokens = tokenizeTargetSubstitution(trimmed);
  if (tokens.length === 0) {
    return false;
  }

  return tokens.every(token => !isRunnerFlagToken(token));
}

export function instantiateCheckRecipe(recipe: string, targets: string): string | undefined {
  const normalizedRecipe = normalizeTestCommand(recipe);
  if (!checkRecipeHasTestTargetsPlaceholder(normalizedRecipe)) {
    return undefined;
  }
  const trimmedTargets = targets.trim();
  if (!isSafeTestTargetSubstitution(trimmedTargets)) {
    return undefined;
  }
  return normalizeTestCommand(normalizedRecipe.replace(TEST_TARGETS_PLACEHOLDER, trimmedTargets));
}

export function evidenceMatchesCheckRecipe(recipe: string, executedCommand: string): boolean {
  const normalizedRecipe = normalizeTestCommand(recipe);
  const normalizedExecuted = normalizeTestCommand(executedCommand);

  if (!checkRecipeHasTestTargetsPlaceholder(normalizedRecipe)) {
    if (normalizedRecipe === normalizedExecuted) {
      return true;
    }
    if (recipeRequiresExplicitTargets(normalizedRecipe)) {
      return evidenceMatchesLegacyExactSuperset(normalizedRecipe, normalizedExecuted);
    }
    return false;
  }

  const placeholderIndex = normalizedRecipe.indexOf(TEST_TARGETS_PLACEHOLDER);
  if (placeholderIndex === -1) {
    return false;
  }

  const prefix = normalizedRecipe.slice(0, placeholderIndex);
  const suffix = normalizedRecipe.slice(placeholderIndex + TEST_TARGETS_PLACEHOLDER.length);

  if (!normalizedExecuted.startsWith(prefix) || !normalizedExecuted.endsWith(suffix)) {
    return false;
  }

  const extractedTargets = normalizedExecuted.slice(prefix.length, normalizedExecuted.length - suffix.length);
  return isSafeTestTargetSubstitution(extractedTargets);
}

export function isFocusedTestCommandGate(gate: string): gate is FocusedTestCommandGate {
  const normalizedGate = gate.trim().toLowerCase();
  return normalizedGate === "unit" || normalizedGate === "phase";
}

export function requiredFocusedGateNames(iteration: Iteration): FocusedTestCommandGate[] {
  const gates = (iteration.requiredChecks ?? [])
    .map(check => check.check.trim().toLowerCase())
    .filter(isFocusedTestCommandGate);
  return gates.length > 0 ? Array.from(new Set(gates)) : ["unit"];
}

function requiredGateNames(iteration: Iteration): FocusedTestCommandGate[] {
  return requiredFocusedGateNames(iteration);
}

function iterationListsFullGate(iteration: Iteration): boolean {
  return (iteration.requiredChecks ?? []).some(check => check.check.trim().toLowerCase() === "full");
}

export function resolveFocusedGateCommand(
  gate: FocusedTestCommandGate,
  testCommands: TestCommands
): string | undefined {
  return testCommands[gate];
}

function requiredCheckRecipe(
  requiredCheck: { check: string; command: string },
  testCommands?: TestCommands
): string | undefined {
  const gate = requiredCheck.check.trim().toLowerCase();
  if (testCommands && isFocusedTestCommandGate(gate)) {
    return resolveFocusedGateCommand(gate, testCommands);
  }
  const legacyCommand = normalizeTestCommand(requiredCheck.command);
  return legacyCommand.length > 0 ? legacyCommand : undefined;
}

export function evidenceMatchesRequiredCheck(
  requiredCheck: { check: string; command: string },
  evidenceCommand: string,
  testCommands?: TestCommands
): boolean {
  const recipe = requiredCheckRecipe(requiredCheck, testCommands);
  if (recipe !== undefined) {
    return evidenceMatchesCheckRecipe(recipe, evidenceCommand);
  }
  const legacyCommand = normalizeTestCommand(requiredCheck.command);
  return legacyCommand.length > 0 && normalizeTestCommand(evidenceCommand) === legacyCommand;
}

export function acceptedEvidenceCommands(
  requiredCheck: { check: string; command: string },
  testCommands?: TestCommands
): string[] {
  const recipe = requiredCheckRecipe(requiredCheck, testCommands);
  if (recipe !== undefined) {
    return [normalizeTestCommand(recipe)];
  }
  const legacyCommand = normalizeTestCommand(requiredCheck.command);
  return legacyCommand.length > 0 ? [legacyCommand] : [];
}

export function authoritativeRequiredCheckCommand(
  requiredCheck: { check: string; command: string },
  testCommands?: TestCommands
): string {
  return acceptedEvidenceCommands(requiredCheck, testCommands)[0] ?? requiredCheck.check.trim().toLowerCase();
}

function dedupeResolvedChecks(checks: ResolvedFocusedCheck[]): ResolvedFocusedCheck[] {
  const seen = new Set<string>();
  const deduped: ResolvedFocusedCheck[] = [];
  for (const check of checks) {
    const normalized = normalizeTestCommand(check.command);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    deduped.push({ gate: check.gate, command: check.command });
  }
  return deduped;
}

export function resolveIterationFocusedCheckCommands(
  iteration: Iteration,
  testCommands: TestCommands
): ResolvedFocusedCheck[] {
  const checks = requiredGateNames(iteration).flatMap(gate => {
    const command = resolveFocusedGateCommand(gate, testCommands);
    return command === undefined ? [] : [{ gate, command }];
  });
  return dedupeResolvedChecks(checks);
}

export function iterationRequiresFullGate(iteration: Iteration): boolean {
  return iterationListsFullGate(iteration);
}

function isFinalScopeFindingPhase(phase: string): boolean {
  return phase.trim().toLowerCase() === "final";
}

export function parseRepairFindingScope(findings: QueuedRepairFinding[]): RepairFindingScope {
  const queued = findings.filter(finding =>
    finding.blocksPr && ["open", "reopened"].includes(finding.latestStatus)
  );
  const iterationIds = new Set<number>();
  let hasFinalScopeFindings = false;

  for (const finding of queued) {
    if (isFinalScopeFindingPhase(finding.phase)) {
      hasFinalScopeFindings = true;
      continue;
    }
    const iterationId = parseFindingRowIteration(finding.phase);
    if (iterationId !== null) {
      iterationIds.add(iterationId);
    }
  }

  return {
    iterationIds: Array.from(iterationIds),
    hasFinalScopeFindings
  };
}

function resolveFinalScopeUnitFallback(testCommands: TestCommands): ResolvedFocusedCheck[] {
  const unitCommand = testCommands.unit;
  return unitCommand === undefined ? [] : [{ gate: "unit", command: unitCommand }];
}

export function resolveRepairFocusedCheckCommands(
  plan: Iteration[],
  testCommands: TestCommands,
  scope: RepairFindingScope
): ResolvedFocusedCheck[] {
  if (scope.iterationIds.length > 0) {
    const targetIterations = plan.filter(iteration => scope.iterationIds.includes(iteration.id));
    const checks = targetIterations.flatMap(iteration => resolveIterationFocusedCheckCommands(iteration, testCommands));
    return dedupeResolvedChecks(checks);
  }

  if (scope.hasFinalScopeFindings) {
    return dedupeResolvedChecks(resolveFinalScopeUnitFallback(testCommands));
  }

  return [];
}

export function requiredRepairFocusedGateNames(
  plan: Iteration[],
  scope: RepairFindingScope
): FocusedTestCommandGate[] {
  if (scope.iterationIds.length > 0) {
    const gates = new Set<FocusedTestCommandGate>();
    for (const iteration of plan.filter(entry => scope.iterationIds.includes(entry.id))) {
      for (const gate of requiredGateNames(iteration)) {
        gates.add(gate);
      }
    }
    return Array.from(gates);
  }

  if (scope.hasFinalScopeFindings) {
    return ["unit"];
  }

  return [];
}

export function missingRepairFocusedGateCommands(
  plan: Iteration[],
  testCommands: TestCommands,
  scope: RepairFindingScope
): FocusedTestCommandGate[] {
  return requiredRepairFocusedGateNames(plan, scope).filter(gate => testCommands[gate] === undefined);
}

const TARGET_SUBSTITUTION_GUIDANCE =
  "Substitute `{{test_targets}}` with new/changed test file paths or package/test selectors from your actual diff before executing; record the exact instantiated command in Check Evidence.";

export function renderFocusedCheckRecipeLine(check: ResolvedFocusedCheck): string {
  const renderedCommand = renderMarkdownInlineCode(check.command);
  if (checkRecipeHasTestTargetsPlaceholder(check.command)) {
    return `- ${check.gate}: ${renderedCommand} — ${TARGET_SUBSTITUTION_GUIDANCE}`;
  }
  return `- ${check.gate}: ${renderedCommand}`;
}

export function renderResolvedCheckCommandLines(checks: ResolvedFocusedCheck[]): string {
  const lines = checks.map(renderFocusedCheckRecipeLine);
  if (lines.some(line => line.includes(TEST_TARGETS_PLACEHOLDER))) {
    return `${lines.join("\n")}\n- Do not run recipe lines above while \`{{test_targets}}\` remains unresolved.`;
  }
  return lines.join("\n");
}
