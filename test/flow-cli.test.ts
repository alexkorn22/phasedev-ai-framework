import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";

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

function setupChange(planContent: string, options: { rules?: string; findings?: string; designApproved?: boolean; planApproved?: boolean } = {}) {
  const changeDir = path.join(testTmpDir, "openspec", "changes", "sample-change");
  fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });

  writeApproved(path.join(changeDir, "prd.md"), "# PRD\n");
  writeApproved(path.join(changeDir, "rules.md"), options.rules ?? `
# Rules

## Test Commands
- unit: \`bun test unit\`
- phase: \`bun test phase\`
- full: \`bun test full\`
`);
  fs.writeFileSync(path.join(changeDir, "research_facts.md"), "# Research\n", "utf-8");
  writeArtifact(path.join(changeDir, "architecture", "design.md"), "# Design\n", options.designApproved ?? true);
  writeArtifact(path.join(changeDir, "implementation_plan.md"), planContent, options.planApproved ?? true);

  if (options.findings) {
    fs.writeFileSync(path.join(changeDir, "validation_findings.md"), options.findings, "utf-8");
  }

  return changeDir;
}

function runNext(): string {
  const result = Bun.spawnSync({
    cmd: ["bun", "run", cliPath, "next", "--project-path", testTmpDir],
    stdout: "pipe",
    stderr: "pipe"
  });

  expect(result.exitCode).toBe(0);
  return result.stdout.toString();
}

function runInit(): string {
  const result = Bun.spawnSync({
    cmd: ["bun", "run", cliPath, "init", "--project-path", testTmpDir],
    stdout: "pipe",
    stderr: "pipe"
  });

  expect(result.exitCode).toBe(0);
  return result.stdout.toString();
}

