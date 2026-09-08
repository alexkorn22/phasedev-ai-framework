import { Config } from "../../entities/config/config";
import { ValidationPhaseRole } from "../../entities/phase/validation-phase-role";
import { BlockingSeverity } from "../../entities/validation-findings/blocking-severity";
import { renderMarkdownInlineCode } from "../../shared/markdown/inline-code";
import { renderTemplate } from "../../shared/templates/render-template";
import { renderSkillComplianceLine } from "./skill-policy";
import { renderBlockingSeverityPolicy } from "./blocking-severity-policy";
import { renderValidationCommonContract } from "./validation-common-contract";
import { renderArtifactContract } from "./artifact-contract";
import {
  flowFinalValidationCheckCommand,
  renderReviewRoleValidationFindingsTemplate,
  renderValidationFindingsTemplate,
  REVIEW_ROLE_VALIDATION_FINDINGS_CANONICAL_FILL_RULES,
  VALIDATION_FINDINGS_CANONICAL_FILL_RULES
} from "./validation-findings-contract";
import { shellQuote } from "../../shared/shell/shell-quote";
import { todayIsoDate } from "../../shared/time/today-iso-date";

type ValidationScopePhase = "iteration_validation" | "final_validation";

function roleHeader(role: ValidationPhaseRole): string {
  return `Execution role: ${role}`;
}

const ITERATION_VALIDATION_FULL_CHECKS = `Required phase-contract checks:
- scope = current iteration;
- use the current iteration \`Expected Change Surface\` as a forecast/traceability aid for changed-file inventory and scope comparison, but not as a hard allowlist or substitute for actual repository evidence;
- incidental technical changes: changes to auxiliary files (such as type definitions, re-exports, test runner configurations, or caller wiring) that are directly necessary to satisfy the compiler, linter, or test runner as a consequence of the planned work MUST NOT be treated as plan-surface defects (\`class: plan\`), provided they do not add unapproved features or violate risk boundaries;
- a file outside \`Expected Change Surface\` is not automatically a defect; if incidental and still satisfying approved requirements/design, require a concise justification in the report; if it changes semantics/scope/boundaries, add a \`class: plan\` or \`class: design\` finding and follow reopen/feedback policy;
- inspect every changed production/source/config/test file tied to the current iteration, including files classified as outside expected in the controller inventory, not only the flow artifacts or \`Check Evidence\`;
- plan-first check: the current iteration implementation matches \`Goal\`, \`Tasks\`, \`Checks\`, \`Check Evidence\`, and iteration scope from [iteration_plan.md]({{plan_path}});
- PRD/design are used as approved constraints and traceability context, not as full PRD completeness validation;
- validate the current iteration against the concrete \`R#\` and \`SC#\` tied to this iteration in the implementation plan/design;
- verify that the current iteration does not violate approved PRD \`Target state\`, \`Risk boundaries\`, or approved design boundaries;
- verify that the current iteration does not add behavior outside the positive PRD contract unless explicitly approved in design/plan;
- completeness of production/test/source/config changes for the current iteration and current iteration task statuses is checked through review methods without running tests;
- \`Check Evidence\` for the current iteration in [iteration_plan.md]({{plan_path}}) is checked as evidence that Implementation checks ran; verify that entries cite exact commands and decisive output (exit code 0, test counts) rather than subjective claims; if an entry contains vague hand-waving ("looks good", "verified manually"), flag it as a finding for unproven verification;
- do not rerun tests or additional checks at this phase;
- Write validation result to [validation_findings.md]({{findings_path}}) using only the embedded Artifact Build Contract for structure, record rows and the verdict only through the phasedev findings commands (add-finding / resolve-finding / reopen-finding / set-verdict); \`phasedev check-validation\` catches every structural violation.
- if the final verdict is \`ready\` or \`ready_with_risks\`, change the current iteration status in [iteration_plan.md]({{plan_path}}) from \`[~]\` to \`[x]\`;
- if the final verdict is \`repair_required\`, keep the current iteration status as \`[~]\`.`;

