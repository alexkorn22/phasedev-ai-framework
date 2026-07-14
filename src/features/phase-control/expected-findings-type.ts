import { ActivePhase } from "../../entities/change/flow-state";

export function expectedFindingsType(phase: ActivePhase): "iteration" | "final" | null {
  if (phase === "iteration_validation") return "iteration";
  if (phase === "final_validation") return "final";
  return null;
}
