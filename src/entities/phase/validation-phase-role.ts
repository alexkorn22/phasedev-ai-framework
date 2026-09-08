export const ITERATION_VALIDATION_ROLES = [
  "code-review",
  "security-review",
  "implementation-check"
] as const;

export const FINAL_VALIDATION_ROLES = [
  "code-review",
  "security-review",
  "implementation-check",
  "browser-qa"
] as const;

export const VALIDATION_PHASE_ROLES = [
  ...ITERATION_VALIDATION_ROLES,
  "browser-qa"
] as const;

export type ValidationPhaseRole = (typeof VALIDATION_PHASE_ROLES)[number];

type ValidationScopePhase = "iteration_validation" | "final_validation";

const ROLES_BY_PHASE: Record<ValidationScopePhase, readonly ValidationPhaseRole[]> = {
  iteration_validation: ITERATION_VALIDATION_ROLES,
  final_validation: FINAL_VALIDATION_ROLES
};

export function isValidationPhaseRole(
  phase: ValidationScopePhase,
  value: string
): value is ValidationPhaseRole {
  return (ROLES_BY_PHASE[phase] as readonly string[]).includes(value);
}

export function formatAllowedValidationRoles(phase: ValidationScopePhase): string {
  return ROLES_BY_PHASE[phase].join(", ");
}