const FINAL_VALIDATION_FULL_CHECKS = `Required phase-contract checks:
- scope = full change;
- all iterations in [iteration_plan.md]({{plan_path}}) have status \`[x]\`;
- Final Validation does not mark iterations as \`[x]\`;
- change-set inventory gate: before deciding the verdict, identify the complete set of repository files changed outside \`.phasedev/**\` from available read-only repository evidence;
- inspect every changed production/source/config/test file outside \`.phasedev/**\`, not only the flow artifacts, implementation plan, or \`Check Evidence\`;
- final requirements conformance pass: verify that the actual changed code implements exactly the initial change requirements from PRD, approved design, and implementation plan artifacts; if behavior is missing, extra, contradictory, or only implied by \`Check Evidence\`, add a finding;
- final code review pass: perform a full read-only code review of the changed files outside \`.phasedev/**\` using the applicable skills per the Skill Boundary;
- final security review pass: perform a read-only security review of the changed files outside \`.phasedev/**\` using the applicable skills per the Skill Boundary;
- PRD-first check: the actual change set must satisfy the approved [prd.md]({{prd_path}}), not only the implementation plan;
- \`Intent\`: \`Change type\`, \`Why\`, \`Target state\`, and \`Risk boundaries\` align with actual implementation and validation evidence;
- \`Requirements\`: every \`R#\` is implemented by the actual change set or has a finding;
- \`Success Criteria\`: every \`SC#\` is demonstrably met according to its PRD \`Evidence\` type or has a finding;
- no behavior outside the positive PRD contract (\`Target state\`, \`R#\`, \`SC#\`, \`Risk boundaries\`) was implemented without approval;
- \`Target state\` from \`Intent\` is covered by approved plan/design and the actual change set;
- \`Risk boundaries\` from \`Intent\` are not violated; if risk acceptance is required, the finding must be \`RECOMMENDED\` or \`MUST-FIX\` by severity;
- \`Generation Bundle\` in [iteration_plan.md]({{plan_path}}) is checked against the actual change set: declared required areas must be completed or have a finding;
- \`Expected Change Surface\` in [iteration_plan.md]({{plan_path}}) is a delivery forecast for comparing expected and actual changed areas; it is not a hard allowlist, not a new requirements source, and does not replace PRD-first validation or actual repo evidence;
- full-gate execution: run the \`full\` gate command from \`execution_contract.md\` exactly once before deciding the verdict; \`verdict: ready\` or \`verdict: ready_with_risks\` is allowed only when the full gate run passed; if the full gate fails with product test failures, add a \`MUST-FIX\` finding with the exact command, failing test/path evidence, and set \`verdict: repair_required\`; if the command, binary, sandbox, network, or environment is unavailable, report blocked and remain in \`final_validation\` without adding a product finding; do not rerun \`unit\`, \`phase\`, or additional checks;
- completeness of production/test/source/config changes from the approved plan is checked through review methods; the single \`full\` gate run above is the only allowed execution;
- \`Check Evidence\` across all iterations in [iteration_plan.md]({{plan_path}}) is checked as evidence that Implementation checks ran, but it is not a requirements source and does not replace independent read-only review;
- Write validation result to [validation_findings.md]({{findings_path}}) using only the embedded Artifact Build Contract for structure, record rows and the verdict only through the phasedev findings commands (add-finding / resolve-finding / reopen-finding / set-verdict); \`phasedev check-validation\` catches every structural violation.`;

function iterationCodeReviewChecks(): string {
  return `Required phase-contract checks:
- ${roleHeader("code-review")}
- scope = current iteration;
- use the controller-observed changed-file inventory as the complete review target set, including every file classified as outside expected;
- perform the code review pass only: review every changed production/source/config/test file in the inventory for correctness, edge cases, error handling, architecture boundaries, maintainability, and test gaps for changed behavior;
- record findings ONLY with \`phasedev add-finding\` using \`Class = code_review\`;
- do NOT perform security review, requirements conformance, test execution, verdict recording, iteration status updates, or completion gates owned by another role;
- stop after recording findings; another role owns verdict and completion gates.`;
}

function iterationSecurityReviewChecks(): string {
  return `Required phase-contract checks:
- ${roleHeader("security-review")}
- scope = current iteration;
- use the controller-observed changed-file inventory as the complete review target set, including every file classified as outside expected;
- perform the security review pass only: review every changed file in the inventory for user/input handling, output encoding/XSS, injection risks, authorization/data isolation, secret exposure, unsafe network/file/process access, dangerous APIs, and dependency/config exposure;
- record findings ONLY with \`phasedev add-finding\` using \`Class = security\`;
- do NOT perform code review, requirements conformance, test execution, verdict recording, iteration status updates, or completion gates owned by another role;
- stop after recording findings; another role owns verdict and completion gates.`;
}

function iterationImplementationCheckChecks(): string {
  return `Required phase-contract checks:
- ${roleHeader("implementation-check")}
- scope = current iteration;
- requirements conformance pass: confirm the current iteration satisfies its approved plan/design/PRD trace and does not add unapproved behavior;
- audit every actual changed file in the controller inventory against instantiated Check Evidence; report any uncovered changed file as a \`MUST-FIX\` \`Class = validation\` finding without rerunning tests;
- audit \`Check Evidence\` for the current iteration and perform the test quality audit using phase-allowed evidence only;
- do not rerun tests or additional checks at this phase;
- record blocking gaps with \`phasedev add-finding\` and set the phase verdict ONLY with \`phasedev set-verdict\`;
- run \`phasedev check-validation\` before reporting this role complete;
- if the final verdict is \`ready\` or \`ready_with_risks\`, change the current iteration status in [iteration_plan.md]({{plan_path}}) from \`[~]\` to \`[x]\`;
- if the final verdict is \`repair_required\`, keep the current iteration status as \`[~]\`;
- do NOT perform the code review pass or security review pass in this role; other roles own those passes.`;
}

function finalCodeReviewChecks(): string {
  return `Required phase-contract checks:
- ${roleHeader("code-review")}
- scope = full change;
- perform a full read-only code review pass of changed files outside \`.phasedev/**\`;
- record findings ONLY with \`phasedev add-finding\` using \`Class = code_review\`;
- do NOT perform security review, requirements conformance, full-gate execution, verdict recording, or completion gates owned by another role;
- stop after recording findings; another role owns verdict and completion gates.`;
}

