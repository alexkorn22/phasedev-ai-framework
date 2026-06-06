import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { renderTemplate } from "../src/shared/templates/render-template";

const testTmpDir = path.resolve(__dirname, "..", "test-cli-temp");
const cliPath = path.resolve(__dirname, "..", "src", "flow-cli.ts");

function cleanupTestDir() {
  if (fs.existsSync(testTmpDir)) {
    fs.rmSync(testTmpDir, { recursive: true, force: true });
  }
}

function writeArtifact(filePath: string, body: string, approved = true) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `---\napproved: ${approved ? "true" : "false"}\n---\n${body}`, "utf-8");
}

function writeApproved(filePath: string, body: string) {
  writeArtifact(filePath, body, true);
}

function validPrdBody(): string {
  return `# PRD

## Intent Card

| Field | Value |
|---|---|
| Change type | fix |
| User or business intent | Keep flow routing grounded in approved requirements. |
| Generation target | Exercise the flow controller stage prompt. |
| Resolution signal | not_applicable |
| Decision deadline | not_applicable |
| Risk envelope | Test fixture only; no production risk. |

## Approval Summary

Approve this test fixture change.

## Requirements

- Route the flow according to approved artifacts.

## Scope Boundaries

- In scope: test fixture flow state.
- Out of scope: unrelated behavior.

## Success Criteria

- The expected stage prompt is rendered.

## Accepted Assumptions

None.

## Deferred Decisions

None.
`;
}

function writeConfig(body: string): string {
  const configPath = path.join(testTmpDir, "flow-config.yaml");
  fs.mkdirSync(testTmpDir, { recursive: true });
  fs.writeFileSync(configPath, body, "utf-8");
  return configPath;
}

function writeProjectConfig(body: string): string {
  const configPath = path.join(testTmpDir, "openspec", "config.yaml");
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, body, "utf-8");
  return configPath;
}

function validationFindings(verdict: "ready" | "ready_with_risks" | "repair_required" | "repaired", type: "phase" | "final", rows = ""): string {
  return `---
verdict: ${verdict}
type: ${type}
date: 2026-05-28
---

| ID | Status | Severity | Class | Phase | Finding | Required Fix |
|---|---|---|---|---|---|---|
${rows}`;
}

function withImplementationPlanContract(planContent: string): string {
  const withBundle = planContent.includes("## Generation Bundle") ? planContent : `
## Generation Bundle

| Area | Required | Plan |
|---|---|---|
| Production code | yes | Exercise the test fixture production path. |
| Tests | yes | Use fixture commands from rules.md. |
| Docs/specs | not_applicable | No documentation behavior is part of this fixture. |
| Migrations | not_applicable | No persistence changes are part of this fixture. |
| Feature flags/rollout | not_applicable | No rollout controls are part of this fixture. |
| Observability | not_applicable | No observability changes are part of this fixture. |
| Rollback path | not_applicable | Revert the fixture change if needed. |

${planContent}`;

  return withBundle.replace(/^## Phase \d+:.*(?:\n(?!## Phase \d+:).*)*/gm, section => {
    let nextSection = section;
    if (!/^###\s+Goal\s*$/im.test(nextSection)) {
      nextSection += "\n\n### Goal\n\nComplete the fixture phase.";
    }
    if (!/^###\s+Tasks\s*$/im.test(nextSection)) {
      nextSection += "\n\n### Tasks\n";
    }
    if (!/^###\s+Checks\s*$/im.test(nextSection)) {
      nextSection += "\n\n### Checks\n\n- unit: `bun test unit`";
    }
    if (!/^###\s+Check Evidence\s*$/im.test(nextSection)) {
      nextSection += "\n\n### Check Evidence\n\n| Check | Command Or Method | Result | Evidence | Notes |\n|---|---|---|---|---|\n| unit | `bun test unit` | pending |  |  |";
    }
    return nextSection;
  });
}

function setupChange(planContent: string, options: { rules?: string; findings?: string; designApproved?: boolean; planApproved?: boolean } = {}) {
  const changeDir = path.join(testTmpDir, "openspec", "changes", "sample-change");
  fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });

  writeApproved(path.join(changeDir, "prd.md"), validPrdBody());
  writeApproved(path.join(changeDir, "rules.md"), options.rules ?? `
# Rules

## Test Commands
- unit: \`bun test unit\`
- phase: \`bun test phase\`
- full: \`bun test full\`
`);
  fs.writeFileSync(path.join(changeDir, "research_facts.md"), "# Research\n", "utf-8");
  writeArtifact(path.join(changeDir, "architecture", "design.md"), "# Design\n", options.designApproved ?? true);
  writeArtifact(path.join(changeDir, "implementation_plan.md"), withImplementationPlanContract(planContent), options.planApproved ?? true);

  if (options.findings) {
    fs.writeFileSync(path.join(changeDir, "validation_findings.md"), options.findings, "utf-8");
  }

  return changeDir;
}

function runNext(args: string[] = []): string {
  const result = Bun.spawnSync({
    cmd: ["bun", "run", cliPath, "next", "--project-path", testTmpDir, ...args],
    stdout: "pipe",
    stderr: "pipe"
  });

  expect(result.exitCode).toBe(0);
  return result.stdout.toString();
}

function runInit(args: string[] = []): string {
  const result = Bun.spawnSync({
    cmd: ["bun", "run", cliPath, "init", "--project-path", testTmpDir, ...args],
    stdout: "pipe",
    stderr: "pipe"
  });

  expect(result.exitCode).toBe(0);
  return result.stdout.toString();
}

