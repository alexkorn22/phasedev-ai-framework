# План: целостность реестра validation_findings.md (CLI-owned артефакт, baseline-гейт, контракт фидбэка)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every coding task MUST invoke the `dev-core` skill before the first edit.

Спека: `docs/superpowers/specs/2026-07-07-findings-registry-integrity-design.md`. Этот план заменяет `temp/plan/2026-07-07-findings-registry-integrity.md` (актуализация по §8 спеки: write-guard исключён; добавлены guard автокоррекции вердикта, очистка baseline при архиве, полный CLI-ownership с `set-verdict` и созданием файла, `maxRepairCycles`, команда `phasedev feedback`).

**Goal:** Валидатор и исправитель не могут удалять, переписывать или дублировать записи в `validation_findings.md`; артефакт полностью CLI-owned (создание файла, строки, вердикт — только команды `phasedev`); исправления фиксируются в колонке `Resolution` и перепроверяются; late-фидбэк пользователя имеет канонический путь (`add-finding` + контракт `phasedev feedback`); всё контролируется гейтами `check-validation`/`advance`, а не только промптами.

**Architecture:** Три программных слоя защиты: (1) колонка `Resolution` + консистентность Status↔Resolution в парсере; (2) CLI-only мутации (`add-finding`/`resolve-finding`/`reopen-finding`/`set-verdict`, команды создают файл при отсутствии, выдают ID, дедуплицируют и чинят вердикт); (3) baseline-снапшот `.findings-baseline.json`, который `advance` пишет при входе в validation/repair-фазы, а гейты диффуют. Четвёртый, непрограммный слой — ужесточённые промпт-контракты (append-only, перепроверка resolved, граница записи review-фаз, наследование при делегировании) и контракт `phasedev feedback`. Программный write-guard НЕ строится (решение пользователя от 2026-07-07).

**Tech Stack:** TypeScript (bun), тесты `bun test`, typecheck `npm run typecheck`.

## Global Constraints

- Замороженные контракты не меняются: YAML-ключи `approved`, `verdict`, `type`; множество вердиктов `{ready, ready_with_risks, repaired, repair_required}`; семантика `ready_with_risks`; формат заголовка итерации `## Iteration N: Name [x|~| |/]`; `state.json = { activePhase, activeIteration, repairCycleCount }`.
- Направление зависимостей: entrypoints → features → entities/shared; entities → shared.
- Никаких новых скриптов в корне `src/`.
- Explicit return types для экспортируемых функций; без `any`.
- Executable-код и тексты промптов/шаблонов — на английском.
- Approval/blocker/feedback-промпты — policy-free (без phase-specific skill policy).
- После каждой задачи: сфокусированные тесты; в конце — полный `bun test` + `npm run typecheck`.

---

## File Structure

| Файл | Роль в изменении |
|---|---|
| `src/entities/validation-findings/parse-validation-findings.ts` | Modify: колонка `Resolution`, консистентность Status↔Resolution, дубль-детект по каноническому тексту, экспорт `canonicalFindingKey` |
| `src/entities/validation-findings/findings-baseline.ts` | Create: запись/чтение baseline и diff текущей таблицы против baseline |
| `src/entities/change/paths.ts` | Modify: `findingsBaselinePath` в `ChangePaths` |
| `src/features/artifact-ops/manage-findings.ts` | Modify: 8 колонок, `writeTable`-хелпер, создание файла, авто-ID, дедуп, `resolveFinding` с evidence, новые `reopenFinding` и `setFindingsVerdict`, автокоррекция вердикта с guard, миграция legacy |
| `src/cli.ts` | Modify: `add-finding` (опц. ID, авто-iteration "Final", создание файла), `resolve-finding --resolution`, новые `reopen-finding`, `set-verdict`, `feedback` |
| `src/features/cli-help/render-help.ts` | Modify: help для новых команд/опций |
| `src/features/phase-control/get-feedback-prompt.ts` | Create: рендер контракта обработки фидбэка |
| `templates/feedback.md` | Create: шаблон контракта фидбэка |
| `src/features/phase-control/advance-flow.ts` | Modify: запись baseline при входе в validation/repair; удаление baseline перед архивной мутацией; `config.maxRepairCycles` |
| `src/features/phase-control/reopen-phase.ts`, `src/features/flow-state/reset-change.ts` | Modify: удаление `.findings-baseline.json` |
| `src/features/phase-control/check-flow.ts` | Modify: baseline-diff в `checkValidationCompletion` |
| `src/features/phase-control/phase-validators.ts` | Modify: baseline-diff в `validatePhase` для validation/repair фаз |
| `src/entities/config/config.ts`, `src/features/config-ops/set-config.ts` | Modify: `maxRepairCycles` |
| `templates/artifacts/validation_findings.md` | Modify: 8 колонок, CLI-owned контракт |
| `templates/validation_common.md` | Modify: Write boundary + переписанный реестровый блок |
| `templates/phase6a_iteration_validation.md`, `templates/phase6b_final_validation.md` | Modify: read-only строка в allowlist, late-фидбэк в Phase completion |
| `templates/phase6r_finding_repair.md` | Modify: CLI-only мутации, `set-verdict`, неизменяемость стабильных полей |
| `src/features/phase-control/get-phase-prompt.ts`, `prompt-render-helpers.ts` | Modify: `canonicalFillRules` для контракта findings |
| `skills/phasedev-orchestrator/SKILL.md` | Modify: findings-команды, переписанный User Feedback Handling, maxRepairCycles |
| `test/parser.test.ts`, `test/manage-findings.test.ts`, `test/cli.test.ts`, `test/controller.test.ts`, `test/config.test.ts`, `test/e2e-flow.test.ts`, `test/template-validator-drift.test.ts` | Modify/Test |
| `test/findings-baseline.test.ts` | Create: тесты baseline-модуля |

Зафиксированные решения:

- **Колонка `Resolution`** — 8-я, последняя. `resolved` → обязательна и не-placeholder; `open` → пустая; `reopened` — прежнее содержимое + `; reopened: <evidence>`.
- **Совместимость:** парсер принимает legacy 7-колоночную таблицу (Resolution = `""`, Resolution-проверки не применяются). `manage-findings` при первой мутации мигрирует в 8 колонок (`resolved` без Resolution → `legacy: resolved before Resolution column`).
- **Дубль-детект парсера — только среди `open`/`reopened`** (блокировка по всем строкам дала бы deadlock на исторических таблицах: удалять строки запрещает baseline). Дубли против `resolved` ловит только `addFinding`.
- **CLI-only мутации, включая создание файла и вердикт.** `add-finding` и `set-verdict` создают файл при отсутствии; агент НИКОГДА не инстанцирует файл из шаблона и не правит его руками, включая frontmatter.
- **Автокоррекция вердикта с guard:** open `MUST-FIX` при `verdict ∈ {ready, ready_with_risks, repaired}` → `repair_required`; не-blocking при `ready` → `ready_with_risks`; отсутствующая/невалидная строка `verdict:` (например, плейсхолдер шаблона) → коррекция молча пропускается.
- **Baseline:** `{ rows: [...] }` в `<changeDir>/.findings-baseline.json`; единственный писатель — `advance` при входе в `iteration_validation`/`final_validation`/`finding_repair`. Отсутствует → diff молча пропускается; битый JSON → одиночный issue. Очистка: `reopen-phase`, `reset-change`, переход `archive_ready → archive` (перед перемещением папки).
- **Write-guard не строится** — защита review-фаз остаётся промпт-контрактами (Write boundary, наследование при делегировании).
- **Контракт фидбэка** переезжает из захардкоженного промпта в `SKILL.md` в шаблон `templates/feedback.md` + команду `phasedev feedback` (механизм «команда печатает контракт», как `phasedev phase`); текст фидбэка команде не передаётся.

---

### Task 1: Парсер — колонка `Resolution`, консистентность и детект дубликатов

**Files:**
- Modify: `src/entities/validation-findings/parse-validation-findings.ts`
- Test: `test/parser.test.ts` (секция validation findings)

**Interfaces:**
- Produces: `ValidationFindingRow` и `ValidationFindingState` получают поле `resolution: string`; экспорт `canonicalFindingKey(finding: string): string`; парсер принимает 8-колоночный заголовок (строгий) и legacy 7-колоночный.

- [ ] **Step 1: Написать падающие тесты**

Добавить в `test/parser.test.ts`. В файле уже есть временные каталоги/хелперы записи — использовать их (по образцу соседних кейсов findings); контент кейсов:

```ts
const FM = "---\nverdict: repair_required\ntype: iteration\ndate: 2026-07-07\n---\n\n";
const HDR8 = "| ID | Status | Severity | Class | Iteration | Finding | Required Fix | Resolution |\n|---|---|---|---|---|---|---|---|\n";
const HDR7 = "| ID | Status | Severity | Class | Iteration | Finding | Required Fix |\n|---|---|---|---|---|---|---|\n";

test("accepts 8-column table and exposes resolution", () => {
  const file = writeTmp(FM + HDR8 +
    "| F2 | open | MUST-FIX | implementation | Iteration 1 | Missing null guard in parser | Add guard |  |\n" +
    "| F1 | resolved | NIT | test | Iteration 1 | Weak assertion | Strengthen assertion | Fixed in test/parser.test.ts; bun test parser -> pass |\n");
  const artifact = parseValidationFindingsArtifact(file);
  expect(artifact.issues).toEqual([]);
  expect(artifact.rows[1].resolution).toContain("Fixed in test/parser.test.ts");
});

test("accepts legacy 7-column table with empty resolution and no resolution issues", () => {
  const file = writeTmp(FM + HDR7 +
    "| F1 | resolved | NIT | test | Iteration 1 | Weak assertion | Strengthen assertion |\n" +
    "| F2 | open | MUST-FIX | implementation | Iteration 1 | Missing null guard | Add guard |\n");
  const artifact = parseValidationFindingsArtifact(file);
  expect(artifact.issues).toEqual([]);
  expect(artifact.rows[0].resolution).toBe("");
});

test("resolved row in 8-column table requires non-placeholder Resolution", () => {
  const file = writeTmp(FM + HDR8 +
    "| F2 | open | MUST-FIX | implementation | Iteration 1 | Missing null guard | Add guard |  |\n" +
    "| F1 | resolved | NIT | test | Iteration 1 | Weak assertion | Strengthen assertion |  |\n");
  const artifact = parseValidationFindingsArtifact(file);
  expect(artifact.issues.some(i => i.message.includes("F1") && i.message.includes("Resolution"))).toBe(true);
});

test("open row must have empty Resolution", () => {
  const file = writeTmp(FM + HDR8 +
    "| F1 | open | MUST-FIX | implementation | Iteration 1 | Missing null guard | Add guard | already fixed |\n");
  const artifact = parseValidationFindingsArtifact(file);
  expect(artifact.issues.some(i => i.message.includes("F1") && i.message.includes("must be empty"))).toBe(true);
});

test("two OPEN rows with the same canonical finding text are flagged as duplicates", () => {
  const file = writeTmp(FM + HDR8 +
    "| F2 | open | MUST-FIX | implementation | Iteration 1 | Missing   null guard in parser | Add guard |  |\n" +
    "| F1 | reopened | MUST-FIX | implementation | Iteration 1 | missing null guard in parser | Add guard | reopened: still broken |\n");
  const artifact = parseValidationFindingsArtifact(file);
  expect(artifact.issues.some(i => i.message.includes("duplicate finding"))).toBe(true);
});

test("open row duplicating a RESOLVED row is NOT a parser issue", () => {
  // Deadlock-защита: дубли среди resolved нельзя ни удалить (baseline), ни
  // «исправить»; их ловит только addFinding на уровне команды.
  const file = writeTmp(FM + HDR8 +
    "| F2 | open | MUST-FIX | implementation | Iteration 1 | Missing null guard in parser | Add guard |  |\n" +
    "| F1 | resolved | MUST-FIX | implementation | Iteration 1 | missing null guard in parser | Add guard | Fixed in src/x.ts; bun test -> pass |\n");
  const artifact = parseValidationFindingsArtifact(file);
  expect(artifact.issues).toEqual([]);
});

test("empty trailing Resolution cell survives row splitting", () => {
  // splitMarkdownTableRow снимает ровно одну пустышку от завершающего пайпа;
  // регресс-тест: строка "| ... | fix |  |" даёт 8 ячеек, а не 7.
  const file = writeTmp(FM + HDR8 +
    "| F1 | open | MUST-FIX | implementation | Iteration 1 | Missing null guard | Add guard |  |\n");
  const artifact = parseValidationFindingsArtifact(file);
  expect(artifact.rows.length).toBe(1);
  expect(artifact.rows[0].resolution).toBe("");
});
```