function finalSecurityReviewChecks(): string {
  return `Required phase-contract checks:
- ${roleHeader("security-review")}
- scope = full change;
- perform a full read-only security review pass of changed files outside \`.phasedev/**\`;
- record findings ONLY with \`phasedev add-finding\` using \`Class = security\`;
- do NOT perform code review, requirements conformance, full-gate execution, verdict recording, or completion gates owned by another role;
- stop after recording findings; another role owns verdict and completion gates.`;
}

function finalImplementationCheckChecks(fullGateCommand: string): string {
  const renderedFullGateCommand = renderMarkdownInlineCode(fullGateCommand);
  return `Required phase-contract checks:
- ${roleHeader("implementation-check")}
- scope = full change;
- all iterations in [iteration_plan.md]({{plan_path}}) have status \`[x]\`;
- final requirements conformance pass: verify the full change against PRD, approved design, and implementation plan;
- audit \`Check Evidence\` across all iterations and perform the test quality audit using phase-allowed evidence;
- after the requirements conformance pass and Check Evidence audit are complete, run the \`full\` gate command exactly once: ${renderedFullGateCommand}; do not run it before review/evidence completion; do not start a background dev-server or drive a browser;
- after the single \`full\` gate run, record the gate result with \`phasedev record-gate full --result passed|failed|blocked --evidence "..."\`;
- if the full gate run fails with product test failures, add a \`MUST-FIX\` finding (class \`test\` or \`implementation\`) with the exact command and failing test/path evidence, run \`phasedev record-gate full --result failed\`, and set \`verdict: repair_required\`; Required Fix must name the failing test/path, not "re-run full";
- if the full gate command, binary, sandbox, network, or environment is unavailable, run \`phasedev record-gate full --result blocked\`; do not add a finding, do not set a terminal verdict, and do not route to \`finding_repair\`; retry only after environment or access changes;
- \`verdict: ready\` or \`verdict: ready_with_risks\` is allowed only after \`phasedev record-gate full\` passed;
- record other blocking gaps with \`phasedev add-finding\` and set the phase verdict ONLY with \`phasedev set-verdict\`;
- run \`phasedev check-validation\` before reporting this role complete;
- do NOT perform the code review pass or security review pass in this role; other roles own those passes.`;
}

function finalBrowserQaChecks(browser: { start: string; url: string; criteria: string }): string {
  return `Required phase-contract checks:
- ${roleHeader("browser-qa")}
- scope = full change Browser Validation section from [execution_contract.md]({{rules_path}});
- start the application using the configured start instructions: ${browser.start}
- open the URL: ${browser.url}
- walk the acceptance criteria: ${browser.criteria}
- record product defects ONLY with \`phasedev add-finding\` using Class = implementation, test, or security;
- on environment failure (sandbox restrictions, missing binary, port bind failure from the environment): run \`phasedev record-gate browser --result blocked --evidence "..."\`; do NOT add a finding; do NOT run \`phasedev set-verdict\`;
- on application crash at start (product defect): add a finding (class implementation or test), then run \`phasedev record-gate browser --result failed\`;
- after completing browser scenarios (product bugs may still be recorded as findings): run \`phasedev record-gate browser --result passed\` when the UI was exercised; product bugs remain separate findings;
- do NOT run \`unit\`, \`phase\`, or the \`full\` gate command;
- do NOT run \`phasedev set-verdict\`.`;
}

export function renderValidationRoleChecks(
  phase: ValidationScopePhase,
  role?: ValidationPhaseRole,
  options?: {
    fullGateCommand?: string;
    browserValidation?: { start: string; url: string; criteria: string };
  }
): string {
  if (role === undefined) {
    return phase === "iteration_validation" ? ITERATION_VALIDATION_FULL_CHECKS : FINAL_VALIDATION_FULL_CHECKS;
  }

  if (phase === "iteration_validation") {
    switch (role) {
      case "code-review":
        return iterationCodeReviewChecks();
      case "security-review":
        return iterationSecurityReviewChecks();
      case "implementation-check":
        return iterationImplementationCheckChecks();
      case "browser-qa":
        return iterationCodeReviewChecks();
    }
  }

  switch (role) {
    case "code-review":
      return finalCodeReviewChecks();
    case "security-review":
      return finalSecurityReviewChecks();
    case "implementation-check":
      return finalImplementationCheckChecks(options?.fullGateCommand ?? "<missing full gate command>");
    case "browser-qa":
      return finalBrowserQaChecks(options?.browserValidation ?? {
        start: "<missing browser start>",
        url: "<missing browser url>",
        criteria: "<missing browser criteria>"
      });
  }
}

const ITERATION_FULL_ALLOWLIST = `## Artifact allowlist

Allowed persistent artifacts for this phase:
- active change folder \`validation_findings.md\` at the Artifact Build Contract Output path
- iteration status in active change folder \`iteration_plan.md\`, only when allowed by validation verdict

Any file not listed above is read-only for this phase.`;