describe("flow-cli state machine", () => {
  beforeEach(() => cleanupTestDir());
  afterEach(() => cleanupTestDir());

  test("init output contains base prompt without stage skill router", () => {
    const output = runInit();

    expect(output).toContain("Запомни схему Agentic Engineering Flow для этой сессии.");
    expect(output).toContain("## Current Flow State");
    expect(output).toContain("- Stage: `setup`");
    expect(output).toContain("- Active change: none");
    expect(output).toContain("Stage-specific skill policy is supplied by the current `flow next` prompt from `config.yaml`.");
    expect(output).not.toContain("## Mandatory Skill Selection Router");
    expect(output).not.toContain("## Configured Skill Policy");
  });

  test("init accepts project openspec config but keeps output policy-free", () => {
    writeProjectConfig(`
codex:
  stages:
    implementation:
      skills:
        main:
          - project-only-skill
`);

    const output = runInit();

    expect(output).toContain("Запомни схему Agentic Engineering Flow для этой сессии.");
    expect(output).toContain("Stage-specific skill policy is supplied by the current `flow next` prompt from `config.yaml`.");
    expect(output).not.toContain("## Configured Skill Policy");
    expect(output).not.toContain("project-only-skill");
  });

  test("implementation prompt uses config skills without requiring a router", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [ ] 1.1 Implement endpoint
`);
    const configPath = writeConfig(`
codex:
  stages:
    implementation:
      skills:
        main:
          - dev-core
          - test-driven-development
        additional:
          - api-and-interface-design
`);

    const output = runNext(["--config", configPath]);

    expect(output).toContain("## Configured Skill Policy");
    expect(output).toContain("Use only configured main skills or configured additional skills.");
    expect(output).toContain("Priority 1 - routers (mandatory only when configured):\n- none configured");
    expect(output).toContain("Priority 2 - main skills");
    expect(output).toContain("- `dev-core`");
    expect(output).toContain("- `test-driven-development`");
    expect(output).toContain("Priority 3 - additional skills");
    expect(output).toContain("- `api-and-interface-design`");
    expect(output).toContain("Authorized external skills are limited to configured main skills and configured additional skills.");
    expect(output).toContain("If no main or additional skill fits the stage need, stop and ask the user to update `config.yaml` or approve an exception.");
    expect(output).not.toContain("router-selected");
    expect(output).toContain("Check Evidence");
  });

  test("implementation prompt uses project openspec config without --config", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [ ] 1.1 Implement endpoint
`);
    writeProjectConfig(`
codex:
  stages:
    implementation:
      skills:
        main:
          - project-only-skill
`);

    const output = runNext();

    expect(output).toContain("## Configured Skill Policy");
    expect(output).toContain("- `project-only-skill`");
  });

  test("implementation prompt authorizes router-selected skills before main and additional skills", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [ ] 1.1 Implement endpoint
`);
    const configPath = writeConfig(`
codex:
  stages:
    implementation:
      skills:
        routers:
          - using-zuvo
        main:
          - dev-core
        additional:
          - security-and-hardening
`);

    const output = runNext(["--config", configPath]);

    expect(output).toContain("Priority 1 - routers (read every configured router first, mandatory only when configured):\n- `using-zuvo`");
    expect(output).toContain("Priority 2 - router-selected skills (highest priority method skills when a configured router selects a matching skill from its own content or routing table):");
    expect(output).toContain("Apply router instructions to the current stage evidence. If a router selects a matching skill from its own content or routing table, load and use that router-selected skill before considering main or additional skills.");
    expect(output).toContain("Authorized external skills are limited to configured routers, router-selected skills explicitly named by router content, configured main skills, and configured additional skills.");
    expect(output).toContain("Priority 3 - main skills (use only when routers are not configured or no router-selected skill fits the stage evidence):");
    expect(output).toContain("Priority 4 - additional skills (secondary allowed pool; load only when router-selected and main skills are insufficient or a listed additional skill is clearly better):");
  });

  test("implementation prompt disables external skills when stage skills are empty", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [ ] 1.1 Implement endpoint
`);
    const configPath = writeConfig(`
codex:
  stages:
    implementation:
      model: gpt-5.4
`);

    const output = runNext(["--config", configPath]);

    expect(output).toContain("No external skills are configured for this stage in `config.yaml`.");
    expect(output).toContain("Do not use external skills for this stage unless the user updates `config.yaml` or explicitly approves an exception.");
    expect(output).not.toContain("Priority 1 - routers");
  });

  test("plan prompt includes PRD intent input for downstream planning", () => {
    const changeDir = path.join(testTmpDir, "openspec", "changes", "sample-change");
    fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });
    writeApproved(path.join(changeDir, "prd.md"), validPrdBody());
    writeApproved(path.join(changeDir, "rules.md"), `
# Rules

## Test Commands
- unit: \`bun test unit\`
- phase: \`bun test phase\`
- full: \`bun test full\`
`);
    fs.writeFileSync(path.join(changeDir, "research_facts.md"), "# Research\n", "utf-8");
    writeApproved(path.join(changeDir, "architecture", "design.md"), "# Design\n");

    const output = runNext();

    expect(output).toContain("Этап 3. Plan.");
    expect(output).toContain("Требования PRD и ADLC-style Intent Card");
    expect(output).toContain("prd.md");
    expect(output).toContain("Generation target");
    expect(output).toContain("Resolution signal");
    expect(output).toContain("Risk envelope");
  });

  test("multi-phase plan sends completed in-progress phase to phase validation", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [x] 1.1 Implement endpoint

## Phase 2: UI [ ]
- [ ] 2.1 Build page
`);

    const output = runNext();

    expect(output).toContain("Этап 5A. Phase Validation.");
    expect(output).toContain("Текущая фаза:\nPhase 1: API");
    expect(output).not.toContain("bun test phase");
    expect(output).toContain("Check Evidence");
    expect(output).toContain("не запускайте тесты и дополнительные проверки повторно");
    expect(output).not.toContain("run project test suite");
  });

  test("blocks when more than one phase is in progress", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [x] 1.1 Implement endpoint

## Phase 2: UI [~]
- [ ] 2.1 Build page
`);

    const output = runNext();

    expect(output).toContain("[FLOW CONTROLLER] BLOCKED: Invalid implementation plan");
    expect(output).toContain("Only one phase may have [~] status at a time; active phases: Phase 1: API, Phase 2: UI.");
    expect(output).toContain("Phase 1: API");
    expect(output).toContain("Phase 2: UI");
    expect(output).not.toContain("Этап 4. Implementation.");
    expect(output).not.toContain("Этап 5A. Phase Validation.");
  });

  test("blocks approved plan with no recognized phases before final validation", () => {
    setupChange(`
# Plan

No phase headings yet.
`);

    const output = runNext();

    expect(output).toContain("[FLOW CONTROLLER] BLOCKED: Invalid implementation plan");
    expect(output).toContain("implementation_plan.md must contain at least one phase heading.");
    expect(output).not.toContain("Этап 5B. Final Validation.");
  });

  test("blocks phase without tasks before implementation", () => {
    setupChange(`
# Plan

## Phase 1: Empty Phase [ ]
`);

    const output = runNext();

    expect(output).toContain("[FLOW CONTROLLER] BLOCKED: Invalid implementation plan");
    expect(output).toContain("Phase 1: Empty Phase must contain at least one task checkbox.");
    expect(output).not.toContain("Этап 4. Implementation.");
  });

  test("blocks duplicate and non-sequential phase numbers", () => {
    setupChange(`
# Plan

## Phase 1: API [ ]
- [ ] 1.1 Implement endpoint

## Phase 1: UI [ ]
- [ ] 2.1 Build page

## Phase 3: Docs [ ]
- [ ] 3.1 Update docs
`);

    const output = runNext();

    expect(output).toContain("[FLOW CONTROLLER] BLOCKED: Invalid implementation plan");
    expect(output).toContain("Phase numbers must be unique; duplicate phase id(s): 1.");
    expect(output).toContain("Phase numbers must be sequential starting at 1.");
    expect(output).not.toContain("Этап 4. Implementation.");
  });

  test("blocks completed phase that still contains incomplete tasks", () => {
    setupChange(`
# Plan

## Phase 1: API [x]
- [x] 1.1 Implement endpoint
- [ ] 1.2 Add tests
`);

    const output = runNext();

    expect(output).toContain("[FLOW CONTROLLER] BLOCKED: Invalid implementation plan");
    expect(output).toContain("Phase 1: API is [x] but contains incomplete tasks.");
    expect(output).not.toContain("Этап 5B. Final Validation.");
  });

  test("single-phase plan sends completed in-progress phase to phase validation", () => {
    setupChange(`
# Plan

## Phase 1: Complete Change [~]
- [x] 1.1 Implement change
`);

    const output = runNext();

    expect(output).toContain("Этап 5A. Phase Validation.");
    expect(output).toContain("Текущая фаза:\nPhase 1: Complete Change");
    expect(output).not.toContain("Этап 5B. Final Validation.");
    expect(output).not.toContain("bun test phase");
    expect(output).toContain("не запускайте тесты и дополнительные проверки повторно");
  });

  test("single-phase plan sends validated phase to final validation", () => {
    setupChange(`
# Plan

## Phase 1: Complete Change [x]
- [x] 1.1 Implement change
`, {
      findings: validationFindings("ready", "phase")
    });

    const output = runNext();

    expect(output).toContain("Этап 5B. Final Validation.");
    expect(output).not.toContain("Этап 5A. Phase Validation.");
    expect(output).not.toContain("bun test full");
    expect(output).toContain("не запускайте `unit`, `phase`, `full` или дополнительные проверки повторно");
    expect(output).toContain("Intent Card");
    expect(output).toContain("Requirements");
    expect(output).toContain("Success Criteria");
  });

  test("repaired phase validation repeats phase validation for current in-progress phase", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [x] 1.1 Implement endpoint

## Phase 2: UI [ ]
- [ ] 2.1 Build page
`, {
      findings: validationFindings("repaired", "phase", "| F1 | resolved | MUST-FIX | implementation | Phase 1 | API response omits required error handling. | Keep the error mapping fix. |\n")
    });

    const output = runNext();

    expect(output).toContain("Этап 5A. Phase Validation.");
    expect(output).toContain("Текущая фаза:\nPhase 1: API");
  });

  test("repaired final validation repeats final validation", () => {
    setupChange(`
# Plan

## Phase 1: API [x]
- [x] 1.1 Implement endpoint

## Phase 2: UI [x]
- [x] 2.1 Build page
`, {
      findings: validationFindings("repaired", "final", "| F1 | resolved | MUST-FIX | implementation | Final | API response omits required error handling. | Keep the error mapping fix. |\n")
    });

    const output = runNext();

    expect(output).toContain("Этап 5B. Final Validation.");
    expect(output).not.toContain("Этап 5A. Phase Validation.");
  });

  test("repair prompt includes compact queue instead of full findings registry", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("repair_required", "phase", [
        "| F1 | resolved | MUST-FIX | implementation | Phase 1 | API response omits required error handling. | Keep the error mapping fix. |",
        "| F2 | open | MUST-FIX | test | Phase 1 | Missing regression coverage. | Add regression coverage. |"
      ].join("\n"))
    });

    const output = runNext();

    expect(output).toContain("Этап 5R. Repair Loop.");
    expect(output).toContain("## Current Repair Queue");
    expect(output).toContain("| F2 | MUST-FIX | test | Phase 1 | Missing regression coverage. | Add regression coverage. |");
    expect(output).toContain("Full findings registry:");
    expect(output).not.toContain("| F1 | MUST-FIX | implementation | Phase 1 | API response omits required error handling. |");
  });

  test("broken validation findings blocks instead of rendering an empty repair queue", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [x] 1.1 Implement endpoint
`, {
      findings: `---
verdict: repair_required
type: phase
date: 2026-05-28
---

No markdown finding table here.
`
    });

    const output = runNext();

    expect(output).toContain("[FLOW CONTROLLER] BLOCKED: Invalid validation_findings.md");
    expect(output).toContain("validation_findings.md must contain exactly one markdown table");
    expect(output).not.toContain("Этап 5R. Repair Loop.");
  });

  test("successful final validation routes to archive stage", () => {
    setupChange(`
# Plan

## Phase 1: API [x]
- [x] 1.1 Implement endpoint

## Phase 2: UI [x]
- [x] 2.1 Build page
`, {
      findings: validationFindings("ready", "final")
    });

    const output = runNext();
    const today = new Date().toISOString().split("T")[0];
    const archivedDir = path.join(testTmpDir, "openspec", "changes", "archive", `${today}-sample-change`);

    expect(output).toContain("Этап 6. Archive.");
    expect(output).toContain(`${archivedDir}/specs/<capability>/spec.md`);
    expect(output).toContain(".flow-archive.json");
    expect(output).toContain(`archive path: \`${archivedDir}\``);
    expect(fs.existsSync(path.join(archivedDir, ".flow-archive.json"))).toBe(true);
    expect(fs.existsSync(path.join(testTmpDir, "openspec", "changes", "sample-change"))).toBe(false);
    expect(output).not.toContain("src/archive-change.ts");
    expect(output).not.toContain("[FLOW CONTROLLER] SUCCESS!");
    expect(output).not.toContain("Этап 6. System Evolution.");
  });

  test("pending archive state repeats archive prompt without active change", () => {
    setupChange(`
# Plan

## Phase 1: API [x]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("ready", "final")
    });

    const first = runNext();
    const second = runNext();

    expect(first).toContain("Этап 6. Archive.");
    expect(second).toContain("Этап 6. Archive.");
    expect(second).toContain(".flow-archive.json");
    expect(second).not.toContain("Этап 0. AI Layer Setup.");
  });

  test("final ready_with_risks without blocking findings routes to archive stage", () => {
    setupChange(`
# Plan

## Phase 1: API [x]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("ready_with_risks", "final", "| F1 | open | RECOMMENDED | implementation | Final | Minor follow-up. | Track as follow-up. |\n")
    });

    const output = runNext();
    const today = new Date().toISOString().split("T")[0];
    const archivedDir = path.join(testTmpDir, "openspec", "changes", "archive", `${today}-sample-change`);

    expect(output).toContain("Этап 6. Archive.");
    expect(output).toContain("Не используйте `validation_findings.md` как источник требований");
    expect(fs.existsSync(path.join(archivedDir, ".flow-archive.json"))).toBe(true);
  });

  test("final ready blocks archive if any phase is not completed", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("ready", "final")
    });

    const output = runNext();

    expect(output).toContain("[FLOW CONTROLLER] BLOCKED: Archive readiness failed");
    expect(output).toContain("implementation_plan.md");
    expect(output).not.toContain("Этап 6. Archive.");
    expect(output).not.toContain("Этап 5B. Final Validation.");
  });

  test("final ready_with_risks with open blocking findings routes to repair instead of archive", () => {
    setupChange(`
# Plan

## Phase 1: API [x]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("ready_with_risks", "final", "| F1 | open | MUST-FIX | implementation | Final | Broken final check. | Repair the final check. |\n")
    });

    const output = runNext();

    expect(output).toContain("Этап 5R. Repair Loop.");
    expect(output).toContain("| F1 | MUST-FIX | implementation | Final | Broken final check. | Repair the final check. |");
    expect(output).not.toContain("Этап 6. Archive.");
  });

  test("missing test command blocks before rendering implementation prompts", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [ ] 1.1 Implement endpoint
`, {
      rules: `
# Rules

## Test Commands
- phase: \`bun test phase\`
- full: \`bun test full\`
`
    });

    const output = runNext();

    expect(output).toContain("[FLOW CONTROLLER] BLOCKED: Missing test command");
    expect(output).toContain("unit");
    expect(output).toContain("## Test Commands");
    expect(output).not.toContain("run unit tests");
  });

  test("missing phase command does not block phase validation prompt", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [x] 1.1 Implement endpoint

## Phase 2: UI [ ]
- [ ] 2.1 Build page
`, {
      rules: `
# Rules

## Test Commands
- unit: \`bun test unit\`
- full: \`bun test full\`
`
    });

    const output = runNext();

    expect(output).toContain("Этап 5A. Phase Validation.");
    expect(output).not.toContain("[FLOW CONTROLLER] BLOCKED: Missing test command");
    expect(output).not.toContain("bun test phase");
  });

  test("missing full command does not block final validation prompt", () => {
    setupChange(`
# Plan

## Phase 1: API [x]
- [x] 1.1 Implement endpoint
`, {
      rules: `
# Rules

## Test Commands
- unit: \`bun test unit\`
- phase: \`bun test phase\`
`
    });

    const output = runNext();

    expect(output).toContain("Этап 5B. Final Validation.");
    expect(output).not.toContain("[FLOW CONTROLLER] BLOCKED: Missing test command");
    expect(output).not.toContain("bun test full");
  });

  test("approval gates block after repair resets an approved artifact", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [x] 1.1 Implement endpoint
`, {
      designApproved: false,
      findings: validationFindings("repaired", "phase", "| F1 | resolved | MUST-FIX | implementation | Phase 1 | API response omits required error handling. | Keep the error mapping fix. |\n")
    });

    const output = runNext();

    expect(output).toContain("[FLOW CONTROLLER] BLOCKED: Design requires review");
    expect(output).toContain("architecture/design.md");
    expect(output).not.toContain("Этап 5A. Phase Validation.");
  });

  test("implementation prompt does not instruct agent to mark phase header completed", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [ ] 1.1 Implement endpoint
`);

    const output = runNext();

    expect(output).toContain("Этап 4. Implementation.");
    expect(output).toContain("bun test unit");
    expect(output).toContain("не завершайте Implementation с failed tests/checks");
    expect(output).not.toContain("измените статус фазы в заголовке плана с `[~]`");
    expect(output).not.toContain("run unit tests");
  });

  test("implementation prompt includes additional checks from implementation plan", () => {
    setupChange(`
# Plan

## Phase 1: API [ ]
- [ ] 1.1 Implement endpoint

Additional checks:
- \`bun test:e2e auth\`
- Browser smoke for login flow

## Phase 2: UI [ ]
- [ ] 2.1 Build page
`);

    const output = runNext();

    expect(output).toContain("Этап 4. Implementation.");
    expect(output).toContain("Дополнительные проверки текущей фазы из плана:");
    expect(output).toContain("bun test:e2e auth");
    expect(output).toContain("Browser smoke for login flow");
  });

  test("implementation prompt includes the full current phase excerpt", () => {
    setupChange(`
# Plan

## Phase 1: API [ ]
- [ ] 1.1 Implement endpoint

Checks:
- Endpoint handles not found responses.

Additional checks:
- \`bun test:e2e auth\`

Implementation note:
- Keep API contract unchanged.

## Phase 2: UI [ ]
- [ ] 2.1 Build page
`);

    const output = runNext();

    expect(output).toContain("Контекст текущей фазы из плана:");
    expect(output).toContain("Checks:");
    expect(output).toContain("Endpoint handles not found responses.");
    expect(output).toContain("Implementation note:");
    expect(output).toContain("Keep API contract unchanged.");
    expect(output).not.toContain("## Phase 2: UI");
  });

  test("phase validation prompt does not include additional checks from implementation plan", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [x] 1.1 Implement endpoint

Additional checks:
- \`bun test:e2e auth\`

## Phase 2: UI [ ]
- [ ] 2.1 Build page
`);

    const output = runNext();

    expect(output).toContain("Этап 5A. Phase Validation.");
    expect(output).not.toContain("Дополнительные проверки текущей фазы из плана:");
    expect(output).not.toContain("bun test:e2e auth");
    expect(output).not.toContain("additional checks выполнены");
  });

  test("final validation does not include additional checks from implementation plan", () => {
    setupChange(`
# Plan

## Phase 1: Complete Change [x]
- [x] 1.1 Implement change

Additional checks:
- \`bun test:e2e checkout\`
`);

    const output = runNext();

    expect(output).toContain("Этап 5B. Final Validation.");
    expect(output).not.toContain("Дополнительные проверки текущей single-phase фазы");
    expect(output).not.toContain("bun test:e2e checkout");
    expect(output).not.toContain("applicable additional checks");
  });
});

