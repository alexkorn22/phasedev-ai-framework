import { FlowState, loadFlowState } from "../../entities/change/flow-state";
import { AmbiguousChangeError } from "../../entities/change/change-errors";
import { renderTemplate } from "../../shared/templates/render-template";
import { Phase } from "../../entities/phase/types";

const CLARIFY_SCOPES = {
  change_intake: "clarify_scope_change_intake",
  technical_design: "clarify_scope_technical_design",
  iteration_planning: "clarify_scope_iteration_planning"
} as const;

// The intake scope asks the same questions before and after the change directory
// exists; only where the agreed answers go differs, so the routing tail is the
// one part that varies.
const INTAKE_ROUTING = {
  preflow: "clarify_routing_preflow",
  activeChange: "clarify_routing_active_change"
} as const;

type ClarifyPhase = keyof typeof CLARIFY_SCOPES;
type IntakeRouting = keyof typeof INTAKE_ROUTING;

export interface ClarifyPrompt {
  prompt: string;
  phase: Phase | null;
  blocked: boolean;
  reason?: string;
}

export function hasClarifyContract(phase: Phase): phase is ClarifyPhase {
  return Object.prototype.hasOwnProperty.call(CLARIFY_SCOPES, phase);
}

// Only change_intake has a routing tail ({{intake_routing}}); the other two
// scopes render with no extra data, so the routing selector is part of their
// type only when the phase is change_intake.
type ScopeSelector =
  | { readonly phase: "change_intake"; readonly routing: IntakeRouting }
  | { readonly phase: Exclude<ClarifyPhase, "change_intake"> };

function renderScope(selector: ScopeSelector): string {
  return selector.phase === "change_intake"
    ? renderTemplate(CLARIFY_SCOPES.change_intake, { intake_routing: renderTemplate(INTAKE_ROUTING[selector.routing], {}) })
    : renderTemplate(CLARIFY_SCOPES[selector.phase], {});
}

function renderClarify(activePhaseLabel: string, selector: ScopeSelector): string {
  return renderTemplate("clarify", {
    active_phase: activePhaseLabel,
    phase_scope: renderScope(selector)
  });
}

export function getClarifyPrompt(projectPath: string, changeName?: string): ClarifyPrompt {
  let state: FlowState | null;
  try {
    state = loadFlowState(projectPath, changeName);
  } catch (error) {
    if (error instanceof AmbiguousChangeError) {
      return {
        prompt: `[PHASEDEV] BLOCKED: ${error.message}\nTip: Use \`phasedev list\` to see all changes and their status.`,
        phase: null,
        blocked: true,
        reason: "Ambiguous flow state"
      };
    }
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
      prompt: renderClarify("change_intake (pre-flow: no change created yet)", { phase: "change_intake", routing: "preflow" }),
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

  const phase = state.activePhase;
  const scopeSelector: ScopeSelector = phase === "change_intake" ? { phase, routing: "activeChange" } : { phase };
  return { prompt: renderClarify(phase, scopeSelector), phase, blocked: false };
}

export function clarifyReminderFor(phase: Phase): string {
  if (phase === "change_intake" || !hasClarifyContract(phase)) {
    return "";
  }
  return " Before spawning sub-agents, run: phasedev clarify.";
}