const FINAL_FULL_ALLOWLIST = `## Artifact allowlist

Allowed persistent artifacts for this phase:
- active change folder \`validation_findings.md\` at the Artifact Build Contract Output path

Any file not listed above is read-only for this phase.`;

const FINAL_IMPLEMENTATION_CHECK_ALLOWLIST = `## Artifact allowlist

Allowed persistent artifacts for this phase:
- active change folder \`validation_findings.md\` at the Artifact Build Contract Output path
- active change folder \`final_gate_evidence.md\` via \`phasedev record-gate\` only (never hand-edit)

Any file not listed above is read-only for this phase.`;

const BROWSER_QA_ALLOWLIST = `## Artifact allowlist

Allowed persistent artifacts for this phase:
- active change folder \`validation_findings.md\` at the Artifact Build Contract Output path (findings rows only through \`phasedev add-finding\`)
- active change folder \`final_gate_evidence.md\` via \`phasedev record-gate\` only (never hand-edit)

Any file not listed above is read-only for this phase.`;

const FINDINGS_ONLY_ALLOWLIST = `## Artifact allowlist

Allowed persistent artifacts for this phase:
- active change folder \`validation_findings.md\` at the Artifact Build Contract Output path (findings rows only through \`phasedev add-finding\`)

Any file not listed above is read-only for this phase.`;

const ITERATION_IMPLEMENTATION_CHECK_ALLOWLIST = `## Artifact allowlist

Allowed persistent artifacts for this phase:
- active change folder \`validation_findings.md\` at the Artifact Build Contract Output path
- iteration status in active change folder \`iteration_plan.md\`, only when allowed by validation verdict

Any file not listed above is read-only for this phase.`;

export function renderValidationRoleAllowlist(
  phase: ValidationScopePhase,
  role?: ValidationPhaseRole
): string {
  if (role === undefined) {
    return phase === "iteration_validation" ? ITERATION_FULL_ALLOWLIST : FINAL_FULL_ALLOWLIST;
  }

  if (role === "browser-qa") {
    return BROWSER_QA_ALLOWLIST;
  }

  if (role === "implementation-check") {
    return phase === "iteration_validation" ? ITERATION_IMPLEMENTATION_CHECK_ALLOWLIST : FINAL_IMPLEMENTATION_CHECK_ALLOWLIST;
  }

  return FINDINGS_ONLY_ALLOWLIST;
}

const ITERATION_FULL_COMPLETION = `Phase completion:
- After writing \`validation_findings.md\` and possibly updating the iteration status, stop.
- On a \`ready\` or \`ready_with_risks\` verdict, after marking the iteration \`[x]\`, stop and report readiness. The orchestrator or user will commit the iteration's code changes together with the updated \`.phasedev\` artifacts (suggested message: \`phasedev(<change>): iteration N — <name>\`) before running \`phasedev advance\`. If the working tree is not clean, \`phasedev advance\` will block until the iteration is committed (unless \`requireIterationCommit: false\` in config.yaml).
- Tell the user the verdict, whether the iteration is confirmed correctly solved, and the next transition through \`phasedev advance\`.
- If the user reports a defect after the verdict is written and before \`phasedev advance\`, do not edit repository code and do not delegate a code task: record it with \`phasedev add-finding "<finding>" <severity> --required-fix <text> --class <class>\` (the command corrects the verdict automatically), then stop — you do not run \`phasedev advance\`; the flow driver (user or orchestrator) advances, and the flow routes to finding_repair where the fix is implemented.`;

const FINAL_FULL_COMPLETION = `Phase completion:
- After writing \`validation_findings.md\`, stop.
- Tell the user the verdict, whether the full change is confirmed correctly solved, and the next transition through \`phasedev advance\`.
- If the user reports a defect after the verdict is written and before \`phasedev advance\`, do not edit repository code and do not delegate a code task: record it with \`phasedev add-finding "<finding>" <severity> --required-fix <text> --class <class>\` (the command corrects the verdict automatically), then stop — you do not run \`phasedev advance\`; the flow driver (user or orchestrator) advances, and the flow routes to finding_repair where the fix is implemented.`;

const REVIEW_ROLE_COMPLETION = `Phase completion:
- After recording findings with \`phasedev add-finding\`, stop and report what you inspected.
- Do not record verdicts, update iteration status, or perform completion gates owned by another role.`;

const IMPLEMENTATION_CHECK_ITERATION_COMPLETION = `Phase completion:
- After writing \`validation_findings.md\`, setting the verdict, and possibly updating the iteration status, stop.
- Run \`phasedev check-validation\` before reporting this role complete.
- Tell the user the verdict and whether the iteration is confirmed correctly solved.
- Do not perform code review or security review in this role.`;

const IMPLEMENTATION_CHECK_FINAL_COMPLETION = `Phase completion:
- After writing \`validation_findings.md\` and setting the verdict, stop.
- Run \`phasedev check-validation\` before reporting this role complete.
- Tell the user the verdict and whether the full change is confirmed correctly solved.
- Do not perform code review or security review in this role.`;