describe("flow templates", () => {
  const templateNames = [
    "step0_setup.md",
    "step1_research.md",
    "step2_design.md",
    "step3_plan.md",
    "step4_impl.md",
    "step5a_val.md",
    "step5b_val.md",
    "step5r_repair.md",
    "step6_archive.md"
  ];

  function readTemplate(name: string): string {
    return fs.readFileSync(path.resolve(__dirname, "..", "templates", name), "utf-8");
  }

  test("stage templates receive generated config skill policy", () => {
    for (const templateName of templateNames) {
      const template = readTemplate(templateName);

      expect(template).toContain("{{skill_policy}}");
      expect(template.indexOf("{{skill_policy}}")).toBeLessThan(template.indexOf("Вход"));
      expect(template).not.toContain("Агент может использовать любые доступные релевантные skills");
      expect(template).not.toContain("session routers и tools для выполнения текущего этапа");
    }
  });

  test("validation skill policy forbids running execution-oriented skill workflows", () => {
    setupChange(`
# Plan

## Phase 1: API [x]
- [x] 1.1 Implement endpoint
`);
    const configPath = writeConfig(`
codex:
  stages:
    final_validation:
      skills:
        additional:
          - playwright
          - performance-audit
`);

    const output = runNext(["--config", configPath]);

    expect(output).toContain("- `playwright`");
    expect(output).toContain("Validation stages are review-only");
    expect(output).toContain("do not run that workflow");
    expect(output).toContain("do not inline prose, sections, evidence blocks, or extra tables into `validation_findings.md`");
    expect(output).toContain("put non-registry explanation only in the final response");
    expect(output.indexOf("## Configured Skill Policy")).toBeLessThan(output.indexOf("Входные артефакты"));
  });

  test("stage templates preserve explicit artifact allowlists", () => {
    const expectations: Array<[string, string[]]> = [
      ["step0_setup.md", ["Allowed persistent artifacts for this stage", "`prd.md`", "`rules.md`", "change folder"]],
      ["step1_research.md", ["Allowed persistent artifacts for this stage", "`research_facts.md`"]],
      ["step2_design.md", ["Allowed persistent artifacts for this stage", "`architecture/design.md`", "linked files inside `architecture/`"]],
      ["step3_plan.md", ["Allowed persistent artifacts for this stage", "`implementation_plan.md`"]],
      ["step4_impl.md", ["Allowed persistent artifacts for this stage", "production/test code", "task checkboxes and `Check Evidence` rows in `implementation_plan.md`"]],
      ["step5a_val.md", ["Allowed persistent artifacts for this stage", "`validation_findings.md`", "phase status in `implementation_plan.md`"]],
      ["step5b_val.md", ["Allowed persistent artifacts for this stage", "`validation_findings.md`"]],
      ["step5r_repair.md", ["Allowed persistent artifacts for this stage", "affected production/test code", "affected approved flow artifacts", "`validation_findings.md`"]],
      ["step6_archive.md", ["Allowed persistent artifacts for this stage", "OpenSpec delta specs", "`openspec/specs`"]]
    ];

    for (const [templateName, fragments] of expectations) {
      const template = readTemplate(templateName);
      for (const fragment of fragments) {
        expect(template).toContain(fragment);
      }
    }
  });

  test("downstream stage templates consume PRD Intent Card fields", () => {
    const expectations: Array<[string, string[]]> = [
      ["step1_research.md", ["ADLC-style Intent Card", "Resolution signal", "Risk envelope", "PRD Intent Trace", "Accepted Assumptions", "Deferred Decisions"]],
      ["step2_design.md", ["ADLC-style Intent Card", "user/business intent", "generation target", "resolution signal", "risk envelope", "Accepted Assumptions", "Deferred Decisions"]],
      ["step3_plan.md", ["Требования PRD и ADLC-style Intent Card", "Generation target", "Resolution signal", "Risk envelope", "Accepted Assumptions", "Deferred Decisions"]],
      ["step4_impl.md", ["Требования PRD и ADLC-style Intent Card", "Resolution signal", "Generation target", "accepted assumptions", "deferred decisions"]],
      ["step5a_val.md", ["Требования PRD и ADLC-style Intent Card", "Risk envelope", "Resolution signal", "accepted assumptions", "deferred decisions"]],
      ["step5b_val.md", ["ADLC-style Intent Card", "Generation target", "Resolution signal", "Risk envelope", "Accepted Assumptions", "Deferred Decisions"]],
      ["step5r_repair.md", ["ADLC-style Intent Card", "Risk envelope", "Generation target", "Resolution signal", "Accepted Assumptions", "Deferred Decisions"]],
      ["step6_archive.md", ["ADLC-style Intent Card", "business intent", "resolution signal", "Accepted Assumptions", "Deferred Decisions"]]
    ];

    for (const [templateName, fragments] of expectations) {
      const template = readTemplate(templateName);
      for (const fragment of fragments) {
        expect(template).toContain(fragment);
      }
    }
  });

  test("downstream prompts treat PRD gaps as blockers instead of silent assumptions", () => {
    const researchTemplate = readTemplate("step1_research.md");
    const designTemplate = readTemplate("step2_design.md");
    const planTemplate = readTemplate("step3_plan.md");
    const implementationTemplate = readTemplate("step4_impl.md");
    const validationTemplate = readTemplate("step5b_val.md");

    expect(researchTemplate).toContain("не превращайте это в design assumption");
    expect(researchTemplate).toContain("остановитесь, сообщите PRD blocker");
    expect(designTemplate).toContain("если design требует такого изменения, остановитесь");
    expect(planTemplate).toContain("не планируйте работу на silent assumptions");
    expect(planTemplate).toContain("остановитесь и попросите пользователя пересогласовать PRD/design");
    expect(implementationTemplate).toContain("не разрешайте deferred decisions из PRD самостоятельно");
    expect(validationTemplate).toContain("если implementation решил deferred decision самовольно");
  });

  test("stage templates avoid method-prescriptive implementation and validation wording", () => {
    const bannedPhrases = [
      "grep_search",
      "list_dir",
      "view_file",
      "CQ-чеклист",
      "E2E-тесты",
      "проверку в браузере",
      "ручное тестирование",
      "Реализуйте минимальное",
      "Прочитайте существующий код",
      "Добавьте новые автоматические тесты",
      "hardcoded",
      "Сделайте решение максимально расширяемым",
      "стратегия тестирования",
      "самостоятельно исследуйте"
    ];

    for (const templateName of templateNames) {
      const template = readTemplate(templateName);

      for (const phrase of bannedPhrases) {
        expect(template).not.toContain(phrase);
      }
    }
  });

  test("design prompt treats architecture design as an entrypoint for linked subdocuments", () => {
    const template = readTemplate("step2_design.md");

    expect(template).toContain("`architecture/design.md` является обязательной точкой входа");
    expect(template).toContain("Дополнительные architecture files внутри `architecture/` разрешены");
    expect(template).toContain("считаются частью утвержденного дизайна");
    expect(template).toContain("Controller проверяет approval только у `architecture/design.md`");
  });

  test("design prompt requires visual-first architecture package decomposition", () => {
    const template = readTemplate("step2_design.md");

    expect(template).toContain("architecture package entrypoint / index");
    expect(template).toContain("Architecture Package Map");
    expect(template).toContain("target size: до 120 строк");
    expect(template).toContain("не раздувайте выше 180 строк");
    expect(template).toContain("4+ material areas");
    expect(template).toContain("отдельный раздел становится длиннее 40 строк");
    expect(template).toContain("linked subdocument");
  });

  test("design prompt requires diagrams for non-trivial human review", () => {
    const template = readTemplate("step2_design.md");

    expect(template).toContain("Visual-first policy");
    expect(template).toContain("минимум одну Mermaid-диаграмму");
    expect(template).toContain("```mermaid");
    expect(template).toContain("flowchart");
    expect(template).toContain("sequenceDiagram");
    expect(template).toContain("classDiagram");
    expect(template).toContain("erDiagram");
    expect(template).toContain("stateDiagram");
  });

  test("design prompt still allows small single-file designs", () => {
    const template = readTemplate("step2_design.md");

    expect(template).toContain("Small/single-file design");
    expect(template).toContain("Если change маленький");
    expect(template).toContain("можно оставить только `architecture/design.md`");
  });

  test("setup prompt requires task description and task-specific rules before artifacts", () => {
    const template = readTemplate("step0_setup.md");

    expect(template).toContain("Сначала запросите у пользователя описание задачи/доработки");
    expect(template).toContain("Затем отдельным запросом запросите правила и ограничения для этой задачи");
    expect(template).toContain("Не создавайте `prd.md` и `rules.md`, пока оба пункта не получены");
    expect(template).toContain("Проведите PRD intake перед созданием файлов");
    expect(template).toContain("Используйте question tool для intake-вопросов");
    expect(template).toContain("продолжайте intake столько раундов, сколько нужно");
    expect(template).toContain("Не заменяйте неизвестные ADLC/PRD поля догадками");
    expect(template).toContain("Для `feature` и `experiment` changes обязательно выясните");
    expect(template).toContain("Для `fix`, `refactor` и `infra` changes обязательно выясните");
  });

  test("repair prompt requires approval reset for changed approved artifacts", () => {
    const template = readTemplate("step5r_repair.md");

    expect(template).toContain("Повторный human approval");
    expect(template).toContain("approved: true");
    expect(template).toContain("approved: false");
    expect(template).toContain("Для чистого `implementation` repair не меняйте approval-статусы");
  });

  test("validation prompts define ready_with_risks and blocking findings consistently", () => {
    const findingsContract = readTemplate("artifacts/validation_findings.md");

    expect(findingsContract).toContain("repair_required: use when at least one open/reopened MUST-FIX finding exists.");
    expect(findingsContract).toContain("ready_with_risks: use only when open/reopened findings are limited to RECOMMENDED or NIT.");
  });

  test("validation and repair prompts require a strict single findings registry", () => {
    const phaseTemplate = readTemplate("step5a_val.md");
    const finalTemplate = readTemplate("step5b_val.md");
    const repairTemplate = readTemplate("step5r_repair.md");

    for (const template of [phaseTemplate, finalTemplate]) {
      expect(template).toContain("Validation mode: review-only stage");
      expect(template).toContain("не является test execution gate");
      expect(template).toContain("[validation_findings.md template]({{validation_findings_template_path}})");
      expect(template).toContain("итоговый файл должен строго соответствовать artifact template");
      expect(template).toContain("`validation_findings.md` содержит только YAML frontmatter и ровно одну markdown-таблицу findings");
      expect(template).toContain("не добавляйте в `validation_findings.md` prose, headings, evidence blocks, summaries, visual markers или дополнительные таблицы");
      expect(template).not.toContain("| ID | Status | Class | Blocks PR? | Phase | Description |");
      expect(template).not.toContain("Blocks PR?");
      expect(template).toContain("новое замечание добавляйте новой строкой в начало таблицы");
      expect(template).toContain("обновите существующую строку с тем же `ID`");
      expect(template).toContain("без нового конкретного evidence из рабочего кода вне `openspec/**`");
      expect(template).toContain("полностью игнорируйте `openspec/**`");
      expect(template).toContain("не diff, не review и не report любые файлы под `openspec/**`");
    }

    expect(repairTemplate).toContain("[validation_findings.md template]({{validation_findings_template_path}})");
    expect(repairTemplate).toContain("сохраняйте `type` в YAML frontmatter как scope последней validation");
    expect(repairTemplate).toContain("исправление finding фиксируйте изменением `Status` существующей строки на `resolved`");
    expect(repairTemplate).toContain("не удаляйте строки замечаний");
  });

  test("approval prompts require flexible human-review formatting without rigid placeholder sections", () => {
    const initTemplate = readTemplate("init.md");
    const approvalTemplates = [
      readTemplate("step0_setup.md"),
      readTemplate("step2_design.md"),
      readTemplate("step3_plan.md")
    ];

    expect(initTemplate).not.toContain("Human Review Formatting Policy");
    expect(initTemplate).toContain("Stage-specific skill policy is supplied by the current `flow next` prompt");

    for (const template of approvalTemplates) {
      expect(template).toContain("Human Review Formatting Policy");
      expect(template).toContain("YAML frontmatter остается первым");
      expect(template).toContain("Не создавайте пустые, декоративные или искусственные разделы");
      expect(template).toContain("Структуру выбирайте по содержанию конкретного change");
      expect(template).toContain("сохраните все machine-readable элементы");
    }
  });

  test("approval prompts require a compact visual review surface instead of plain markdown only", () => {
    const initTemplate = readTemplate("init.md");
    const approvalTemplates = [
      readTemplate("step0_setup.md"),
      readTemplate("step2_design.md"),
      readTemplate("step3_plan.md")
    ];

    expect(initTemplate).not.toContain("compact visual review surface");
    expect(initTemplate).toContain("Stage-specific skill policy is supplied by the current `flow next` prompt");

    for (const template of approvalTemplates) {
      expect(template).toContain("compact visual review surface");
      expect(template).toContain("2-5");
      expect(template).toContain("semantic emoji markers");
      expect(template).toContain("📌");
      expect(template).toContain("🚫");
      expect(template).toContain("✅");
      expect(template).toContain("⚠️");
      expect(template).toContain("Не оставляйте approval artifact как обычную простыню");
      expect(template).toContain("Используйте один основной human language");
    }
  });

  test("approval prompts ask blocking questions before writing artifacts and group long lists", () => {
    const initTemplate = readTemplate("init.md");
    const approvalTemplates = [
      readTemplate("step0_setup.md"),
      readTemplate("step2_design.md"),
      readTemplate("step3_plan.md")
    ];

    expect(initTemplate).not.toContain("Если вопрос влияет на approval artifact");
    expect(initTemplate).toContain("Используй субагентов только когда");

    for (const template of approvalTemplates) {
      expect(template).toContain("Если вопрос влияет на approval artifact");
      expect(template).toContain("задайте его пользователю и остановитесь до ответа");
      expect(template).toContain("Не записывайте pending open questions");
      expect(template).toContain("Отделяйте accepted assumptions и deferred design-stage decisions");
      expect(template).toContain("Если список становится длиннее 7 пунктов");
      expect(template).toContain("Используйте callouts");
    }
  });

  test("visual formatting policy allows semantic emojis while protecting machine-readable flow grammar", () => {
    const visualTemplates = [
      readTemplate("step0_setup.md"),
      readTemplate("step2_design.md"),
      readTemplate("step3_plan.md"),
      readTemplate("step6_archive.md")
    ];

    for (const template of visualTemplates) {
      expect(template).toContain("эмоджи");
      expect(template).toContain("смысловые visual markers");
      expect(template).toContain("не используйте эмоджи в YAML frontmatter");
      expect(template).toContain("не используйте эмоджи в командах, file paths, code blocks");
    }

    const planTemplate = readTemplate("step3_plan.md");
    expect(planTemplate).toContain("не используйте эмоджи в machine-parsed заголовках фаз `## Phase N: <Название фазы> [<статус>]`");
  });

  test("validation prompts forbid visual markers in the machine-readable findings registry", () => {
    const phaseTemplate = readTemplate("step5a_val.md");
    const finalTemplate = readTemplate("step5b_val.md");

    for (const template of [phaseTemplate, finalTemplate]) {
      expect(template).not.toContain("Validation Visual Markers");
      expect(template).not.toContain("🟢");
      expect(template).not.toContain("🟡");
      expect(template).not.toContain("🔴");
      expect(template).not.toContain("Validation Visual Markers");
      expect(template).toContain("[validation_findings.md template]({{validation_findings_template_path}})");
    }
    expect(phaseTemplate).toContain("должен иметь `type: phase`");
    expect(finalTemplate).toContain("должен иметь `type: final`");
    expect(finalTemplate).toContain("не оставляйте template default `type: phase`");
  });

  test("artifact templates define plan and findings contracts", () => {
    const prdTemplate = readTemplate("artifacts/prd.md");
    const planContract = readTemplate("artifacts/implementation_plan.md");
    const findingsContract = readTemplate("artifacts/validation_findings.md");

    expect(prdTemplate).toContain("Instantiate this template into the change directory as prd.md");
    expect(prdTemplate).toContain("Remove every HTML comment from the final prd.md");
    expect(prdTemplate).toContain("Before writing prd.md, run an ADLC-style user intake through the question tool when available.");
    expect(prdTemplate).toContain("Continue asking 1-3 focused questions per round until all material ambiguity is closed.");
    expect(prdTemplate).toContain("ADLC-style intake coverage:");
    expect(prdTemplate).toContain("Accepted Assumptions must be explicit user-accepted assumptions, not silent agent guesses.");
    expect(prdTemplate).toContain("Change type: use exactly one of these values: feature, fix, refactor, infra, experiment.");
    expect(prdTemplate).toContain("Section contract:");
    expect(prdTemplate).toContain("Blocking question rule:");
    expect(prdTemplate).toContain("| Change type |  |");
    expect(prdTemplate).toContain("## Intent Card");
    expect(prdTemplate).not.toContain("<change name>");
    expect(prdTemplate).not.toContain("<why");
    expect(prdTemplate).not.toContain("<what");
    expect(planContract).toContain("Remove every HTML comment from the final implementation_plan.md");
    expect(planContract).toContain("Phase status contract:");
    expect(planContract).toContain("Use [ ] for not started.");
    expect(planContract).toContain("Generation Bundle contract:");
    expect(planContract).toContain("Required values must be exactly one of: yes, no, not_applicable.");
    expect(planContract).toContain("Check Evidence contract:");
    expect(planContract).toContain("Result values must be exactly one of: pending, passed, failed, blocked, not_applicable.");
    expect(planContract).toContain("Task IDs are phase-scoped: 1.1, 1.2, 2.1");
    expect(planContract).toContain("Do not add a generic Definition of Done section");
    expect(planContract).toContain("Additional checks:");
    expect(planContract).not.toContain("<change name>");
    expect(planContract).not.toContain("<goal>");
    expect(planContract).not.toContain("<atomic");
    expect(planContract).not.toContain("yes/no/not_applicable");
    expect(findingsContract).toContain("| ID | Status | Severity | Class | Phase | Finding | Required Fix |");
    expect(findingsContract).toContain("Remove every HTML comment from the final validation_findings.md");
    expect(findingsContract).toContain("Verdict contract:");
    expect(findingsContract).toContain("Table value contract:");
    expect(findingsContract).toContain("MUST-FIX");
    expect(findingsContract).toContain("RECOMMENDED");
    expect(findingsContract).toContain("NIT");
    expect(findingsContract).not.toContain("Example row");
    expect(findingsContract).not.toContain("Concrete self-contained finding");
  });

  test("archive prompt keeps OpenSpec requirement text strict and non-decorative", () => {
    const archiveTemplate = readTemplate("step6_archive.md");

    expect(archiveTemplate).toContain("валидным строгим реестром");
    expect(archiveTemplate).toContain("не содержит open/reopened blocking findings");
    expect(archiveTemplate).toContain("В финальном отчете можно использовать visual formatting");
    expect(archiveTemplate).toContain("В OpenSpec requirement text не используйте эмоджи");
    expect(archiveTemplate).toContain("OpenSpec specs остаются нормативными");
  });

  test("template renderer rejects unresolved placeholders", () => {
    expect(() => renderTemplate("step6_evolution", {})).toThrow("unresolved placeholder(s): incident, change_scope, test_scope");
  });

  test("init and plan prompts document phase validation before final validation", () => {
    const initTemplate = readTemplate("init.md");
    const planTemplate = readTemplate("step3_plan.md");
    const planContract = readTemplate("artifacts/implementation_plan.md");

    expect(initTemplate).toContain("После успешной Phase Validation всех фаз flow идет в `Final Validation`");
    expect(initTemplate).not.toContain("Phase Validation не запускается отдельно");
    expect(planTemplate).toContain("каждая фаза, включая единственную, проходит `Implementation -> Phase Validation`");
    expect(planTemplate).not.toContain("Implementation -> Final Validation` без отдельной Phase Validation");
    expect(planContract).toContain("Additional checks:");
  });

  test("archive prompt documents delta-first specs and artifact scope", () => {
    const initTemplate = readTemplate("init.md");
    const archiveTemplate = readTemplate("step6_archive.md");

    expect(initTemplate).toContain("6. Archive");
    expect(initTemplate).toContain("После успешной Final Validation следующий `flow next` запускает Archive");
    expect(archiveTemplate).toContain("[prd.md]({{prd_path}})");
    expect(archiveTemplate).toContain("[rules.md]({{rules_path}})");
    expect(archiveTemplate).toContain("[research_facts.md]({{research_path}})");
    expect(archiveTemplate).toContain("[design.md]({{design_path}})");
    expect(archiveTemplate).toContain("[implementation_plan.md]({{plan_path}})");
    expect(archiveTemplate).toContain("Не используйте `validation_findings.md` как источник требований");
    expect(archiveTemplate).toContain("{{archive_path}}/specs/<capability>/spec.md");
    expect(archiveTemplate).toContain("One spec file = one functional area.");
    expect(archiveTemplate).toContain("Не создавайте один большой catch-all spec");
    expect(archiveTemplate).toContain("## ADDED Requirements");
    expect(archiveTemplate).toContain("{{archive_state_path}}");
    expect(archiveTemplate).toContain("status: \"completed\"");
    expect(archiveTemplate).not.toContain("{{archive_command}}");
    expect(archiveTemplate).not.toContain("Blocks PR?");
  });

  test("default config defines stage skills instead of a separate skill router template", () => {
    const config = fs.readFileSync(path.resolve(__dirname, "..", "config.yaml"), "utf-8");

    expect(fs.existsSync(path.resolve(__dirname, "..", "templates", "skill_router.md"))).toBe(false);
    expect(config).toContain("implementation:");
    expect(config).toContain("skills:");
    expect(config).toContain("- dev-core");
    expect(config).toContain("- incremental-implementation");
    expect(config).toContain("- test-driven-development");
    expect(config).toContain("phase_validation:");
    expect(config).toContain("- code-review-and-quality");
    expect(config).toContain("archive:");
    expect(config).toContain("- spec-driven-development");
  });
});
