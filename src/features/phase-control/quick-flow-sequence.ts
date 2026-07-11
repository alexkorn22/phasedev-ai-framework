import { ActivePhase } from "../../entities/change/flow-state";

export const QUICK_PHASE_SEQUENCE: readonly ActivePhase[] = [
  "quick_plan",
  "quick_implementation",
  "quick_validation",
  "quick_spec_revision",
  "archive"
];

export function nextQuickPhase(phase: ActivePhase): ActivePhase | null {
  const index = QUICK_PHASE_SEQUENCE.indexOf(phase);
  if (index === -1 || index === QUICK_PHASE_SEQUENCE.length - 1) return null;
  return QUICK_PHASE_SEQUENCE[index + 1];
}