const BROWSER_QA_COMPLETION = `Phase completion:
- After recording findings with \`phasedev add-finding\` and browser gate evidence with \`phasedev record-gate browser\`, stop and report what you exercised.
- Do not record verdicts, update iteration status, run unit/phase/full commands, or perform completion gates owned by another role.`;

export function renderValidationRoleCompletion(
  phase: ValidationScopePhase,
  role?: ValidationPhaseRole
): string {
  if (role === undefined) {
    return phase === "iteration_validation" ? ITERATION_FULL_COMPLETION : FINAL_FULL_COMPLETION;
  }

  if (role === "browser-qa") {
    return BROWSER_QA_COMPLETION;
  }

  if (role === "implementation-check") {
    return phase === "iteration_validation"
      ? IMPLEMENTATION_CHECK_ITERATION_COMPLETION
      : IMPLEMENTATION_CHECK_FINAL_COMPLETION;
  }

  return REVIEW_ROLE_COMPLETION;
}

export function renderValidationIterationStatusRule(
  phase: ValidationScopePhase,
  role?: ValidationPhaseRole
): string {
  if (phase !== "iteration_validation") {
    return "";
  }
  if (role === undefined || role === "implementation-check") {
    return "- Update iteration status only in the linked active change folder [iteration_plan.md]({{plan_path}}).";
  }
  return "";
}

function reviewRoleInputArtifacts(phase: ValidationScopePhase): string {
  const lines = [
    "- PRD intent, requirements, and success criteria: [prd.md]({{prd_path}})",
    "- Approved design: [architecture/design.md]({{design_path}})",
    "- Implementation plan: [iteration_plan.md]({{plan_path}})"
  ];
  if (phase === "final_validation") {
    lines.push("- Existing validation findings: [validation_findings.md]({{findings_path}})");
  }
  return lines.join("\n");
}

function implementationCheckInputArtifacts(phase: ValidationScopePhase): string {
  return `${reviewRoleInputArtifacts(phase)}
- Test command rules: [execution_contract.md]({{rules_path}})`;
}

function legacyValidationInputArtifacts(phase: ValidationScopePhase): string {
  return `${implementationCheckInputArtifacts(phase)}`;
}

function reviewRoleRetrievalOrder(phase: ValidationScopePhase): string {
  if (phase === "iteration_validation") {
    return [
      "Retrieval order:",
      "- Start from the current iteration in [iteration_plan.md]({{plan_path}}), then read PRD/design only for the `R#`, `SC#`, risk boundaries, design decisions, and Check Evidence referenced by that iteration.",
      "- Treat linked artifact paths as the active change source of truth.",
      "- Use repository reads and narrow searches only to verify the current iteration changed-file set, implementation completeness, code review findings, and security findings."
    ].join("\n");
  }

  return [
    "Retrieval order:",
    "- Start from the approved PRD target state, requirements, success criteria, and risk boundaries; then read the approved design, all iterations of the implementation plan, and existing validation findings if present.",
    "- Treat linked artifact paths as the active change source of truth.",
    "- Use repository reads and narrow searches only to verify the full changed-file set, requirements completeness, code review findings, security findings, and contradictions between approved artifacts and actual code."
  ].join("\n");
}

function implementationCheckRetrievalOrder(phase: ValidationScopePhase): string {
  if (phase === "iteration_validation") {
    return [
      "Retrieval order:",
      "- Start from the current iteration in [iteration_plan.md]({{plan_path}}), then read PRD/design/rules only for the `R#`, `SC#`, risk boundaries, design decisions, check commands, and Check Evidence referenced by that iteration.",
      "- Treat linked artifact paths as the active change source of truth.",
      "- Use repository reads and narrow searches only to verify the current iteration changed-file set, implementation completeness, code review findings, and security findings."
    ].join("\n");
  }

  return [
    "Retrieval order:",
    "- Start from the approved PRD target state, requirements, success criteria, and risk boundaries; then read the approved design, all iterations of the implementation plan, rules, and existing validation findings if present.",
    "- Treat linked artifact paths as the active change source of truth.",
    "- Use repository reads and narrow searches only to verify the full changed-file set, requirements completeness, code review findings, security findings, and contradictions between approved artifacts and actual code."
  ].join("\n");
}

export function renderValidationRoleInputArtifacts(
  phase: ValidationScopePhase,
  role?: ValidationPhaseRole
): string {
  if (role === undefined) {
    return legacyValidationInputArtifacts(phase);
  }
  if (role === "implementation-check") {
    return implementationCheckInputArtifacts(phase);
  }
  if (role === "browser-qa") {
    return `${reviewRoleInputArtifacts(phase)}
- Browser Validation and test command rules: [execution_contract.md]({{rules_path}})`;
  }
  return reviewRoleInputArtifacts(phase);
}

export function renderValidationRoleRetrievalOrder(
  phase: ValidationScopePhase,
  role?: ValidationPhaseRole
): string {
  if (role === "browser-qa") {
    return [
      "Retrieval order:",
      "- Start from the Browser Validation section in [execution_contract.md]({{rules_path}}), then read PRD/design/plan only for the `R#`, `SC#`, and risk boundaries needed to interpret the browser criteria.",
      "- Treat linked artifact paths as the active change source of truth.",
      "- Use repository reads only to start the app, exercise the configured URL/criteria, and verify product defects."
    ].join("\n");
  }
  if (role === undefined || role === "implementation-check") {
    return implementationCheckRetrievalOrder(phase);
  }
  return reviewRoleRetrievalOrder(phase);
}