- [ ] **Step 2: Запустить и убедиться, что тесты падают**

Run: `bun test test/parser.test.ts`
Expected: FAIL (нет поля `resolution`, 8-колоночный заголовок отвергается, новых issue нет).

- [ ] **Step 3: Реализация в `parse-validation-findings.ts`**

```ts
const STRICT_HEADERS = ["id", "status", "severity", "class", "iteration", "finding", "requiredfix", "resolution"];
const LEGACY_HEADERS = STRICT_HEADERS.slice(0, 7);
const PLACEHOLDER_RESOLUTION = /^(?:TBD|TODO|n\/a|none|-)$/i;

export function canonicalFindingKey(finding: string): string {
  return finding
    .replace(/^reopened\s*\/\s*regression\s*:\s*/i, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
```

В `ValidationFindingRow` и `ValidationFindingState` добавить `resolution: string`.

Разбор заголовка: принять `normalizedHeaders`, равные `STRICT_HEADERS` ИЛИ `LEGACY_HEADERS`; запомнить `const hasResolutionColumn = normalizedHeaders.length === STRICT_HEADERS.length`. Сообщение об ошибке: `"Findings table columns must be exactly: ID, Status, Severity, Class, Iteration, Finding, Required Fix, Resolution (legacy 7-column tables without Resolution are accepted)."`. Проверка длины строки данных: `cells.length` должна равняться числу колонок заголовка (`hasResolutionColumn ? 8 : 7`), сообщение — с фактическим ожидаемым числом.

В разборе строки: `const resolution = (cells[7] ?? "").trim();` — и прокинуть `resolution` в пушащийся `ValidationFindingRow`. Новые проверки (ТОЛЬКО при `hasResolutionColumn`, после существующих проверок ячеек):

```ts
if (status === "resolved" && (resolution.length === 0 || PLACEHOLDER_RESOLUTION.test(resolution))) {
  issues.push(genericIssue(`Finding ${id || `row ${rowIndex + 1}`} is resolved but Resolution is empty or a placeholder; record what was changed and how it was verified.`));
}
if (status === "open" && resolution.length > 0) {
  issues.push(genericIssue(`Finding ${id || `row ${rowIndex + 1}`} is open but Resolution must be empty until the finding is repaired.`));
}
```

(`reopened` — без ограничений: прежний Resolution остаётся историей.)

После цикла по строкам — детект дубликатов по каноническому тексту (для обоих форматов таблицы):

```ts
const byCanonical = new Map<string, string[]>();
for (const row of rows.filter(r => r.status === "open" || r.status === "reopened")) {
  const key = canonicalFindingKey(row.finding);
  byCanonical.set(key, [...(byCanonical.get(key) ?? []), row.id]);
}
for (const ids of byCanonical.values()) {
  if (ids.length > 1) {
    issues.push(genericIssue(`Findings table contains duplicate finding text for IDs ${ids.join(", ")}; merge them into one row (update/reopen the earliest ID).`));
  }
}
```

В `parseCurrentValidationFindings` прокинуть `resolution: row.resolution` в маппинге. Существующий `canonicalFindingFor` (человекочитаемый strip префикса) не трогать.

- [ ] **Step 4: Прогнать тесты**

Run: `bun test test/parser.test.ts`
Expected: PASS (старые 7-колоночные фикстуры валидны за счёт legacy-режима).

- [ ] **Step 5: Commit**

```bash
git add src/entities/validation-findings/parse-validation-findings.ts test/parser.test.ts
git commit -m "feat: add Resolution column, status consistency and duplicate-finding detection to findings parser"
```

---

### Task 2: manage-findings — CLI-owned артефакт: создание файла, авто-ID, дедуп, evidence, reopen, set-verdict, миграция

**Files:**
- Modify: `src/features/artifact-ops/manage-findings.ts`
- Test: `test/manage-findings.test.ts`

**Interfaces:**
- Consumes: `canonicalFindingKey` из Task 1; `todayIsoDate` НЕ используется здесь (дату передаёт CLI).
- Produces:

```ts
export interface FindingsCreateContext { type: "iteration" | "final"; date: string }

export function addFinding(
  filePath: string,
  id: string | null,               // null => авто-выделение следующего F<number>
  title: string,
  severity: string,
  requiredFix: string,
  className?: string,
  iteration?: string,
  createContext?: FindingsCreateContext  // если задан и файла нет — файл создаётся
): ManageFindingsResult;

export function resolveFinding(filePath: string, id: string, resolution: string): ManageFindingsResult;
export function reopenFinding(filePath: string, id: string, evidence: string): ManageFindingsResult;
export function setFindingsVerdict(filePath: string, verdict: string, context: FindingsCreateContext): ManageFindingsResult;
```

Фактический ID всегда возвращается в `message`; смена вердикта отражается в `message` суффиксом `"; verdict updated to <value>"`.

- [ ] **Step 1: Падающие тесты** (`test/manage-findings.test.ts`; хелперы `createTempWorkspace`/`findingsPath()` уже есть в файле). Хелпер для кейсов:

```ts
const FM = (verdict: string) => `---\nverdict: ${verdict}\ntype: iteration\ndate: 2026-07-01\n---\n\n`;
const HDR7 = "| ID | Status | Severity | Class | Iteration | Finding | Required Fix |\n|---|---|---|---|---|---|---|\n";
const CTX = { type: "iteration" as const, date: "2026-07-07" };

function writeFindings(content: string): string {
  const filePath = findingsPath();
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}
```

Кейсы:

