import { Config, loadConfig } from "../../entities/config/config";
import { Prompt } from "../../entities/phase/types";
import { archivePrompt } from "./archive-stage";
import {
  archiveReadinessBlocker,
  approvalBlocker,
  invalidDesignBlocker,
  invalidPlanBlocker,
  invalidPrdBlocker,
  invalidResearchBlocker,
  invalidRulesBlocker,
  prompt,
  validationFindingsBlocker
} from "./prompt-blockers";
import { resolveRoute } from "./flow-route";
import { unreachable } from "../../shared/type/unreachable";
import {
  renderChangeIntake,
  renderCodeResearch,
  renderFinalValidation,
  renderFindingRepair,
  renderImplementation,
  renderIterationPlanning,
  renderIterationValidation,
  renderTechnicalDesign
} from "./get-phase-prompt";

/**
 * Resolve the flow route from artifacts and return the matching prompt:
 * either a phase contract (same renderers as `phasedev phase`) or a blocker.
 *
 * Pure read-only: never mutates artifacts or state. The archive mutation is
 * owned by advance/startArchiveStage; state transitions are owned by advance.
 *
 * Not part of the public CLI surface: kept as the route→prompt parity harness
 * for controller tests and as the runtime dependency of
 * scripts/generate-agent-prompts.ts (npm run prompts:generate); production
 * CLI prompts go through getPhasePrompt.
 */
export function getRoutePrompt(projectPath: string, config: Config = loadConfig()): Prompt {
  const route = resolveRoute(projectPath);

  switch (route.kind) {
    case "invalid_archive_state":
      return archiveReadinessBlocker(
        "Invalid archive state.",
        route.invalidArchiveState.statePath,
        route.invalidArchiveState.reason
      );
    case "pending_archive":
      return archivePrompt(projectPath, route.archiveState, config);
    case "change_intake":
      return prompt("next", "change_intake", renderChangeIntake(projectPath, config, route.activeChangePath));
    case "invalid_prd":
      return invalidPrdBlocker(route.paths.prdPath, route.issues);
    case "invalid_execution_contract":
      return invalidRulesBlocker(route.paths.executionContractPath, route.issues);
    case "change_intake_approval":
      return approvalBlocker("change_intake", "Setup incomplete", route.paths.prdPath, "prd.md & execution_contract.md");
    case "code_research":
      return prompt("next", "code_research", renderCodeResearch(projectPath, config, route.paths));
    case "invalid_code_research":
      return invalidResearchBlocker(route.paths.researchPath, route.issues);
    case "technical_design":
      return prompt("next", "technical_design", renderTechnicalDesign(projectPath, config, route.paths));
    case "invalid_technical_design":
      return invalidDesignBlocker(route.paths.designPath, route.issues);
    case "technical_design_approval":
      return approvalBlocker("technical_design", "Design requires review", route.paths.designPath, "architecture/design.md");
    case "iteration_planning":
      return prompt("next", "iteration_planning", renderIterationPlanning(projectPath, config, route.paths));
    case "iteration_planning_approval":
      return approvalBlocker("iteration_planning", "Plan requires review", route.paths.iterationPlanPath, "iteration_plan.md");
    case "invalid_iteration_planning":
      return invalidPlanBlocker(route.paths.iterationPlanPath, route.issues);
    case "invalid_findings":
      return validationFindingsBlocker(route.paths.findingsPath, route.issues);
    case "finding_repair":
      return prompt("next", "finding_repair", renderFindingRepair(projectPath, config, route.paths));
    case "archive_readiness_blocked":
      return archiveReadinessBlocker(
        "All implementation iterations must be marked [x] before archive.",
        route.paths.iterationPlanPath,
        "Final validation is ready, but iteration_plan.md still has an incomplete phase."
      );
    case "archive_ready":
      // The archive mutation (move + .phase-archive.json) is owned by
      // `phasedev advance` (advanceFlow), never by prompt resolution.
      return archiveReadinessBlocker(
        "Archive is ready.",
        route.activeChangePath,
        "Run 'phasedev advance' to move the change into the archive and start the archive phase."
      );
    case "iteration": {
      if (route.phase === "iteration_validation") {
        return prompt("next", "iteration_validation", renderIterationValidation(projectPath, config, route.paths, route.activeIteration.id));
      }
      const rendered = renderImplementation(projectPath, config, route.paths, route.activeIteration.id);
      if (typeof rendered !== "string") {
        return rendered; // missing-test-command blocker
      }
      return prompt("next", "implementation", rendered);
    }
    case "final_validation":
      return prompt("next", "final_validation", renderFinalValidation(projectPath, config, route.paths));
    default:
      return unreachable(route, "getRoutePrompt route.kind");
  }
}