type ReviewRoleCommonVariables = {
  validation_artifact_read_order: string;
  validation_scope_sources: string;
  validation_changed_file_scope: string;
  validation_budget_target: string;
  validation_stop_coverage_units: string;
};

function reviewRoleCommonVariables(phase: ValidationScopePhase): ReviewRoleCommonVariables {
  if (phase === "final_validation") {
    return {
      validation_artifact_read_order: "`prd.md`, `architecture/design.md`, `iteration_plan.md` all iterations including `Generation Bundle`, `Overview`, `Expected Change Surface`, `Checks`, and `Check Evidence`, and existing `validation_findings.md` if present",
      validation_scope_sources: "the full approved PRD `Intent`, every `R#`, every `SC#`, approved design decisions and risk boundaries, all implementation plan iterations, `Generation Bundle`, iteration `Expected Change Surface` entries, and all Check Evidence rows",
      validation_changed_file_scope: "in the full change set",
      validation_budget_target: "full-change artifacts, all changed files outside `.phasedev/**`, and narrow searches needed to prove completeness or a concrete finding",
      validation_stop_coverage_units: "every approved `R#`, `SC#`, applicable design/risk boundary, implementation iteration, Check Evidence row, and changed file outside `.phasedev/**`"
    };
  }

  return {
    validation_artifact_read_order: "`iteration_plan.md` current iteration, then `prd.md`, `architecture/design.md`, and existing `validation_findings.md` if present",
    validation_scope_sources: "the current iteration `Goal`, `Expected Change Surface`, `Tasks`, `Checks`, `Check Evidence`, related `R#`, related `SC#`, and approved risk/design boundaries",
    validation_changed_file_scope: "tied to the current iteration",
    validation_budget_target: "current-iteration artifacts, current-iteration changed files, and narrow searches needed to prove completeness or a concrete finding",
    validation_stop_coverage_units: "every current-iteration task, related `R#`, related `SC#`, Check Evidence row, applicable risk/design boundary, and changed file"
  };
}

function reviewRoleCommonContract(phase: ValidationScopePhase): string {
  const scopeLine = phase === "iteration_validation"
    ? "Role scope is the current iteration only."
    : "Role scope is the full change.";
  const variables = reviewRoleCommonVariables(phase);
  const scopedCommon = renderTemplate("validation_common_review_role", {
    ...variables,
    validation_execution_rule: "Validation mode is review-only: do not rerun tests, builds, browsers, migrations, deployments, or other execution gates.",
    skill_compliance_line: renderSkillComplianceLine()
  });

  return [
    "## Role-Scoped Validation Contract",
    "",
    `- ${scopeLine}`,
    "- This role records findings only through `phasedev add-finding`.",
    "- This role does not own verdict recording, check-validation, test execution, or iteration status updates.",
    "- Mandatory skills still come exclusively from your dispatch prompt; this role scopes execution responsibilities only.",
    "",
    scopedCommon
  ].join("\n");
}

type ImplementationCheckCommonVariables = {
  validation_artifact_read_order: string;
  validation_scope_sources: string;
  validation_changed_file_scope: string;
  validation_budget_target: string;
  validation_stop_coverage_units: string;
  validation_inventory_blocker_scope: string;
  validation_requirements_pass: string;
  validation_execution_rule: string;
  validation_full_gate_line: string;
};

