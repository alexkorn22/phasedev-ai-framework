export const VALIDATION_PHASE_ROLES = [
  "code-review",
  "security-review",
  "implementation-check"
] as const;

export type ValidationPhaseRole = (typeof VALIDATION_PHASE_ROLES)[number];

export function isValidationPhaseRole(value: string): value is ValidationPhaseRole {
  return (VALIDATION_PHASE_ROLES as readonly string[]).includes(value);
}

export function formatAllowedValidationRoles(): string {
  return VALIDATION_PHASE_ROLES.join(", ");
}
