import { loadFlowState } from "../../entities/change/flow-state";
import { renderTemplate } from "../../shared/templates/render-template";
import { Phase } from "../../entities/phase/types";

const CLARIFY_SCOPES = {
  change_intake: "clarify_scope_change_intake",
  technical_design: "clarify_scope_technical_design",
  iteration_planning: "clarify_scope_iteration_planning"
} as const;

type ClarifyPhase = keyof typeof CLARIFY_SCOPES;

export interface ClarifyPrompt {
  prompt: string;
  phase: Phase | null;
  blocked: boolean;
  reason?: string;
}

export function hasClarifyContract(phase: Phase): boolean {
  return Object.prototype.hasOwnProperty.call(CLARIFY_SCOPES, phase);
}

function renderClarify(phase: ClarifyPhase, activePhaseLabel: string): string {
  return renderTemplate("clarify", {
    active_phase: activePhaseLabel,
    phase_scope: renderTemplate(CLARIFY_SCOPES[phase], {})
  });
}

export function getClarifyPrompt(projectPath: string, changeName?: string): ClarifyPrompt {
  let state;
  try {
    state = loadFlowState(projectPath, changeName);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      prompt: `[PHASEDEV] Cannot resolve flow state: ${message}`,
      phase: null,
      blocked: true,
      reason: "Invalid flow state"
    };
  }

  if (!state) {
    if (changeName) {
      return {
        prompt: `[PHASEDEV] Change "${changeName}" has no readable state.json. Run \`phasedev list\` to see the active changes.`,
        phase: null,
        blocked: true,
        reason: "Change not found"
      };
    }
    return {
      prompt: renderClarify("change_intake", "change_intake (pre-flow: no change created yet)"),
      phase: "change_intake",
      blocked: false
    };
  }

  if (state.flowMode === "quick") {
    return {
      prompt: `[PHASEDEV] Quick-mode change (phase: ${state.activePhase}). The task-level interview runs before \`create-change\`, and \`quick_plan\` carries its own plan-confirmation stop — there is no separate clarify contract inside the quick sequence. Run \`phasedev phase\` for the current quick contract.`,
      phase: state.activePhase,
      blocked: false
    };
  }

  if (!hasClarifyContract(state.activePhase)) {
    return {
      prompt: `[PHASEDEV] No decision-points contract for phase ${state.activePhase}. Decisions in this phase follow from artifacts and code, not from the user; run \`phasedev phase\` for the phase contract.`,
      phase: state.activePhase,
      blocked: false
    };
  }

  const phase = state.activePhase as ClarifyPhase;
  return { prompt: renderClarify(phase, phase), phase, blocked: false };
}