function implementationCheckCommonVariables(phase: ValidationScopePhase): ImplementationCheckCommonVariables {
  if (phase === "final_validation") {
    return {
      validation_artifact_read_order: "`prd.md`, `architecture/design.md`, `iteration_plan.md` all iterations including `Generation Bundle`, `Overview`, `Expected Change Surface`, `Checks`, and `Check Evidence`, then `execution_contract.md`, and existing `validation_findings.md` if present",
      validation_scope_sources: "the full approved PRD `Intent`, every `R#`, every `SC#`, approved design decisions and risk boundaries, all implementation plan iterations, `Generation Bundle`, iteration `Expected Change Surface` entries, and all Check Evidence rows",
      validation_changed_file_scope: "in the full change set",
      validation_budget_target: "full-change artifacts, all changed files outside `.phasedev/**`, and narrow searches needed to prove completeness or a concrete finding",
      validation_stop_coverage_units: "every approved `R#`, `SC#`, applicable design/risk boundary, implementation iteration, Check Evidence row, and changed file outside `.phasedev/**`",
      validation_inventory_blocker_scope: "expected full-change surface",
      validation_requirements_pass: "confirm the full change satisfies the approved PRD, approved design, and approved implementation plan without adding unapproved behavior",
      validation_execution_rule: "Validation mode is review-only with role-scoped execution gates: browser scenarios are owned by `browser-qa` when `execution_contract.md` contains a Browser Validation section (record with `phasedev record-gate browser`); the authorized `full` gate command is owned by this `implementation-check` role — after review and Check Evidence audit are complete, run it exactly once from the project root, record the result with `phasedev record-gate full`, and decide the verdict only after a passed full gate record. Do not rerun `unit`, `phase`, additional checks, builds, browsers, migrations, or deployments. If the full gate fails with product test failures, add a `MUST-FIX` finding with failing test/path evidence and record `phasedev record-gate full --result failed`. If the command, binary, sandbox, network, or environment is unavailable, record `phasedev record-gate full --result blocked`, remain in `final_validation`, do not add a product finding, and do not route to `finding_repair`.",
      validation_full_gate_line: "Full gate: record the authorized full gate command and result with `phasedev record-gate full`"
    };
  }

  return {
    validation_artifact_read_order: "`iteration_plan.md` current iteration, then `prd.md`, `architecture/design.md`, `execution_contract.md`, and existing `validation_findings.md` if present",
    validation_scope_sources: "the current iteration `Goal`, `Expected Change Surface`, `Tasks`, `Checks`, `Check Evidence`, related `R#`, related `SC#`, and approved risk/design boundaries",
    validation_changed_file_scope: "tied to the current iteration",
    validation_budget_target: "current-iteration artifacts, current-iteration changed files, and narrow searches needed to prove completeness or a concrete finding",
    validation_stop_coverage_units: "every current-iteration task, related `R#`, related `SC#`, Check Evidence row, applicable risk/design boundary, and changed file",
    validation_inventory_blocker_scope: "actual changed-file inventory for the current iteration",
    validation_requirements_pass: "confirm the current iteration satisfies its approved plan/design/PRD trace and does not add unapproved behavior",
    validation_execution_rule: "Validation mode is review-only: do not rerun tests, builds, browsers, migrations, deployments, or other execution gates.",
    validation_full_gate_line: "Full gate: not_applicable (review-only iteration validation)"
  };
}

function implementationCheckCommonContract(phase: ValidationScopePhase, config: Config): string {
  const scopeLine = phase === "iteration_validation"
    ? "Role scope is the current iteration only."
    : "Role scope is the full change.";

  const scopedCommon = renderTemplate("validation_common_implementation_check", {
    ...implementationCheckCommonVariables(phase),
    skill_compliance_line: renderSkillComplianceLine(),
    blocking_severity_policy: renderBlockingSeverityPolicy(config.blockingSeverity)
  });

  return [
    "## Role-Scoped Validation Contract",
    "",
    "- Execution role: implementation-check",
    `- ${scopeLine}`,
    "- This role owns requirements/evidence/test-quality completion audit, `phasedev set-verdict`, and `phasedev check-validation`.",
    "- Other validation roles own code review and security review passes.",
    "- Mandatory skills still come exclusively from your dispatch prompt; this role scopes execution responsibilities only.",
    "",
    scopedCommon
  ].join("\n");
}

function browserQaCommonContract(): string {
  const variables = reviewRoleCommonVariables("final_validation");
  const scopedCommon = renderTemplate("validation_common_review_role", {
    ...variables,
    validation_execution_rule: "Validation mode is browser QA only: start the configured app, open the configured URL, walk the configured criteria, record product defects with `phasedev add-finding`, and record browser gate evidence with `phasedev record-gate browser`. Do not run `unit`, `phase`, or the `full` gate command.",
    skill_compliance_line: renderSkillComplianceLine()
  });

  return [
    "## Role-Scoped Validation Contract",
    "",
    "- Execution role: browser-qa",
    "- Role scope is the full change Browser Validation section.",
    "- This role records product defects only through `phasedev add-finding` and browser gate evidence only through `phasedev record-gate browser`.",
    "- This role does not own verdict recording, check-validation, unit/phase/full execution, or iteration status updates.",
    "- Mandatory skills still come exclusively from your dispatch prompt; this role scopes execution responsibilities only.",
    "",
    scopedCommon
  ].join("\n");
}

export function renderRoleScopedValidationCommonContract(
  phase: ValidationScopePhase,
  config: Config,
  role: ValidationPhaseRole
): string {
  if (role === "browser-qa") {
    return browserQaCommonContract();
  }

  if (role === "implementation-check") {
    return implementationCheckCommonContract(phase, config);
  }

  return reviewRoleCommonContract(phase);
}

const IMPLEMENTATION_CHECK_FINDINGS_RULES = [
  "- Record findings and the verdict only through phasedev findings commands (`add-finding`, `set-verdict`).",
  "- Run the embedded self-check (`phasedev check-validation`) before reporting this role complete."
];