```ts
test("addFinding writes 8-column row with empty resolution at the top of the table body", () => {
  const file = writeFindings(FM("repair_required") + HDR7 +
    "| F1 | open | MUST-FIX | implementation | Iteration 1 | Old finding | Fix old |\n");
  const result = addFinding(file, "F2", "New finding", "MUST-FIX", "Fix new", "implementation", "Iteration 1");
  expect(result.ok).toBe(true);
  const written = fs.readFileSync(file, "utf-8");
  expect(written).toContain("| Resolution |");
  const f2Index = written.indexOf("| F2 |");
  const f1Index = written.indexOf("| F1 |");
  expect(f2Index).toBeGreaterThan(-1);
  expect(f2Index).toBeLessThan(f1Index); // new rows at the top
});

test("addFinding refuses a semantically duplicate finding with the existing ID hint", () => {
  const file = writeFindings(FM("repair_required") + HDR7);
  addFinding(file, "F1", "Missing null guard in parser", "MUST-FIX", "Add guard", "implementation", "Iteration 1");
  const result = addFinding(file, "F2", "missing   NULL guard in parser", "MUST-FIX", "Add guard", "implementation", "Iteration 1");
  expect(result.ok).toBe(false);
  expect(result.message).toContain("F1");
});

test("addFinding refuses a duplicate of a RESOLVED row", () => {
  const file = writeFindings(FM("repair_required") + HDR7 +
    "| F1 | resolved | MUST-FIX | implementation | Iteration 1 | Missing null guard | Add guard |\n" +
    "| F2 | open | MUST-FIX | implementation | Iteration 1 | Another defect | Fix it |\n");
  const result = addFinding(file, null, "Missing null guard", "MUST-FIX", "Add guard", "implementation", "Iteration 1");
  expect(result.ok).toBe(false);
  expect(result.message).toContain("F1");
});

test("addFinding with id=null allocates next F<number> and reports it", () => {
  const file = writeFindings(FM("repair_required") + HDR7 +
    "| F1 | open | MUST-FIX | implementation | Iteration 1 | First | Fix 1 |\n" +
    "| F3 | open | MUST-FIX | implementation | Iteration 1 | Third | Fix 3 |\n");
  const result = addFinding(file, null, "Fourth", "MUST-FIX", "Fix 4", "implementation", "Iteration 1");
  expect(result.ok).toBe(true);
  expect(result.message).toContain("F4"); // max существующих + 1, дыры не переиспользуются
});

test("addFinding creates the file when missing and a create context is given", () => {
  const file = findingsPath();
  const result = addFinding(file, null, "Late feedback defect", "MUST-FIX", "Fix it", "implementation", "Final", { type: "final", date: "2026-07-07" });
  expect(result.ok).toBe(true);
  const written = fs.readFileSync(file, "utf-8");
  expect(written).toContain("verdict: repair_required"); // консистентен с open MUST-FIX
  expect(written).toContain("type: final");
  expect(written).toContain("date: 2026-07-07");
  expect(written).toContain("| F1 |");
});

test("addFinding creating a file for a non-blocking finding uses ready_with_risks", () => {
  const file = findingsPath();
  const result = addFinding(file, null, "Minor nit", "NIT", "Polish it", "test", "Final", { type: "final", date: "2026-07-07" });
  expect(result.ok).toBe(true);
  expect(fs.readFileSync(file, "utf-8")).toContain("verdict: ready_with_risks");
});

test("addFinding without create context still refuses a missing file", () => {
  const result = addFinding(findingsPath(), "F1", "X", "MUST-FIX", "Fix", "implementation", "Iteration 1");
  expect(result.ok).toBe(false);
  expect(result.message).toContain("File not found");
});

test("resolveFinding requires concrete resolution evidence", () => {
  const file = writeFindings(FM("repair_required") + HDR7 +
    "| F1 | open | MUST-FIX | implementation | Iteration 1 | Defect | Fix it |\n");
  expect(resolveFinding(file, "F1", "TBD").ok).toBe(false);
  const result = resolveFinding(file, "F1", "Fixed in src/x.ts; bun test x -> pass");
  expect(result.ok).toBe(true);
  const written = fs.readFileSync(file, "utf-8");
  expect(written).toContain("| resolved |");
  expect(written).toContain("Fixed in src/x.ts; bun test x -> pass");
});

test("resolveFinding refuses a resolved finding", () => {
  const file = writeFindings(FM("repair_required") + HDR7 +
    "| F1 | open | MUST-FIX | implementation | Iteration 1 | Defect | Fix it |\n");
  resolveFinding(file, "F1", "Fixed in src/x.ts; bun test -> pass");
  expect(resolveFinding(file, "F1", "Fixed again").ok).toBe(false);
});

test("reopenFinding flips resolved to reopened and appends evidence to Resolution", () => {
  const file = writeFindings(FM("repair_required") + HDR7 +
    "| F1 | open | MUST-FIX | implementation | Iteration 1 | Defect | Fix it |\n" +
    "| F2 | open | MUST-FIX | implementation | Iteration 1 | Other | Fix other |\n");
  resolveFinding(file, "F1", "Fixed in src/x.ts; bun test x -> pass");
  const result = reopenFinding(file, "F1", "guard still missing for empty string input");
  expect(result.ok).toBe(true);
  const written = fs.readFileSync(file, "utf-8");
  expect(written).toContain("| reopened |");
  expect(written).toContain("reopened: guard still missing for empty string input");
  expect(written).toContain("Fixed in src/x.ts"); // прежний Resolution сохранён
});

test("reopenFinding refuses an open finding and placeholder evidence", () => {
  const file = writeFindings(FM("repair_required") + HDR7 +
    "| F1 | open | MUST-FIX | implementation | Iteration 1 | Defect | Fix it |\n");
  expect(reopenFinding(file, "F1", "still broken").ok).toBe(false); // не resolved
  resolveFinding(file, "F1", "Fixed in src/x.ts; bun test -> pass");
  expect(reopenFinding(file, "F1", "TBD").ok).toBe(false); // placeholder
});

test("mutation migrates a legacy 7-column table to 8 columns", () => {
  const file = writeFindings(FM("repair_required") + HDR7 +
    "| F1 | resolved | NIT | test | Iteration 1 | Weak assertion | Strengthen |\n" +
    "| F2 | open | MUST-FIX | implementation | Iteration 1 | Defect | Fix it |\n");
  addFinding(file, null, "New defect", "MUST-FIX", "Fix new", "implementation", "Iteration 1");
  const written = fs.readFileSync(file, "utf-8");
  expect(written).toContain("| Resolution |");
  expect(written).toContain("legacy: resolved before Resolution column"); // у F1
  expect(written.split("\n").find(l => l.startsWith("| F2 |"))).toMatch(/\|\s*\|$/); // F2 Resolution пуст
});

test("addFinding flips verdict ready -> repair_required when adding an open MUST-FIX", () => {
  const file = writeFindings(FM("ready") + HDR7);
  const result = addFinding(file, null, "Late defect", "MUST-FIX", "Fix it", "implementation", "Iteration 1");
  expect(result.ok).toBe(true);
  expect(result.message).toContain("verdict updated to repair_required");
  expect(fs.readFileSync(file, "utf-8")).toContain("verdict: repair_required");
});

test("addFinding flips verdict ready -> ready_with_risks when adding a NIT", () => {
  const file = writeFindings(FM("ready") + HDR7);
  addFinding(file, null, "Minor nit", "NIT", "Polish", "test", "Iteration 1");
  expect(fs.readFileSync(file, "utf-8")).toContain("verdict: ready_with_risks");
});

test("addFinding keeps verdict repair_required unchanged", () => {
  const file = writeFindings(FM("repair_required") + HDR7 +
    "| F1 | open | MUST-FIX | implementation | Iteration 1 | Defect | Fix it |\n");
  const result = addFinding(file, null, "Another defect", "MUST-FIX", "Fix it too", "implementation", "Iteration 1");
  expect(result.message).not.toContain("verdict updated");
  expect(fs.readFileSync(file, "utf-8")).toContain("verdict: repair_required");
});

test("addFinding skips verdict correction when the verdict line is a template placeholder", () => {
  const file = writeFindings("---\nverdict: <set_after_review>\ntype: iteration\ndate: 2026-07-01\n---\n\n" + HDR7);
  const result = addFinding(file, null, "Defect during review", "MUST-FIX", "Fix it", "implementation", "Iteration 1");
  expect(result.ok).toBe(true);
  expect(result.message).not.toContain("verdict updated");
  expect(fs.readFileSync(file, "utf-8")).toContain("verdict: <set_after_review>"); // не тронут
});

test("addFinding preserves type and date frontmatter fields", () => {
  const file = writeFindings(FM("ready") + HDR7);
  addFinding(file, null, "Defect", "MUST-FIX", "Fix", "implementation", "Iteration 1");
  const written = fs.readFileSync(file, "utf-8");
  expect(written).toContain("type: iteration");
  expect(written).toContain("date: 2026-07-01");
});

test("reopenFinding applies the same verdict correction", () => {
  const file = writeFindings(FM("repair_required") + HDR7 +
    "| F1 | open | MUST-FIX | implementation | Iteration 1 | Defect | Fix it |\n");
  resolveFinding(file, "F1", "Fixed in src/x.ts; bun test -> pass");
  setFindingsVerdict(file, "repaired", CTX);
  const result = reopenFinding(file, "F1", "defect is still reproducible");
  expect(result.ok).toBe(true);
  expect(result.message).toContain("verdict updated to repair_required");
});

test("setFindingsVerdict validates the value and consistency with rows", () => {
  const file = writeFindings(FM("repair_required") + HDR7 +
    "| F1 | open | MUST-FIX | implementation | Iteration 1 | Defect | Fix it |\n");
  expect(setFindingsVerdict(file, "done", CTX).ok).toBe(false);          // невалидное значение
  expect(setFindingsVerdict(file, "ready", CTX).ok).toBe(false);         // open строки существуют
  resolveFinding(file, "F1", "Fixed in src/x.ts; bun test -> pass");
  expect(setFindingsVerdict(file, "repair_required", CTX).ok).toBe(false); // нет open MUST-FIX
  const result = setFindingsVerdict(file, "repaired", CTX);
  expect(result.ok).toBe(true);
  const written = fs.readFileSync(file, "utf-8");
  expect(written).toContain("verdict: repaired");
  expect(written).toContain("date: 2026-07-07"); // date обновлён командой
});

test("setFindingsVerdict creates the file with an empty table when missing", () => {
  const result = setFindingsVerdict(findingsPath(), "ready", { type: "final", date: "2026-07-07" });
  expect(result.ok).toBe(true);
  const written = fs.readFileSync(findingsPath(), "utf-8");
  expect(written).toContain("verdict: ready");
  expect(written).toContain("type: final");
  expect(written).toContain("| Resolution |");
});
```

- [ ] **Step 2: Run** `bun test test/manage-findings.test.ts` → FAIL.

- [ ] **Step 3: Реализация**

Константы и импорт:

```ts
import { ALLOWED_SEVERITIES, ALLOWED_CLASSES, canonicalFindingKey } from "../../entities/validation-findings/parse-validation-findings";

const HEADER_CELLS = ["ID", "Status", "Severity", "Class", "Iteration", "Finding", "Required Fix", "Resolution"];
const SEPARATOR = "|---|---|---|---|---|---|---|---|";
const LEGACY_RESOLVED_RESOLUTION = "legacy: resolved before Resolution column";
const KNOWN_VERDICTS = ["ready", "ready_with_risks", "repaired", "repair_required"] as const;
```

`FindingTableRow` + `resolution: string`. В `parseTable`: `resolution: cells[7] ?? ""`; после маппинга строк — миграция legacy:

```ts
for (const row of rows) {
  if (row.resolution.trim().length === 0 && row.status.toLowerCase() === "resolved") {
    row.resolution = LEGACY_RESOLVED_RESOLUTION;
  }
}
```

Приватные хелперы (устраняют дублирование построения таблицы и правки frontmatter):

```ts
function writeTable(filePath: string, parsed: ReturnType<typeof parseTable>, rows: FindingTableRow[]): void {
  const tableBody = rows.map(r => padColumns([r.id, r.status, r.severity, r.className, r.iteration, r.finding, r.requiredFix, r.resolution]));
  const table = [padColumns(HEADER_CELLS), SEPARATOR, ...tableBody].join("\n");
  writeFileAtomic(filePath, composeDocument(parsed.frontmatter, parsed.bodyBeforeTable, table, parsed.bodyAfterTable));
}

function readVerdictLine(frontmatter: string): string | null {
  const match = frontmatter.match(/^verdict:\s*(.+?)\s*$/m);
  return match ? match[1] : null;
}

function isKnownVerdict(value: string): value is (typeof KNOWN_VERDICTS)[number] {
  return (KNOWN_VERDICTS as readonly string[]).includes(value);
}

function correctedVerdict(current: string, addedSeverity: string): string | null {
  const isBlocking = addedSeverity.toUpperCase() === "MUST-FIX";
  if (isBlocking && ["ready", "ready_with_risks", "repaired"].includes(current)) return "repair_required";
  if (!isBlocking && current === "ready") return "ready_with_risks";
  return null;
}

/**
 * Открытая строка делает «готовый» вердикт противоречивым; команда чинит его
 * атомарно. Guard: отсутствующая или невалидная строка verdict (например,
 * плейсхолдер шаблона до записи вердикта валидатором) — коррекция молча
 * пропускается, файл не трогается.
 */
function applyVerdictCorrection(parsed: ReturnType<typeof parseTable>, addedSeverity: string): string {
  const current = readVerdictLine(parsed.frontmatter);
  if (current === null || !isKnownVerdict(current)) return "";
  const next = correctedVerdict(current, addedSeverity);
  if (!next) return "";
  parsed.frontmatter = parsed.frontmatter.replace(/^verdict:\s*.*$/m, `verdict: ${next}`);
  return `; verdict updated to ${next}`;
}

function findingsFileSkeleton(context: FindingsCreateContext, verdict: string): string {
  return [
    "---",
    `verdict: ${verdict}`,
    `type: ${context.type}`,
    `date: ${context.date}`,
    "---",
    "",
    padColumns(HEADER_CELLS),
    SEPARATOR,
    ""
  ].join("\n");
}
```