describe("flow-cli state machine", () => {
  beforeEach(() => cleanupTestDir());
  afterEach(() => cleanupTestDir());

  test("init output combines base prompt and mandatory skill router", () => {
    const output = runInit();

    expect(output).toContain("Запомни схему Agentic Engineering Flow для этой сессии.");
    expect(output).toContain("## Mandatory Skill Selection Router");
    expect(output).toContain("Setup, Research, Design, Plan, Implementation, Archive: максимум 4 skill bodies");
    expect(output).toContain("`dev-core` обязателен и входит в лимит для этапов `2 Design`, `3 Plan`, `4 Implementation`, `5R Repair Loop`");
  });

  test("multi-phase plan sends completed in-progress phase to phase validation", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [x] Implement endpoint

## Phase 2: UI [ ]
- [ ] Build page
`);

    const output = runNext();

    expect(output).toContain("Этап 5A. Phase Validation.");
    expect(output).toContain("Текущая фаза:\nPhase 1: API");
    expect(output).not.toContain("bun test phase");
    expect(output).toContain("не запускайте тесты и дополнительные проверки повторно");
    expect(output).not.toContain("run project test suite");
  });

  test("blocks when more than one phase is in progress", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [x] Implement endpoint

## Phase 2: UI [~]
- [ ] Build page
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
- [ ] Implement endpoint

## Phase 1: UI [ ]
- [ ] Build page

## Phase 3: Docs [ ]
- [ ] Update docs
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
- [x] Implement endpoint
- [ ] Add tests
`);

    const output = runNext();

    expect(output).toContain("[FLOW CONTROLLER] BLOCKED: Invalid implementation plan");
    expect(output).toContain("Phase 1: API is [x] but contains incomplete tasks.");
    expect(output).not.toContain("Этап 5B. Final Validation.");
  });

  test("single-phase plan sends completed in-progress phase directly to final validation", () => {
    setupChange(`
# Plan

## Phase 1: Complete Change [~]
- [x] Implement change
`);

    const output = runNext();

    expect(output).toContain("Этап 5B. Final Validation.");
    expect(output).not.toContain("Этап 5A. Phase Validation.");
    expect(output).not.toContain("bun test full");
    expect(output).toContain("не запускайте `unit`, `phase`, `full` или дополнительные проверки повторно");
    expect(output).not.toContain("run full test suite");
  });

  test("repaired phase validation repeats phase validation for current in-progress phase", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [x] Implement endpoint

## Phase 2: UI [ ]
- [ ] Build page
`, {
      findings: "---\nverdict: repaired\ntype: phase\ndate: 2026-05-28\n---\n"
    });

    const output = runNext();

    expect(output).toContain("Этап 5A. Phase Validation.");
    expect(output).toContain("Текущая фаза:\nPhase 1: API");
  });

  test("repaired final validation repeats final validation", () => {
    setupChange(`
# Plan

## Phase 1: API [x]
- [x] Implement endpoint

## Phase 2: UI [x]
- [x] Build page
`, {
      findings: "---\nverdict: repaired\ntype: final\ndate: 2026-05-28\n---\n"
    });

    const output = runNext();

    expect(output).toContain("Этап 5B. Final Validation.");
    expect(output).not.toContain("Этап 5A. Phase Validation.");
  });

  test("successful final validation routes to archive stage", () => {
    setupChange(`
# Plan

## Phase 1: API [x]
- [x] Implement endpoint

## Phase 2: UI [x]
- [x] Build page
`, {
      findings: "---\nverdict: ready\ntype: final\ndate: 2026-05-28\n---\n"
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
- [x] Implement endpoint
`, {
      findings: "---\nverdict: ready\ntype: final\ndate: 2026-05-28\n---\n"
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
- [x] Implement endpoint
`, {
      findings: `
---
verdict: ready_with_risks
type: final
date: 2026-05-28
---

| ID | Status | Class | Blocks PR? | Description |
|----|--------|-------|------------|-------------|
| F1 | open | implementation | No | Minor follow-up |
`
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
- [x] Implement endpoint
`, {
      findings: "---\nverdict: ready\ntype: final\ndate: 2026-05-28\n---\n"
    });

    const output = runNext();

    expect(output).toContain("[FLOW CONTROLLER] BLOCKED: Archive readiness failed");
    expect(output).toContain("implementation_plan.md");
    expect(output).not.toContain("Этап 6. Archive.");
    expect(output).not.toContain("Этап 5B. Final Validation.");
  });

  test("final ready_with_risks routes to archive even if findings still contain blocking rows", () => {
    setupChange(`
# Plan

## Phase 1: API [x]
- [x] Implement endpoint
`, {
      findings: `
---
verdict: ready_with_risks
type: final
date: 2026-05-28
---

| ID | Status | Class | Blocks PR? | Description |
|----|--------|-------|------------|-------------|
| F1 | open | implementation | Yes | Broken final check |
`
    });

    const output = runNext();

    expect(output).toContain("Этап 6. Archive.");
    expect(output).not.toContain("[FLOW CONTROLLER] BLOCKED: Archive readiness failed");
  });

  test("missing test command blocks before rendering implementation prompts", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [ ] Implement endpoint
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
- [x] Implement endpoint

## Phase 2: UI [ ]
- [ ] Build page
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
- [x] Implement endpoint
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
- [x] Implement endpoint
`, {
      designApproved: false,
      findings: "---\nverdict: repaired\ntype: phase\ndate: 2026-05-28\n---\n"
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
- [ ] Implement endpoint
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
- [ ] Implement endpoint

Additional checks:
- \`bun test:e2e auth\`
- Browser smoke for login flow

## Phase 2: UI [ ]
- [ ] Build page
`);

    const output = runNext();

    expect(output).toContain("Этап 4. Implementation.");
    expect(output).toContain("Дополнительные проверки текущей фазы из плана:");
    expect(output).toContain("bun test:e2e auth");
    expect(output).toContain("Browser smoke for login flow");
  });

  test("phase validation prompt does not include additional checks from implementation plan", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [x] Implement endpoint

Additional checks:
- \`bun test:e2e auth\`

## Phase 2: UI [ ]
- [ ] Build page
`);

    const output = runNext();

    expect(output).toContain("Этап 5A. Phase Validation.");
    expect(output).not.toContain("Дополнительные проверки текущей фазы из плана:");
    expect(output).not.toContain("bun test:e2e auth");
    expect(output).not.toContain("additional checks выполнены");
  });

  test("single-phase final validation does not include additional checks from implementation plan", () => {
    setupChange(`
# Plan

## Phase 1: Complete Change [~]
- [x] Implement change

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

  test("stage templates delegate execution quality to available skills and routers", () => {
    for (const templateName of templateNames) {
      const template = readTemplate(templateName);

      expect(template).toContain("Агент может использовать любые доступные релевантные skills, session routers и tools");
      expect(template).toContain("Skills и routers отвечают за методику выполнения");
      expect(template).toContain("Flow Next задает только stage contract");
      expect(template).toContain("Skills control method; Flow Next controls artifacts and state");
      expect(template).toContain("External skills may not create persistent files outside the artifacts allowed by this stage");
      expect(template).toContain("If a skill normally writes its own report/file, inline the relevant result");
    }
  });

  test("stage templates preserve explicit artifact allowlists", () => {
    const expectations: Array<[string, string[]]> = [
      ["step0_setup.md", ["Allowed persistent artifacts for this stage", "`prd.md`", "`rules.md`", "change folder"]],
      ["step1_research.md", ["Allowed persistent artifacts for this stage", "`research_facts.md`"]],
      ["step2_design.md", ["Allowed persistent artifacts for this stage", "`architecture/design.md`", "linked files inside `architecture/`"]],
      ["step3_plan.md", ["Allowed persistent artifacts for this stage", "`implementation_plan.md`"]],
      ["step4_impl.md", ["Allowed persistent artifacts for this stage", "production/test code", "task checkboxes in `implementation_plan.md`"]],
      ["step5a_val.md", ["Allowed persistent artifacts for this stage", "`validation_findings.md`", "phase status in `implementation_plan.md`"]],
      ["step5b_val.md", ["Allowed persistent artifacts for this stage", "`validation_findings.md`", "phase status in `implementation_plan.md`"]],
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

  test("setup prompt requires task description and task-specific rules before artifacts", () => {
    const template = readTemplate("step0_setup.md");

    expect(template).toContain("Сначала запросите у пользователя описание задачи/доработки");
    expect(template).toContain("Затем отдельным запросом запросите правила и ограничения для этой задачи");
    expect(template).toContain("Не создавайте `prd.md` и `rules.md`, пока оба пункта не получены");
  });

  test("repair prompt requires approval reset for changed approved artifacts", () => {
    const template = readTemplate("step5r_repair.md");

    expect(template).toContain("Повторный human approval");
    expect(template).toContain("approved: true");
    expect(template).toContain("approved: false");
    expect(template).toContain("Для чистого `implementation` repair не меняйте approval-статусы");
  });

  test("validation prompts define ready_with_risks and blocking findings consistently", () => {
    const phaseTemplate = readTemplate("step5a_val.md");
    const finalTemplate = readTemplate("step5b_val.md");

    for (const template of [phaseTemplate, finalTemplate]) {
      expect(template).toContain("`ready_with_risks` допустим только если все findings имеют `Blocks PR? = No`");
      expect(template).toContain("Любой finding с `Blocks PR? = Yes` автоматически требует итоговый вердикт `repair_required`");
    }
  });

  test("approval prompts require flexible human-review formatting without rigid placeholder sections", () => {
    const initTemplate = readTemplate("init.md");
    const approvalTemplates = [
      readTemplate("step0_setup.md"),
      readTemplate("step2_design.md"),
      readTemplate("step3_plan.md")
    ];

    expect(initTemplate).toContain("Human Review Formatting Policy");
    expect(initTemplate).toContain("не является жестким skeleton");

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

    expect(initTemplate).toContain("compact visual review surface");
    expect(initTemplate).toContain("не является фиксированной секцией");

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

    expect(initTemplate).toContain("Если вопрос влияет на approval artifact");
    expect(initTemplate).toContain("long flat lists");

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
      readTemplate("step5a_val.md"),
      readTemplate("step5b_val.md"),
      readTemplate("step5r_repair.md"),
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

  test("validation prompts define color status markers as visual aids, not source of truth", () => {
    const phaseTemplate = readTemplate("step5a_val.md");
    const finalTemplate = readTemplate("step5b_val.md");

    for (const template of [phaseTemplate, finalTemplate]) {
      expect(template).toContain("Validation Visual Markers");
      expect(template).toContain("🟢");
      expect(template).toContain("🟡");
      expect(template).toContain("🔴");
      expect(template).toContain("⚪");
      expect(template).toContain("🔵");
      expect(template).toContain("| ID | Signal | Status | Class | Blocks PR? | Phase | Description |");
      expect(template).toContain("Visual markers не заменяют machine-readable поля");
    }
  });

  test("archive prompt keeps OpenSpec requirement text strict and non-decorative", () => {
    const archiveTemplate = readTemplate("step6_archive.md");

    expect(archiveTemplate).toContain("В финальном отчете можно использовать visual formatting");
    expect(archiveTemplate).toContain("В OpenSpec requirement text не используйте эмоджи");
    expect(archiveTemplate).toContain("OpenSpec specs остаются нормативными");
  });

  test("init and plan prompts document single-phase and multi-phase validation routing", () => {
    const initTemplate = readTemplate("init.md");
    const planTemplate = readTemplate("step3_plan.md");

    expect(initTemplate).toContain("Если в плане одна фаза");
    expect(initTemplate).toContain("Если в плане несколько фаз");
    expect(planTemplate).toContain("Implementation -> Final Validation");
    expect(planTemplate).toContain("Implementation -> Phase Validation");
    expect(planTemplate).toContain("Additional checks:");
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
    expect(archiveTemplate).toContain("## ADDED Requirements");
    expect(archiveTemplate).toContain("{{archive_state_path}}");
    expect(archiveTemplate).toContain("status: \"completed\"");
    expect(archiveTemplate).not.toContain("{{archive_command}}");
    expect(archiveTemplate).not.toContain("Blocks PR?");
  });

  test("skill router template defines budget, evidence routing, and mandatory dev-core stages", () => {
    const template = readTemplate("skill_router.md");

    expect(template).toContain("Mandatory Skill Selection Router");
    expect(template).toContain("максимум 4 skill bodies");
    expect(template).toContain("максимум 5 skill bodies");
    expect(template).toContain("Определи домен по evidence");
    expect(template).toContain("Не подключай frontend skills для backend-only задач");
    expect(template).toContain("`2 Design`: required `dev-core`, `architecture`");
    expect(template).toContain("`3 Plan`: required `dev-core`, `planning-and-task-breakdown`, `test-driven-development`");
    expect(template).toContain("`4 Implementation`: required `dev-core`, `incremental-implementation`, `test-driven-development`");
    expect(template).toContain("`5R Repair Loop`: required `dev-core`, `receive-review`");
    expect(template).toContain("Setup, Research, Design, Plan, Implementation, Archive: максимум 4 skill bodies");
    expect(template).toContain("`6 Archive`: required `spec-driven-development`");
    expect(template).toContain("Do not use `documentation-and-adrs`, `ship`, `deploy`, or `release-docs` unless the user explicitly expands archive scope beyond requirement/spec sync");
  });
});