export function renderRoleScopedValidationFindingsContract(options: {
  phase: ValidationScopePhase;
  findingsPath: string;
  projectPath: string;
  blockingSeverity: BlockingSeverity;
  changeName?: string;
  iterationId?: number;
  role: ValidationPhaseRole;
}): string {
  const date = todayIsoDate();
  const changeFlag = options.changeName === undefined ? "" : ` --change ${shellQuote(options.changeName)}`;
  const artifactType = options.phase === "iteration_validation" ? "iteration" : "final";
  const ownsVerdict = options.role === "implementation-check";

  const selfCheckCommand = !ownsVerdict
    ? "not_applicable (this role does not own check-validation)"
    : options.iterationId === undefined
      ? flowFinalValidationCheckCommand(options.projectPath, options.changeName)
      : `phasedev check-validation --project-path ${shellQuote(options.projectPath)} --scope iteration --iteration-id ${options.iterationId}${changeFlag}`;

  const templateContent = ownsVerdict
    ? renderValidationFindingsTemplate(artifactType, date, options.blockingSeverity)
    : renderReviewRoleValidationFindingsTemplate(artifactType, date, options.blockingSeverity);

  const canonicalFillRules = ownsVerdict
    ? [...VALIDATION_FINDINGS_CANONICAL_FILL_RULES, ...IMPLEMENTATION_CHECK_FINDINGS_RULES]
    : REVIEW_ROLE_VALIDATION_FINDINGS_CANONICAL_FILL_RULES;

  return renderArtifactContract({
    artifactId: "validation_findings.md",
    resolvedOutputPath: options.findingsPath,
    templateName: ownsVerdict ? "artifacts/validation_findings" : "artifacts/validation_findings_review_role",
    templateContent,
    selfCheckCommand,
    selfCheckFailureGuidance: ownsVerdict
      ? "Artifact contract check must pass before reporting this role complete. If it fails, fix only `validation_findings.md` and the current phase status in `iteration_plan.md` when allowed by the validation verdict, then rerun the same command."
      : "This role appends findings rows only through `phasedev add-finding`.",
    includeSelfCheck: ownsVerdict,
    canonicalFillRules,
    date
  });
}

export function interpolateValidationRolePathTokens(
  content: string,
  paths: {
    plan_path: string;
    findings_path: string;
    prd_path?: string;
    rules_path?: string;
    design_path?: string;
  }
): string {
  return content
    .replace(/\{\{plan_path\}\}/g, paths.plan_path)
    .replace(/\{\{findings_path\}\}/g, paths.findings_path)
    .replace(/\{\{prd_path\}\}/g, paths.prd_path ?? "")
    .replace(/\{\{rules_path\}\}/g, paths.rules_path ?? "")
    .replace(/\{\{design_path\}\}/g, paths.design_path ?? "");
}

export function renderValidationRoleOpeningSummary(
  phase: ValidationScopePhase,
  role: ValidationPhaseRole
): string {
  const dispatchPrecedence = "> - Precedence: this contract supersedes any phase-work details in your dispatch prompt (artifact read order, file inventories, review checklists, verdict policy, findings-command recipes). On conflict, follow this contract and report the discrepancy in your final response.";

  if (role === "code-review" || role === "security-review") {
    return [
      "> **Phase summary:**",
      "> - Output: findings rows in `validation_findings.md` through `phasedev add-finding` only.",
      "> - Done when: the role-scoped review pass is complete and findings are recorded.",
      "> - Forbidden: verdict recording, check-validation ownership, iteration status updates, and writes outside the role allowlist.",
      dispatchPrecedence,
      ""
    ].join("\n");
  }

  if (role === "browser-qa") {
    return [
      "> **Phase summary:**",
      "> - Output: findings rows in `validation_findings.md` through `phasedev add-finding` and browser gate evidence through `phasedev record-gate browser`.",
      "> - Done when: the configured browser scenarios were exercised and gate evidence is recorded.",
      "> - Forbidden: unit/phase/full execution, verdict recording, check-validation ownership, iteration status updates, and writes outside the role allowlist.",
      dispatchPrecedence,
      ""
    ].join("\n");
  }

  const selfCheck = phase === "iteration_validation"
    ? "phasedev check-validation --scope iteration"
    : "phasedev check-validation --scope final";

  return [
    "> **Phase summary:**",
    "> - Output: `validation_findings.md` verdict and registry updates through phasedev findings commands.",
    `> - Done when: \`${selfCheck}\` passes.`,
    "> - Forbidden: code review or security review ownership, manual artifact edits, and writes outside the role allowlist.",
    dispatchPrecedence,
    ""
  ].join("\n");
}

export function renderValidationRoleTemplateVariables(
  phase: ValidationScopePhase,
  config: Config,
  role?: ValidationPhaseRole,
  options?: {
    fullGateCommand?: string;
    browserValidation?: { start: string; url: string; criteria: string };
  }
): Record<string, string> {
  const validationCommonContract = role === undefined
    ? renderValidationCommonContract(phase, config)
    : renderRoleScopedValidationCommonContract(phase, config, role);

  return {
    validation_role_checks: renderValidationRoleChecks(phase, role, options),
    validation_role_allowlist: renderValidationRoleAllowlist(phase, role),
    validation_role_completion: renderValidationRoleCompletion(phase, role),
    validation_iteration_status_rule: renderValidationIterationStatusRule(phase, role),
    validation_input_artifacts: renderValidationRoleInputArtifacts(phase, role),
    validation_retrieval_order: renderValidationRoleRetrievalOrder(phase, role),
    validation_common_contract: validationCommonContract
  };
}