`addFinding(filePath, id, title, severity, requiredFix, className?, iteration?, createContext?)`:

1. Существующие guard'ы (placeholder required fix, iteration, severity, class) остаются.
2. Создание файла: если `!fs.existsSync(filePath)` — при отсутствии `createContext` прежний отказ `File not found: ...`; при наличии — записать `findingsFileSkeleton(createContext, severity.toUpperCase() === "MUST-FIX" ? "repair_required" : "ready_with_risks")` через `writeFileAtomic` и продолжить обычный путь (файл уже консистентен, коррекция вердикта станет no-op).
3. Дедуп по каноническому тексту против ВСЕХ строк (включая resolved), до проверки ID:

```ts
const duplicate = rows.find(r => canonicalFindingKey(r.finding) === canonicalFindingKey(title));
if (duplicate) {
  return { ok: false, message: `Finding \`${duplicate.id}\` already covers this issue ("${duplicate.finding}"). Update or reopen ${duplicate.id} instead of adding a duplicate.` };
}
```

4. Авто-ID при `id === null`:

```ts
const maxNumber = rows.reduce((max, row) => {
  const match = /^F(\d+)$/i.exec(row.id.trim());
  return match ? Math.max(max, Number.parseInt(match[1], 10)) : max;
}, 0);
const newId = id ?? `F${maxNumber + 1}`;
```

При явном `id` — прежняя проверка дубликата ID.

5. Новая строка `{ ..., resolution: "" }` вставляется В НАЧАЛО тела: `const allRows = [newRow, ...rows];` (контракт артефакта «new rows at the top»; текущий код вставлял в конец — меняется сознательно).
6. `const verdictNote = applyVerdictCorrection(parsed, normalizedSeverity);` перед `writeTable(filePath, parsed, allRows)`.
7. `message: \`Finding ${newId} added (severity: ${normalizedSeverity})${verdictNote}.\``.

`resolveFinding(filePath, id, resolution)`: guard `isPlaceholderRequiredFix(resolution)` → `{ ok: false, message: "Resolution must record what was changed and how it was verified; placeholders are not allowed." }`; строка не найдена → прежний отказ; переход разрешён только из `open`/`reopened` (иначе `Finding ${id} is ${status}; only open or reopened findings can be resolved.`); установить `status = "resolved"`, `resolution = resolution.trim()`; `writeTable`.

`reopenFinding(filePath, id, evidence)`: guard на placeholder-evidence («Reopen evidence must be concrete; placeholders are not allowed.»); разрешён только из `resolved` (иначе `Finding ${id} is ${status}; only resolved findings can be reopened.`); `status = "reopened"`; `row.resolution = row.resolution ? \`${row.resolution}; reopened: ${evidence.trim()}\` : \`reopened: ${evidence.trim()}\`` (текст Finding не меняется — ключ дедупликации стабилен); `const verdictNote = applyVerdictCorrection(parsed, row.severity);`; `writeTable`; `message: \`Finding ${id} reopened${verdictNote}.\``.

`setFindingsVerdict(filePath, verdict, context)`:

```ts
export function setFindingsVerdict(filePath: string, verdict: string, context: FindingsCreateContext): ManageFindingsResult {
  if (!isKnownVerdict(verdict)) {
    return { ok: false, message: `Invalid verdict \`${verdict}\`. Must be one of: ${KNOWN_VERDICTS.join(", ")}.` };
  }
  if (!fs.existsSync(filePath)) {
    const issue = verdictConsistencyIssue(verdict, []);
    if (issue) return { ok: false, message: issue };
    writeFileAtomic(filePath, findingsFileSkeleton(context, verdict));
    return { ok: true, message: `Created ${filePath} with verdict ${verdict}.` };
  }
  const content = fs.readFileSync(filePath, "utf-8");
  const parsed = parseTable(content);
  const issue = verdictConsistencyIssue(verdict, parsed.rows);
  if (issue) return { ok: false, message: issue };
  if (readVerdictLine(parsed.frontmatter) !== null) {
    parsed.frontmatter = parsed.frontmatter.replace(/^verdict:\s*.*$/m, `verdict: ${verdict}`);
  } else {
    return { ok: false, message: "validation_findings.md has no `verdict:` frontmatter line to update." };
  }
  parsed.frontmatter = /^date:\s*/m.test(parsed.frontmatter)
    ? parsed.frontmatter.replace(/^date:\s*.*$/m, `date: ${context.date}`)
    : parsed.frontmatter;
  writeTable(filePath, parsed, parsed.rows);
  return { ok: true, message: `Verdict set to ${verdict}.` };
}
```

Консистентность (та же логика, что в парсере, но на момент записи):

```ts
function verdictConsistencyIssue(verdict: string, rows: FindingTableRow[]): string | null {
  const openRows = rows.filter(r => ["open", "reopened"].includes(r.status.toLowerCase()));
  const openBlocking = openRows.filter(r => r.severity.toUpperCase() === "MUST-FIX");
  if (verdict === "ready" && openRows.length > 0) return "`verdict: ready` is allowed only when there are no open or reopened findings.";
  if (verdict === "ready_with_risks" && openBlocking.length > 0) return "`verdict: ready_with_risks` is not allowed while open or reopened MUST-FIX findings exist.";
  if (verdict === "repair_required" && openBlocking.length === 0) return "`verdict: repair_required` requires at least one open or reopened MUST-FIX finding.";
  if (verdict === "repaired" && openBlocking.length > 0) return "`verdict: repaired` is not allowed while open or reopened MUST-FIX findings exist.";
  return null;
}
```

- [ ] **Step 4: Run** `bun test test/manage-findings.test.ts` → PASS. Также `bun test test/parser.test.ts` (импорт `canonicalFindingKey` не сломал парсер).

- [ ] **Step 5: Commit**

```bash
git add src/features/artifact-ops/manage-findings.ts test/manage-findings.test.ts
git commit -m "feat: CLI-owned findings mutations - file creation, auto-ID, dedup, resolution evidence, reopen, set-verdict"
```

---

### Task 3: CLI — новые формы `add-finding`, `resolve-finding --resolution`, `reopen-finding`, `set-verdict`

**Files:**
- Modify: `src/cli.ts` (блоки `add-finding` ~строка 318 и `resolve-finding` ~строка 387; новые блоки рядом)
- Modify: `src/features/cli-help/render-help.ts`
- Test: `test/cli.test.ts` (хелпер `runCli` уже есть)

**Interfaces:**
- Consumes: `addFinding` (новая сигнатура с `id: string | null` и `createContext`), `resolveFinding(filePath, id, resolution)`, `reopenFinding(filePath, id, evidence)`, `setFindingsVerdict(filePath, verdict, context)` из Task 2; `todayIsoDate` из `src/shared/time/today-iso-date`; `readFrontmatterValue` из `src/shared/markdown/frontmatter`.

- [ ] **Step 1: Падающие тесты** (`test/cli.test.ts`, по образцу существующих CLI-кейсов; подготовка активного change — как в соседних add-finding тестах):

```ts
test("add-finding without positional ID auto-allocates and reports the ID", ...);
  // runCli(["add-finding", "Some defect", "MUST-FIX", "--required-fix", "Fix it", "--class", "implementation", "--iteration", "Iteration 1", "--file", file])
  // output содержит "F1 added"

test("add-finding keeps the legacy explicit-ID form", ...);
  // runCli(["add-finding", "F7", "Some defect", "MUST-FIX", ...]) -> "F7 added"

test("add-finding creates validation_findings.md when missing", ...);
  // активный change без findings-файла, state.json activePhase=final_validation;
  // после команды файл существует, содержит type: final и verdict: repair_required

test("add-finding defaults --iteration to Final in final_validation", ...);
  // state.json { activePhase: "final_validation", activeIteration: null };
  // без --iteration команда успешна, строка содержит "| Final |"

test("resolve-finding fails without --resolution with usage text", ...);
  // output содержит "--resolution <text>"

test("resolve-finding writes resolution evidence into the 8th column", ...);

test("reopen-finding reopens a resolved finding with evidence", ...);

test("reopen-finding fails without --evidence", ...);

test("set-verdict rejects an invalid value", ...);
  // runCli(["set-verdict", "done", "--file", file]) -> exitCode 1, "Invalid verdict"

test("set-verdict ready refuses while open findings exist", ...);

test("set-verdict creates the file when missing", ...);
  // активный change без findings; runCli(["set-verdict", "ready", ...]) -> файл создан, verdict: ready
```

- [ ] **Step 2: Run** `bun test test/cli.test.ts` → FAIL.

- [ ] **Step 3: Реализация**

Импорты в `cli.ts`: добавить `reopenFinding`, `setFindingsVerdict`, `FindingsCreateContext` из manage-findings; `todayIsoDate` из `./shared/time/today-iso-date`; `readFrontmatterValue` из `./shared/markdown/frontmatter`.

Общий хелпер контекста создания (рядом с `resolveFindingsPath`):

```ts
function findingsCreateContext(projectPath: string): FindingsCreateContext {
  const state = loadFlowState(projectPath);
  return {
    type: state?.activePhase === "final_validation" ? "final" : "iteration",
    date: todayIsoDate()
  };
}
```

**`add-finding`** — переписать разбор позиционных аргументов (опциональный ID):

```ts
const looksLikeId = typeof args[1] === "string" && /^F\d+$/i.test(args[1]);
const id = looksLikeId ? args[1] : null;
const title = looksLikeId ? args[2] : args[1];
const severity = looksLikeId ? args[3] : args[2];
if (!title || !severity || title.startsWith("--") || severity.startsWith("--")) {
  // FAILED: <title> and <severity> are required.
  // Usage: phasedev add-finding [F<number>] <title> <severity> --required-fix <text> [--class <class>] [--iteration <iteration>] [--file <path>]
}
```

Порядок дальше: `--required-fix` (guard как сейчас) → `--class` → `targetFile` (`--file` || `resolveFindingsPath`, отказ при пустом — как сейчас) → авто-`--iteration`:

```ts
let iteration = parseStringOption(args, "--iteration");
if (!iteration) {
  const state = loadFlowState(projectPath);
  if (state?.activeIteration) {
    iteration = `Iteration ${state.activeIteration}`;
  } else if (state?.activePhase === "final_validation") {
    iteration = "Final";
  } else if (state?.activePhase === "finding_repair" && readFrontmatterValue(targetFile, "type") === "final") {
    iteration = "Final";
  }
}
if (!iteration) { /* прежний отказ с подсказкой --iteration */ }
```

Вызов: `addFinding(targetFile, id, title, severity, requiredFix, className, iteration, findingsCreateContext(projectPath))`. В `data` вернуть `{ file: targetFile, id: id ?? null }` (фактический авто-ID виден в `message`).

**`resolve-finding`**: `const resolution = parseStringOption(args, "--resolution");` — при отсутствии отказ с Usage `phasedev resolve-finding <id> --resolution <text> [--file <path>]`; вызов `resolveFinding(targetFile, id, resolution)`.

**`reopen-finding`** — новый блок по образцу `resolve-finding`: обязательные `<id>` и `--evidence <text>`; kind `"reopen-finding"`; Usage `phasedev reopen-finding <id> --evidence <text> [--file <path>]`; вызов `reopenFinding(targetFile, id, evidence)`.

**`set-verdict`** — новый блок:

```ts
if (command === "set-verdict") {
  const verdict = args[1];
  if (!verdict || verdict.startsWith("--")) {
    // FAILED: <verdict> is required.
    // Usage: phasedev set-verdict <verdict> [--file <path>]  (verdict: ready | ready_with_risks | repair_required | repaired)
    return;
  }
  const targetFile = parseStringOption(args, "--file") || resolveFindingsPath(projectPath);
  if (!targetFile) { /* отказ как у resolve-finding */ }
  const result = setFindingsVerdict(targetFile, verdict, findingsCreateContext(projectPath));
  const prefix = result.ok ? "[PHASEDEV SET-VERDICT] OK" : "[PHASEDEV SET-VERDICT] FAILED";
  reportCliResult(jsonMode, { ok: result.ok, kind: "set-verdict", humanMessage: `${prefix}: ${result.message}`, jsonMessage: result.message, data: { file: targetFile, verdict } });
  return;
}
```

**`render-help.ts`**: обновить строки команд:

```text
  phasedev add-finding [F<number>] <title> <severity> --required-fix <text> [--class <class>] [--iteration <iteration>] [--file <path>]
      Add a finding row to validation_findings.md. The ID is allocated automatically
      (next F<number>); pass an explicit F<number> first argument only to target a specific ID
      (a title that is literally "F<number>" is not supported). Creates the file when missing
      and corrects the YAML verdict to stay consistent with the new row.
      Side effects: modifies or creates validation_findings.md.

  phasedev resolve-finding <id> --resolution <text> [--file <path>]
      Mark a finding as resolved with repair evidence (what changed, how it was verified).
      Side effects: modifies validation_findings.md.

  phasedev reopen-finding <id> --evidence <text> [--file <path>]
      Reopen a resolved finding with new concrete evidence; evidence is appended to Resolution.
      Side effects: modifies validation_findings.md.

  phasedev set-verdict <verdict> [--file <path>]
      Record the validation verdict (ready | ready_with_risks | repair_required | repaired)
      in validation_findings.md frontmatter; validates consistency with the current rows.
      Creates the file with an empty table when missing. Updates the date field.
      Side effects: modifies or creates validation_findings.md.
```

В списке Options: `--file` — добавить `reopen-finding, set-verdict`; новые строки `--resolution <text>` («Repair evidence for resolve-finding (placeholders like TBD are rejected).»), `--evidence <text>` («New evidence for reopen-finding.»); строку `--iteration` дополнить: `Defaults to "Iteration <N>" from state.json, or "Final" during final validation.`

- [ ] **Step 4: Run** `bun test test/cli.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts src/features/cli-help/render-help.ts test/cli.test.ts
git commit -m "feat: auto-ID add-finding with file creation, resolve/reopen evidence and set-verdict CLI commands"
```

---

### Task 4: Baseline-модуль — снапшот и diff реестра

**Files:**
- Create: `src/entities/validation-findings/findings-baseline.ts`
- Modify: `src/entities/change/paths.ts`
- Test: `test/findings-baseline.test.ts`

**Interfaces:**
- Consumes: `parseValidationFindingsArtifact`, `canonicalFindingKey` (Task 1), `writeFileAtomic`.
- Produces:

```ts
export interface FindingsBaselineRow {
  id: string;
  status: string;
  severity: string;
  className: string;
  iteration: string;
  finding: string;
  requiredFix: string;
}
export interface FindingsBaseline { rows: FindingsBaselineRow[] }
export function writeFindingsBaseline(findingsPath: string, baselinePath: string): void;
export function checkFindingsAgainstBaseline(findingsPath: string, baselinePath: string): string[];
```

В `paths.ts`: поле `findingsBaselinePath: string` в `ChangePaths`, в `buildChangePaths` — `findingsBaselinePath: path.join(changeDir, ".findings-baseline.json")`.

- [ ] **Step 1: Падающие тесты** (`test/findings-baseline.test.ts`, temp-workspace как в `manage-findings.test.ts`):

```ts
test("writeFindingsBaseline snapshots current rows and writes empty rows when the file is missing", ...);
test("no issues when rows are only appended or statuses legally advanced", ...); // open→resolved + добавлена новая строка
test("deleted baseline row is reported with its ID", ...);
test("changed stable field is reported", ...);                                    // изменён Required Fix у F1
test("resolved -> open transition is reported (only reopened is allowed)", ...);
test("missing baseline file yields no issues", ...);
test("unreadable baseline JSON yields a single recovery issue", ...);
test("adding the reopened prefix to Finding is tolerated", ...); // "X" -> "Reopened / regression: X"
```

- [ ] **Step 2: Run** `bun test test/findings-baseline.test.ts` → FAIL (модуля нет).

- [ ] **Step 3: Реализация** (`findings-baseline.ts`; маппинг: поле `phase` из `ValidationFindingRow` пишется как `iteration`):

```ts
import * as fs from "fs";
import { parseValidationFindingsArtifact, canonicalFindingKey } from "./parse-validation-findings";
import { writeFileAtomic } from "../../shared/fs/write-file-atomic";

export interface FindingsBaselineRow {
  id: string;
  status: string;
  severity: string;
  className: string;
  iteration: string;
  finding: string;
  requiredFix: string;
}

export interface FindingsBaseline { rows: FindingsBaselineRow[] }

const norm = (value: string): string => value.replace(/\s+/g, " ").trim();

export function writeFindingsBaseline(findingsPath: string, baselinePath: string): void {
  const rows: FindingsBaselineRow[] = fs.existsSync(findingsPath)
    ? parseValidationFindingsArtifact(findingsPath).rows.map(row => ({
        id: row.id, status: row.status, severity: row.severity, className: row.className,
        iteration: row.phase, finding: row.finding, requiredFix: row.requiredFix
      }))
    : [];
  writeFileAtomic(baselinePath, JSON.stringify({ rows }, null, 2));
}

export function checkFindingsAgainstBaseline(findingsPath: string, baselinePath: string): string[] {
  if (!fs.existsSync(baselinePath)) return [];
  let baseline: FindingsBaseline;
  try {
    baseline = JSON.parse(fs.readFileSync(baselinePath, "utf-8")) as FindingsBaseline;
  } catch {
    return [`Findings baseline is unreadable: ${baselinePath}. Delete it or restore valid JSON, then rerun.`];
  }
  const current = new Map(parseValidationFindingsArtifact(findingsPath).rows.map(row => [row.id, row]));
  const issues: string[] = [];
  for (const base of baseline.rows) {
    const row = current.get(base.id);
    if (!row) {
      issues.push(`Finding ${base.id} was deleted from validation_findings.md. Findings are append-only: restore the row. If the registry was edited intentionally by the user outside the flow, delete .findings-baseline.json in the active change folder and rerun.`);
      continue;
    }
    const stableChanged =
      norm(row.severity) !== norm(base.severity) ||
      norm(row.className) !== norm(base.className) ||
      norm(row.phase) !== norm(base.iteration) ||
      canonicalFindingKey(row.finding) !== canonicalFindingKey(base.finding) ||
      norm(row.requiredFix) !== norm(base.requiredFix);
    if (stableChanged) {
      issues.push(`Finding ${base.id} stable fields were rewritten. Only Status and Resolution may change; restore Severity/Class/Iteration/Finding/Required Fix.`);
    }
    if (base.status === "resolved" && row.status === "open") {
      issues.push(`Finding ${base.id} went resolved -> open. A resolved finding may only become reopened (with new evidence).`);
    }
  }
  return issues;
}
```

- [ ] **Step 4: Run** `bun test test/findings-baseline.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/entities/validation-findings/findings-baseline.ts src/entities/change/paths.ts test/findings-baseline.test.ts
git commit -m "feat: findings baseline snapshot and append-only diff"
```

---

### Task 5: `advance` пишет baseline; очистка baseline при archive/reopen/reset

**Files:**
- Modify: `src/features/phase-control/advance-flow.ts` (две точки: ветка `archive_ready` ~строка 359 и блок между `applyStateSideEffects` и `saveFlowState`, строки 418–439)
- Modify: `src/features/phase-control/reopen-phase.ts`
- Modify: `src/features/flow-state/reset-change.ts`
- Test: `test/controller.test.ts`

**Interfaces:**
- Consumes: `writeFindingsBaseline` (Task 4), `paths.findingsPath`, `paths.findingsBaselinePath`.

- [ ] **Step 1: Падающие тесты** (`test/controller.test.ts`, по образцу существующих advance-тестов):
  - (а) advance в `iteration_validation` создаёт `.findings-baseline.json` в папке change; его `rows` соответствуют текущей таблице (пустой массив, если файла ещё нет);
  - (б) advance в `finding_repair` перезаписывает baseline снапшотом таблицы, записанной валидатором;
  - (в) advance `archive_ready → archive` НЕ оставляет `.findings-baseline.json` в перемещённой архивной папке;
  - (г) `reopenPhase(projectPath, "plan")` удаляет `.findings-baseline.json`, если он существовал.

- [ ] **Step 2: Run** `bun test test/controller.test.ts` → FAIL.

- [ ] **Step 3: Реализация**

В `advanceFlow`, ветка `route.kind === "archive_ready"` — перед вызовом `startArchiveStage` (служебный файл в архив не едет, ручной откат из архива невозможен):

```ts
fs.rmSync(paths.findingsBaselinePath, { force: true });
```

В `advanceFlow`, после успешного `applyStateSideEffects` и перед вычислением `nextRepairCount`/`saveFlowState`:

```ts
const BASELINE_PHASES: ReadonlySet<ActivePhase> = new Set(["iteration_validation", "final_validation", "finding_repair"]);
if (BASELINE_PHASES.has(nextState.activePhase)) {
  writeFindingsBaseline(paths.findingsPath, paths.findingsBaselinePath);
}
```

(`fs` и `ActivePhase` уже импортированы в `advance-flow.ts`; добавить импорт `writeFindingsBaseline`.)

В `reopen-phase.ts` — перед `saveFlowState` (иначе ручной откат фазы сравнивал бы таблицу с устаревшим снапшотом):

```ts
fs.rmSync(paths.findingsBaselinePath, { force: true });
```

В `reset-change.ts` — перед `fs.renameSync` (по спеке §5.4; служебный файл не должен уезжать в `.trash` как валидный снапшот):

```ts
fs.rmSync(path.join(changeDir, ".findings-baseline.json"), { force: true });
```

Также проверить, что `.findings-baseline.json` не попадает в changed-file inventory: файл лежит под `.phasedev/**`, который inventory уже исключает; если в `test/controller.test.ts` есть inventory-тест — добавить assert, отдельный код не нужен.

- [ ] **Step 4: Run** `bun test test/controller.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/phase-control/advance-flow.ts src/features/phase-control/reopen-phase.ts src/features/flow-state/reset-change.ts test/controller.test.ts
git commit -m "feat: snapshot findings baseline on advance into validation/repair and clean it up on archive/reopen/reset"
```

---

### Task 6: Гейты — baseline-diff в `check-validation` и `validatePhase`

**Files:**
- Modify: `src/features/phase-control/check-flow.ts` (`checkValidationCompletion`, ~строка 106)
- Modify: `src/features/phase-control/phase-validators.ts` (кейсы `iteration_validation`, `final_validation`, `finding_repair`)
- Test: `test/controller.test.ts`

**Interfaces:**
- Consumes: `checkFindingsAgainstBaseline` (Task 4).

- [ ] **Step 1: Падающие тесты**: (а) после записанного baseline валидатор удалил строку → `checkValidationCompletion` возвращает ok:false с сообщением про append-only/восстановление; (б) `advanceFlow` из `iteration_validation` с удалённой строкой → refuse; (в) без baseline-файла поведение прежнее (ok при валидной таблице).

- [ ] **Step 2: Run** `bun test test/controller.test.ts` → FAIL.

- [ ] **Step 3: Реализация.** В `checkValidationCompletion` — после блока `if (findings) { issues.push(...findings.issues...) }` (`paths` здесь — локальная переменная из `pathsForValidation`, не параметр):

```ts
if (paths && findings?.exists) {
  issues.push(...checkFindingsAgainstBaseline(paths.findingsPath, paths.findingsBaselinePath));
}
```

В `validatePhase` — в кейсах `iteration_validation`, `final_validation`, `finding_repair`, после пуша `findings.issues`:

```ts
issues.push(...checkFindingsAgainstBaseline(paths.findingsPath, paths.findingsBaselinePath));
```

Через `validatePhaseExit` это автоматически блокирует `advance`.

- [ ] **Step 4: Run** `bun test test/controller.test.ts test/parser.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/phase-control/check-flow.ts src/features/phase-control/phase-validators.ts test/controller.test.ts
git commit -m "feat: enforce findings append-only baseline in check-validation and phase exit gates"
```

---

### Task 7: Шаблоны и промпт-контракты (CLI-owned, append-only, граница записи)

**Files:**
- Modify: `templates/artifacts/validation_findings.md`
- Modify: `templates/validation_common.md`
- Modify: `templates/phase6a_iteration_validation.md`, `templates/phase6b_final_validation.md`
- Modify: `templates/phase6r_finding_repair.md`
- Modify: `src/features/phase-control/get-phase-prompt.ts` (`validationFindingsContract`), `src/features/phase-control/prompt-render-helpers.ts` (`finalValidationArtifactContract`)
- Test: `test/template-validator-drift.test.ts`, `test/e2e-flow.test.ts`, `test/artifact-structure.test.ts`

Изменения промпт-текстов по смыслу («intentional wording updates»); замороженные YAML-ключи и множество вердиктов не трогаются. Упоминаний write-guard/контроллер-снапшота worktree в текстах НЕТ (write-guard не строится).

- [ ] **Step 1: `templates/artifacts/validation_findings.md`** — полная замена содержимого (placeholders `{{artifact_type}}`, `{{date}}`, `{{allowed_verdicts}}`, `{{repaired_verdict_note}}` сохраняются — их подставляет `renderValidationFindingsTemplate`):

````markdown
---
verdict: <set_after_review>
type: {{artifact_type}}
date: {{date}}
---

<!--
Authoring instructions for validation and repair agents:
- This file is created and mutated ONLY by phasedev commands: `phasedev add-finding` (new row; creates the file when missing), `phasedev resolve-finding <id> --resolution <text>` (fixed), `phasedev reopen-finding <id> --evidence <text>` (defect returned), `phasedev set-verdict <verdict>` (phase verdict; creates the file when missing).
- Never write, recreate, reorder, or hand-edit ANY part of this file, including YAML frontmatter. This template only documents the structure the CLI maintains; never instantiate it yourself.
- Do not create or update a project-root validation_findings.md file.
- The final artifact must contain only YAML frontmatter and exactly one markdown table.
- The registry is append-only: never delete a row, never rewrite Severity/Class/Iteration/Finding/Required Fix of an existing row; only Status and Resolution change over a finding's life. The controller diffs the table against a baseline snapshot and blocks the phase if history was lost.
- Before adding a finding, compare it by meaning with EVERY existing row, including resolved rows. On a match, update or reopen that row's ID; never add a duplicate.

Frontmatter contract:
- verdict must be exactly one of: {{allowed_verdicts}}. It is recorded only with `phasedev set-verdict`.
- type must be exactly one of: iteration, final.
- date must be an ISO date; `phasedev set-verdict` maintains it.

Verdict contract:
- ready: use only when there are no open or reopened findings.
- ready_with_risks: use only when open/reopened findings are limited to RECOMMENDED or NIT.
- repair_required: use when at least one open/reopened MUST-FIX finding exists.
{{repaired_verdict_note}}
Table value contract:
- ID: stable finding ID such as F1, F2, F3; allocated automatically by `phasedev add-finding`.
- Status: exactly one of open, reopened, resolved.
- Severity: exactly one of MUST-FIX, RECOMMENDED, NIT.
- Class: exactly one of implementation, test, plan, design, requirements, validation, security, code_review.
- Security rows must always use Severity: MUST-FIX, including resolved rows.
- Iteration: current iteration label, Final, or another concrete validation scope.
- Finding: concrete self-contained finding with enough evidence to understand the issue.
- Required Fix: concrete action required to resolve or mitigate the finding.
- Resolution: repair evidence — what was changed (files/artifacts) and how it was verified (command -> result). Written by `phasedev resolve-finding`; required and non-placeholder when Status is resolved; empty while Status is open; `phasedev reopen-finding` keeps prior content and appends `reopened: <new evidence>`.
-->

| ID | Status | Severity | Class | Iteration | Finding | Required Fix | Resolution |
|---|---|---|---|---|---|---|---|
````

- [ ] **Step 2: `templates/validation_common.md` — реестровый блок.** Заменить строки 39–45 (от «Before searching for new issues…» до «Do not change a `resolved` row to `reopened`…» включительно) на:

```text
- Before searching for new issues, read existing `validation_findings.md` if it exists and re-verify EVERY `resolved` row: check its Resolution evidence against the actual repository state. If the repair is real, leave the row untouched; if the defect is still present, reopen that row with `phasedev reopen-finding <id> --evidence <text>` using new concrete evidence from working code outside `.phasedev/**` — never add the same finding under a new ID.
- The findings registry is append-only. Preserve every existing row, including `resolved` rows. Never delete rows, never rewrite existing Severity/Class/Iteration/Finding/Required Fix values, and never recreate the file from the embedded template. The controller compares the table against a baseline snapshot and blocks the phase if history was lost.
- `validation_findings.md` is created and mutated ONLY by phasedev commands. If the file does not exist, the first `phasedev add-finding` or `phasedev set-verdict` creates it — never write the file by hand, not even from the embedded template.
- Mutate table rows ONLY through the CLI: `phasedev add-finding "<finding>" <severity> --required-fix <text> --class <class> --iteration <label>` for a new finding, `phasedev resolve-finding <id> --resolution <text>` for a fixed one, `phasedev reopen-finding <id> --evidence <text>` for a returned defect. Record the phase verdict ONLY with `phasedev set-verdict <verdict>`. Never hand-edit any part of the file, including YAML frontmatter. The commands enforce ID allocation, verdict consistency, escaping, and row order for you.
- IDs are allocated by `add-finding` automatically (next `F<number>`); pass an explicit `F<number>` first argument only to target a specific ID. Never reuse an existing ID (`add-finding` refuses duplicates).
- If a new finding semantically matches an existing row (open or resolved), do not add it: reopen or leave the existing ID instead. Both `add-finding` and `phasedev check-validation` reject duplicate finding texts.
- Do not reopen a `resolved` row without new concrete evidence from working code outside `.phasedev/**`.
```

- [ ] **Step 2a: `templates/validation_common.md` — граница записи.** Сразу после строки `- {{validation_execution_rule}}` вставить блок:

```text
Write boundary (hard rule):
- This is a review-only phase for repository content. Do NOT create, modify, or delete ANY file outside this phase's Artifact allowlist — no production, source, config, test, or documentation edits, not even "obvious one-line fixes" and not even temporarily with a later revert.
- Every defect you find or receive is recorded ONLY as a findings row; the fix itself happens later in the finding_repair phase, where TDD and code edits are expected.
- When the user reports an issue or asks to note a remark during this phase, record it with `phasedev add-finding "<finding>" <severity> --required-fix <text> --class <class> --iteration <label>` — never by hand-editing the registry and never by editing repository code.
- If you delegate ANY part of this phase to a subagent, the delegation prompt MUST start with this exact constraint: "Read-only analysis. You MUST NOT create, modify, or delete any repository file. Report findings as text only; general TDD or bugfix habits do not apply to this task." A subagent without this line is a contract violation.
- This boundary stays in force AFTER the verdict is written, until `phasedev advance` moves the flow to the next phase. Late user feedback in that window is recorded with `phasedev add-finding` (which also corrects the verdict); the fix then happens in finding_repair after advance.
```

- [ ] **Step 2b: `templates/phase6a_iteration_validation.md` и `templates/phase6b_final_validation.md`** — в секции `## Artifact allowlist` обеих фаз добавить завершающую строку:

```text
Any file not listed above is read-only for this phase.
```

- [ ] **Step 2c: Late-фидбэк в Phase completion фаз 6A/6B.** В секцию `Phase completion:` обоих шаблонов добавить пункт:

```text
- If the user reports a defect after the verdict is written and before `phasedev advance`, do not edit repository code and do not delegate a code task: record it with `phasedev add-finding "<finding>" <severity> --required-fix <text> --class <class>` (the command corrects the verdict automatically), then run `phasedev advance` — the flow will route to finding_repair where the fix is implemented.
```

Также в обоих шаблонах строку «Write validation result to [validation_findings.md]… using only the embedded Artifact Build Contract for structure» дополнить: `record rows and the verdict only through the phasedev findings commands (add-finding / resolve-finding / reopen-finding / set-verdict);`.

- [ ] **Step 3: `templates/phase6r_finding_repair.md`** — в Finding handling rules:

Заменить `- record a fixed finding by changing the existing row \`Status\` to \`resolved\`;` на:

```text
- record a fixed finding with `phasedev resolve-finding <id> --resolution "<what changed; verification command -> result>"`; the Resolution cell must name the changed files/artifacts and the check that proves the repair;
```

Заменить `- do not change stable fields in an existing row unless needed to fix an explicit error in the row;` (конфликтует с baseline-гейтом) на:

```text
- stable fields (Severity, Class, Iteration, Finding, Required Fix) of an existing row are immutable; if a row is factually wrong, close it with `phasedev resolve-finding <id> --resolution "inaccurate finding: <why>"` and add a corrected row with `phasedev add-finding`;
```

Добавить пункты:

```text
- mutate the registry ONLY through the phasedev commands (add-finding / resolve-finding / reopen-finding / set-verdict); never hand-edit table rows, the verdict, or any frontmatter value;
- never clear or rewrite another finding's Resolution content;
```

В секции `Verdict rule:` заменить `- when all current blocking findings have latest status \`resolved\`, set \`verdict: repaired\` and update the date;` на:

```text
- when all current blocking findings have latest status `resolved`, run `phasedev set-verdict repaired` (the command validates consistency and updates the date);
```

и `- do not change \`verdict: repair_required\` while any current blocking finding does not have latest status \`resolved\`;` оставить, дополнив `; the verdict is recorded only with phasedev set-verdict`.

- [ ] **Step 4: canonicalFillRules для контракта findings.** В `validationFindingsContract` (`get-phase-prompt.ts`) и `finalValidationArtifactContract` (`prompt-render-helpers.ts`) добавить в опции `renderArtifactContract`:

```ts
canonicalFillRules: [
  "- Never write this artifact by hand: `phasedev add-finding` and `phasedev set-verdict` create it when missing, and every row or verdict change goes through the phasedev findings commands. The embedded template only documents the structure the CLI maintains.",
  "- If the Output path already exists, it is edited in place through those commands: never recreate it from the embedded template and never drop existing table rows.",
  "- The findings registry is append-only; the controller diffs it against a baseline snapshot and fails the self-check if rows were deleted or rewritten."
]
```

- [ ] **Step 5: Актуализировать тесты шаблонов/e2e.** Прогнать `bun test test/template-validator-drift.test.ts test/e2e-flow.test.ts test/artifact-structure.test.ts`; обновить фикстуры/ожидания, где генерируется или парсится таблица findings (8-колоночный заголовок в ожиданиях; e2e-шаги репэйра — через новую сигнатуру `resolveFinding`/CLI). Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add templates src/features/phase-control/get-phase-prompt.ts src/features/phase-control/prompt-render-helpers.ts test
git commit -m "feat: CLI-owned append-only findings prompt contracts with Resolution column and write boundary"
```

---

### Task 8: Команда `phasedev feedback` — контракт обработки фидбэка

Контракт обработки фидбэка переезжает из захардкоженного JS-промпта в `SKILL.md:180-200` в штатный механизм «команда печатает контракт» (как `phasedev phase`). Текст фидбэка команде НЕ передаётся — его суб-агенту передаёт оркестратор; команда печатает только процедуру. Контракт policy-free (замороженное правило «Approval/blocker prompts stay policy-free» распространяется и на него).

**Files:**
- Create: `templates/feedback.md`
- Create: `src/features/phase-control/get-feedback-prompt.ts`
- Modify: `src/cli.ts`, `src/features/cli-help/render-help.ts`
- Test: `test/cli.test.ts`

**Interfaces:**
- Consumes: `loadFlowState`, `findActiveChangeDir`, `buildChangePaths`, `renderTemplate`, `toFileUrl`, `parseValidationVerdict`.
- Produces: `getFeedbackPrompt(projectPath: string): FeedbackPrompt` где `FeedbackPrompt = { prompt: string; blocked: boolean; reason?: string }`.

- [ ] **Step 1: Падающие тесты** (`test/cli.test.ts`):

```ts
test("feedback prints the feedback contract with live flow context", ...);
  // подготовить активный change с state.json (final_validation) и findings с verdict: ready;
  // output содержит: "phasedev add-finding", "phasedev reopen-finding", "approved: false",
  // "Do NOT run `phasedev advance`", "phasedev check", "final_validation", "ready"
  // и НЕ содержит "Skill policy" / "skill_policy"

test("feedback is blocked without an active change", ...);
  // exitCode 1, output содержит "No active change"
```

- [ ] **Step 2: Run** `bun test test/cli.test.ts` → FAIL.

- [ ] **Step 3: Создать `templates/feedback.md`** (полное содержимое):

```markdown
# PhaseDev User Feedback Contract

The user gave feedback on the current PhaseDev change. The feedback text itself is provided by the orchestrator in your task prompt; this contract defines the procedure.

Flow context:
- Active phase: {{active_phase}}
- Active iteration: {{active_iteration}}
- Findings registry: [validation_findings.md]({{findings_path}})
- Current findings verdict: {{current_verdict}}

Classify each feedback item and act:

1. **Implementation defect** (bug, quality issue, incorrect behaviour of the produced change):
   - Record it ONLY with `phasedev add-finding "<finding>" <severity> --required-fix <text> --class <class>`. The command allocates the ID, creates the file when missing, and corrects the verdict automatically.
   - If the defect matches an existing `resolved` row by meaning, use `phasedev reopen-finding <id> --evidence <text>` instead of adding a duplicate.
   - Never hand-edit validation_findings.md: rows, verdict, and frontmatter are CLI-owned.
2. **Scope / design / plan feedback** (requirements change, different architecture, re-planning):
   - Update the flow artifacts inside the active change folder (prd.md, execution_contract.md, architecture/design.md, iteration_plan.md).
   - Set `approved: false` on every artifact you changed so the flow re-enters approval.
   - Do NOT write this kind of feedback into validation_findings.md.
3. **Mixed feedback** — do both, within the same write limits.

Write boundary (hard rule):
- Do NOT create, modify, or delete any repository file outside `.phasedev/**`. General TDD or bugfix habits do not apply to this task: fixes happen later in the finding_repair phase.
- Do NOT run `phasedev advance` — the orchestrator continues the loop after you finish.

Completion:
- Run `phasedev check` after recording the feedback.
- Report: recorded finding IDs, changed artifacts and their approval status, and the `phasedev check` result.
```

- [ ] **Step 4: Создать `src/features/phase-control/get-feedback-prompt.ts`:**

```ts
import { loadFlowState } from "../../entities/change/flow-state";
import { findActiveChangeDir } from "../../entities/change/active-change";
import { buildChangePaths } from "../../entities/change/paths";
import { parseValidationVerdict } from "../../entities/validation-findings/parse-validation-findings";
import { renderTemplate } from "../../shared/templates/render-template";
import { toFileUrl } from "./prompt-formatters";

export interface FeedbackPrompt {
  prompt: string;
  blocked: boolean;
  reason?: string;
}

export function getFeedbackPrompt(projectPath: string): FeedbackPrompt {
  const state = loadFlowState(projectPath);
  const changeDir = findActiveChangeDir(projectPath);
  if (!state || !changeDir) {
    return {
      prompt: "[PHASEDEV] No active change. Run: phasedev create-change <name>.",
      blocked: true,
      reason: "No active change"
    };
  }

  const paths = buildChangePaths(changeDir);
  return {
    prompt: renderTemplate("feedback", {
      active_phase: state.activePhase,
      active_iteration: state.activeIteration === null ? "none" : String(state.activeIteration),
      findings_path: toFileUrl(paths.findingsPath),
      current_verdict: parseValidationVerdict(paths.findingsPath)
    }),
    blocked: false
  };
}
```

- [ ] **Step 5: Подключить в `cli.ts`** (рядом с блоком `phase`):

```ts
if (command === "feedback") {
  const result = getFeedbackPrompt(projectPath);
  reportCliResult(jsonMode, {
    ok: !result.blocked,
    kind: "feedback",
    humanMessage: result.prompt,
    jsonMessage: result.blocked ? (result.reason ?? "Blocked") : "Feedback contract ready.",
    data: { prompt: result.prompt }
  });
  if (result.blocked) {
    process.exitCode = 1;
  }
  return;
}
```

В `render-help.ts` добавить:

```text
  phasedev feedback [--project-path <path>]
      Print the user-feedback processing contract for the active change (read-only).
      Defines how an agent classifies feedback (implementation defect vs scope change)
      and which phasedev commands to use. Side effects: none.
```

- [ ] **Step 6: Run** `bun test test/cli.test.ts` → PASS.

- [ ] **Step 7: Commit**

```bash
git add templates/feedback.md src/features/phase-control/get-feedback-prompt.ts src/cli.ts src/features/cli-help/render-help.ts test/cli.test.ts
git commit -m "feat: phasedev feedback command printing the user-feedback processing contract"
```

---

### Task 9: Скилл оркестратора — CLI-only фидбэк и findings-команды

Секция `User Feedback Handling` в `skills/phasedev-orchestrator/SKILL.md` — прямой источник инцидента: велит руками «add findings to validation_findings.md. Set verdict to repair_required». Захардкоженный JS-промпт фидбэка удаляется; содержательная инструкция уходит в контракт `phasedev feedback` (Task 8). Строка про write-guard в Error Handling НЕ добавляется (write-guard не строится).

**Files:**
- Modify: `skills/phasedev-orchestrator/SKILL.md`
- Test: `bun test test/skill-md-drift.test.ts` (дрифт-тест проверяет route-kinds — должен остаться зелёным)

- [ ] **Step 1: Секция «Core orchestrator commands»** — добавить после строки `phasedev approve`:

```text
- `phasedev add-finding "<finding>" <severity> --required-fix <text> [--class <class>] [--iteration <label>]` — append a finding row to validation_findings.md. Allocates the ID automatically, creates the file when missing, and corrects the YAML `verdict` (e.g. ready -> repair_required for an open MUST-FIX). The ONLY way to add a finding; never hand-edit the findings registry.
- `phasedev reopen-finding <id> --evidence <text>` — reopen a resolved finding with new evidence.
- `phasedev resolve-finding <id> --resolution <text>` — mark a finding resolved with repair evidence (used by repair sub-agents; listed for completeness).
- `phasedev set-verdict <verdict>` — record the validation verdict in validation_findings.md (validates consistency with the current rows; used by validation sub-agents).
- `phasedev feedback` — print the user-feedback processing contract for a sub-agent.
```

- [ ] **Step 2: Переписать «User Feedback Handling»** (заменить всю секцию, включая JS-промпт):

````markdown
## User Feedback Handling

At any STOP point (approval gate, `archive_ready` with `runArchiveStage=false`, blocker, or after user interrupt), the user may give feedback — a correction, a new requirement, a bug report, or a rejection of the current output.

**Fast path (no sub-agent).** When the feedback is a concrete, already-formulated implementation defect ("here is a bug, put it into the findings"), do NOT spawn a sub-agent. Record it yourself with a single deterministic call (same precedent as Auto-Approval — a controller operation without interpretation):

```bash
phasedev add-finding "<defect summary>" MUST-FIX --required-fix "<required fix>" --class implementation
```

The command allocates the ID, creates validation_findings.md when missing, and corrects the verdict (e.g. ready -> repair_required). Then continue the loop — `phasedev advance` routes to finding_repair where the fix is implemented. Never hand-edit the findings registry and never edit repository code to handle feedback.

**Delegated path (feedback needs analysis).** When it is unclear whether the feedback is an implementation defect or a scope/design/plan change, or it is mixed, spawn a dedicated sub-agent:

```javascript
Agent(
  description: "process user feedback on PhaseDev change",
  prompt: `The user has feedback on the current PhaseDev change.

Feedback: <user's full feedback text>

phasedev is a GLOBAL CLI. Invoke it directly as "phasedev <command>".

Run: phasedev feedback — and follow the printed contract exactly. It defines how to classify the feedback, which phasedev commands to use, and the write boundary.
Do NOT run phasedev advance — the orchestrator continues the loop after you finish.
Report: recorded finding IDs, changed artifacts and their approval status, and the result of phasedev check.`
)
```

After the fast path or the sub-agent return, run `phasedev check` and continue the main loop from that state — `phasedev check` will guide the next action (e.g. `finding_repair` if findings were added, approval gate if approvals were reset, iteration work if a phase is active).

The same mechanism applies whether the orchestrator stopped at an approval gate, before archive, or after user interrupt. It also applies when a new session starts and the user says "I have feedback on this change" — the orchestrator runs `phasedev check` to determine the current state, then uses the fast path or the feedback sub-agent instead of the normal phase spawn.

**No special state needed.** The framework's existing flow handles the rest.
````

- [ ] **Step 3: Run** `bun test test/skill-md-drift.test.ts` → PASS (route-kinds не менялись).

- [ ] **Step 4: Commit**

```bash
git add skills/phasedev-orchestrator/SKILL.md
git commit -m "docs: orchestrator feedback handling via add-finding fast path and phasedev feedback contract"
```

---

### Task 10: Лимит repair-циклов — в конфиг (`maxRepairCycles`)

Захардкоженный `MAX_REPAIR_CYCLES = 3` (`advance-flow.ts:382`) выносится в конфиг по образцу `maxIterations`. Это НЕ дубликаты: `maxIterations` ограничивает число итераций плана, `maxRepairCycles` — число последовательных repair-циклов без прогресса; оба лимита сохраняются. Замороженный контракт `state.json` не меняется: `repairCycleCount` и его семантика остаются, конфигурируется только порог.

**Files:**
- Modify: `src/entities/config/config.ts`
- Modify: `src/features/phase-control/advance-flow.ts`
- Modify: `src/features/config-ops/set-config.ts`
- Modify: `skills/phasedev-orchestrator/SKILL.md`
- Test: `test/config.test.ts`, `test/controller.test.ts`

**Interfaces:**
- Produces: `Config.maxRepairCycles: number` (дефолт 3).

- [ ] **Step 1: Падающие тесты**:
  - `test/config.test.ts`: (а) `parseConfig("")` → `maxRepairCycles === 3`; (б) `parseConfig("maxRepairCycles: 5")` → 5; (в) `parseConfig("maxRepairCycles: 0")` и `parseConfig("maxRepairCycles: abc")` → throw «must be a positive integer» (как у `maxIterations`); (г) `setConfigValue(configPath, "maxRepairCycles", "4")` пишет ключ, а `"0"` отклоняется.
  - `test/controller.test.ts`: advance-refuse при пороге 1 — config.yaml с `maxRepairCycles: 1`, `state.json` с `repairCycleCount: 1`, маршрут снова в `finding_repair` → refuse с упоминанием `maxRepairCycles`.

- [ ] **Step 2: Run** `bun test test/config.test.ts test/controller.test.ts` → FAIL.

- [ ] **Step 3: Реализация**

`config.ts`: в `Config` добавить `maxRepairCycles: number`; в `DEFAULT_CONFIG` — `maxRepairCycles: 3`; в `parseConfig` return — `maxRepairCycles: readPositiveInteger(root.maxRepairCycles, DEFAULT_CONFIG.maxRepairCycles, "maxRepairCycles")`.

`advance-flow.ts`: удалить константу, заменить guard (`config` уже доступен — им пользуется maxIterations-guard):

```ts
if (route.kind === "finding_repair" && state.repairCycleCount >= config.maxRepairCycles) {
  return refuse(
    `Repair cycle limit reached (${config.maxRepairCycles}). ` +
    "Review the findings and resolve them manually, or increase maxRepairCycles in config.yaml, then run advance again."
  );
}
```

`set-config.ts`, `validateLeafValue`:

```ts
if (leafKey === "maxIterations" || leafKey === "maxRepairCycles") {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return `Config key \`${leafKey}\` must be a positive integer.`;
  }
}
```

`SKILL.md`: в Initialization добавить блок по образцу `maxIterations`:

```text
phasedev config maxRepairCycles
```
→ Safety limit for consecutive repair cycles without progress. Default to **3** if empty/invalid.

В Termination рядом с «Max iterations» добавить: `- **Repair cycle limit** — advance refuses with "Repair cycle limit reached"; manual intervention or a higher maxRepairCycles in config.yaml is required.`

- [ ] **Step 4: Run** `bun test test/config.test.ts test/controller.test.ts test/skill-md-drift.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/entities/config/config.ts src/features/phase-control/advance-flow.ts src/features/config-ops/set-config.ts skills/phasedev-orchestrator/SKILL.md test/config.test.ts test/controller.test.ts
git commit -m "feat: configurable maxRepairCycles instead of hardcoded repair cycle limit"
```

---

### Task 11: Полная верификация

- [ ] **Step 1:** `bun test` → все тесты PASS (починить оставшиеся фикстуры: 7-колоночные таблицы валидны для парсера, но e2e/CLI-кейсы могут ожидать старые заголовки или старую сигнатуру `resolveFinding`).
- [ ] **Step 2:** `npm run typecheck` → без ошибок.
- [ ] **Step 3:** CLI-smoke на временном проекте:

```bash
phasedev init-project --project-path /tmp/findings-smoke
phasedev create-change --project-path /tmp/findings-smoke demo
phasedev feedback --project-path /tmp/findings-smoke                    # печатает контракт фидбэка
# довести флоу до iteration_validation (или выставить state.json вручную), затем:
phasedev add-finding "Demo finding" MUST-FIX --required-fix "Fix demo" --class implementation --project-path /tmp/findings-smoke
# ожидаем: файл создан сам, "F1 added", verdict: repair_required
phasedev set-verdict ready --project-path /tmp/findings-smoke           # ожидаем отказ: open findings exist
phasedev advance --project-path /tmp/findings-smoke                     # вход в finding_repair -> пишет baseline
phasedev resolve-finding F1 --resolution "fixed in demo.ts; bun test -> pass" --project-path /tmp/findings-smoke
phasedev set-verdict repaired --project-path /tmp/findings-smoke
# вручную удалить строку F1 из таблицы и убедиться, что check/advance блокируют (append-only baseline)
phasedev config set maxRepairCycles 5 --project-path /tmp/findings-smoke && phasedev config maxRepairCycles --project-path /tmp/findings-smoke
```

- [ ] **Step 4:** Commit остаточных правок и итоговый отчёт: что изменено, какие команды прогнаны, фактические результаты (включая падения, если есть).

---

## Self-Review (сверка со спекой)

- **§5.1 парсер** → Task 1 (Resolution, legacy 7 колонок, консистентность, дубль-детект только open/reopened, регресс-тест пустой 8-й ячейки).
- **§5.2 manage-findings** → Task 2 (writeTable, миграция legacy, создание файла с `type`/`date`/консистентным вердиктом, авто-ID «max+1», отказ по дубликату против ЛЮБОЙ строки с подсказкой ID, вставка в начало, автокоррекция вердикта с guard на отсутствующий/плейсхолдерный verdict, resolve/reopen с placeholder-guard'ами).
- **§5.3 CLI** → Task 3 (`resolve-finding --resolution`, `reopen-finding --evidence`, опциональный позиционный ID, авто-`--iteration "Final"` для `final_validation` и `finding_repair` c `type: final`, `set-verdict` с валидацией значения и консистентности + создание файла, `--file` не тронут).
- **§5.4 baseline** → Task 4 (модуль + `findingsBaselinePath`, формат rows, graceful degrade, битый JSON), Task 5 (единственный писатель — advance между `applyStateSideEffects` и `saveFlowState`; очистка в reopen-phase/reset-change/при `archive_ready → archive` перед перемещением), Task 6 (гейты в `checkValidationCompletion` с локальной `paths` и в `validatePhase` для трёх фаз).
- **§5.5 промпт-контракты** → Task 7 (шаблон артефакта CLI-owned, реестровый блок validation_common с `set-verdict` и baseline-гейтом, Write boundary без упоминания контроллер-снапшота, allowlist-строка 6A/6B без write-guard, late-фидбэк в Phase completion, 6R: CLI-only + «inaccurate finding» вместо правки стабильных полей, canonicalFillRules).
- **§5.6 maxRepairCycles** → Task 10 (config, advance-flow, config set, SKILL.md, тест с порогом 1).
- **§5.7 скилл оркестратора** → Task 9 (findings-команды в списке, быстрый путь без делегирования, тривиальный промпт суб-агента через `phasedev feedback`, БЕЗ строки Error Handling про write-guard).
- **§5.8 phasedev feedback** → Task 8 (шаблон `templates/feedback.md`, живой контекст фазы/пути/вердикта/итерации, policy-free, текст фидбэка не передаётся, запрет advance, финальный check + отчёт).
- **§8 отличия от старого плана** — все 7 внесены: (1) write-guard исключён целиком (нет Task 6a, нет `reviewWriteGuardPath`, нет guard-строк в шаблонах/скилле/smoke); (2) guard автокоррекции вердикта + тест; (3) очистка baseline при архивации; (4) точка вставки 418–439 и локальная `paths`; (5) Task 10 maxRepairCycles; (6) полный CLI-ownership (создание файла, set-verdict, запрет ручного frontmatter); (7) Task 8 feedback-команда.
- **Типы согласованы:** `resolution: string` (Task 1) → Task 2/4; `canonicalFindingKey` (Task 1) → Task 2/4; `FindingsCreateContext`/`setFindingsVerdict`/`reopenFinding` (Task 2) → Task 3; `findingsBaselinePath` (Task 4) → Task 5/6; `getFeedbackPrompt` (Task 8) → cli.
- **Замороженные контракты** (`approved`/`verdict`/`type`, множество вердиктов, `ready_with_risks`, заголовки итераций, `state.json`, направление зависимостей, отсутствие новых корневых скриптов) не изменяются; автокоррекция вердикта лишь автоматизирует переход, который агент обязан выполнять вручную по правилам консистентности парсера.
