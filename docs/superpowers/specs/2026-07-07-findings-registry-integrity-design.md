# Спецификация: целостность реестра validation_findings.md

Дата: 2026-07-07
Статус: проект (на ревью)
Связанный план: `temp/plan/2026-07-07-findings-registry-integrity.md` (требует актуализации по этой спеке — см. «Отличия от плана»)

## 1. Проблема

Правила ведения реестра замечаний `validation_findings.md` (append-only, дедупликация, перепроверка исправленного) существуют только как текст промптов и программно не контролируются. Наблюдаемые последствия:

1. **Валидатор удаляет историю.** Artifact Build Contract встраивает пустой шаблон и требует «Fill that template» — агент пересоздаёт файл из пустого шаблона и стирает существующие строки. Формулировка `validation_common.md` («history is deleted only if there are no existing rows to preserve») дополнительно провоцирует перезапись.
2. **Дублирование замечаний.** Парсер ловит только дубликаты ID; семантическая дедупликация — только промпт-правило. Валидатор не видит доказательств исправления (нет колонки с evidence) и повторно заводит ту же проблему под новым ID.
3. **Зацикливание repair-циклов.** `repairCycleCount` (лимит 3) ограничивает число циклов advance, но не содержательный цикл «исправлено → снова открыто под новым ID»: нет следа «что именно сделал исправитель».
4. **Resolved-строки не перепроверяются.** Обязанности проверить, что `resolved` действительно исправлено в коде, нет.
5. **Late-фидбэк пользователя не имеет канонического пути.** Реальный инцидент: после записанного вердикта финальной валидации пользователь нашёл ошибку; оркестратор делегировал запись замечания суб-агенту, а тот начал править production-код (сработала общая TDD-привычка). Причины: (а) для окна «после вердикта, до `advance`» нет процедуры; (б) ручное добавление open MUST-FIX строки в файл с `verdict: ready` делает артефакт противоречивым (парсер отвергает) — «просто дописать строку» без атомарной команды невозможно; (в) фазовые промпты 6A/6B не содержат жёсткого запрета правок вне artifact allowlist и не требуют наследования границы записи при делегировании.

## 2. Цели

- Программно (гейтами `check-validation` / `advance`, а не только промптами) запретить удаление и переписывание строк реестра.
- Дать исправителю обязательный след (evidence) в новой колонке `Resolution`; обязать валидатора перепроверять `resolved`-строки по этому следу.
- Сделать CLI единственным путём мутации артефакта целиком — создание файла, строки, вердикт: три команды на три легальных перехода строки (появилась → исправлена → переоткрыта) плюс `set-verdict` для итога фазы, с автоматической выдачей ID, дедупликацией и консистентностью вердикта. Ручная правка файла агентом запрещена полностью.
- Дать late-фидбэку пользователя канонический путь: один вызов `phasedev add-finding` без делегирования, с автокоррекцией вердикта и штатным маршрутом в `finding_repair`.
- Ужесточить промпт-контракты review-only фаз: запрет пересоздания файла из шаблона, запрет правок репозитория, обязательное наследование границы записи при делегировании.

## 3. Не-цели

- **Программный write-guard для review-фаз не строится.** Интеграция фреймворка с git на текущий момент не рабочая опора; запрет правок кода в validation-фазах остаётся на уровне промпт-контрактов (слой 4). Решение пользователя от 2026-07-07.
- Семантическая (смысловая) дедупликация замечаний сверх канонического текстового ключа — остаётся промпт-правилом.
- Изменение замороженных контрактов (см. §9).

## 4. Архитектура: три слоя защиты

| Слой | Механизм | Кто пишет | Кто проверяет |
|---|---|---|---|
| 1. Колонка `Resolution` | 8-я колонка таблицы: evidence исправления | агент-исправитель через CLI | парсер (консистентность Status↔Resolution), валидатор (перепроверка resolved) |
| 2. CLI-only мутации | `add-finding` / `resolve-finding` / `reopen-finding` / `set-verdict`; команды создают файл при отсутствии | агенты всех фаз | сами команды (дедуп, ID, консистентность вердикта, экранирование) |
| 3. Baseline-гейт | снапшот таблицы `.findings-baseline.json`, diff при проверках | `advance` при входе в validation/repair фазы | `check-validation`, `validatePhase`/`validatePhaseExit` (блокирует `advance`) |

Четвёртый, несущий, но не программный слой — ужесточённые промпт-контракты (шаблоны, `validation_common.md`, фазы 6A/6B/6R, скилл оркестратора).

## 5. Детальный дизайн

### 5.1 Парсер: колонка `Resolution`, консистентность, дубль-детект

`src/entities/validation-findings/parse-validation-findings.ts`:

- Заголовок таблицы: строгий набор — 8 колонок (`ID | Status | Severity | Class | Iteration | Finding | Required Fix | Resolution`); legacy — прежние 7 колонок принимаются (Resolution = `""`), Resolution-проверки к ним не применяются.
- `ValidationFindingRow` и `ValidationFindingState` получают поле `resolution: string`.
- Экспортируется `canonicalFindingKey(finding: string): string` — strip префикса `Reopened / regression:`, lowercase, collapse whitespace, trim. Единый ключ дедупликации для парсера, `manage-findings` и baseline-diff.
- Правила консистентности (только для 8-колоночных таблиц):
  - `resolved` → Resolution обязательна и не-placeholder (`TBD|TODO|n/a|none|-`);
  - `open` → Resolution обязательно пустая;
  - `reopened` → без ограничений (прежний Resolution — история).
- Дубль-детект по каноническому тексту — **только среди `open`/`reopened` строк** (блокирующий issue). Блокировка дублей среди `resolved` создала бы deadlock на исторических таблицах: удалять строки запрещает baseline. Дубли против `resolved` ловит только `addFinding` (уровень команды).
- Подтверждено по коду: пустая последняя ячейка (`| ... | fix |  |`) выживает в `splitMarkdownTableRow` (снимается ровно одна пустышка от завершающего пайпа); поколоночные empty-проверки парсера новую колонку не затрагивают. Регресс-тест обязателен.

### 5.2 manage-findings: evidence, дедуп, reopen, авто-ID, вердикт, миграция

`src/features/artifact-ops/manage-findings.ts`:

- Таблица пишется в 8 колонок единым приватным хелпером `writeTable` (устраняет дублирование построения таблицы).
- **Миграция legacy**: при первой мутации 7-колоночная таблица переписывается в 8 колонок; у legacy `resolved`-строк пустой Resolution заполняется текстом `legacy: resolved before Resolution column`; open/reopened остаются пустыми.
- `addFinding(filePath, id | null, ...)`:
  - **создаёт файл, если его нет**: шапка таблицы из шаблона, frontmatter с `type` (из `activePhase`: `iteration_validation` → `iteration`, `final_validation`/`finding_repair` после финала → `final`), `date` — текущая, `verdict` — консистентный с добавляемой строкой (MUST-FIX → `repair_required`, иначе `ready_with_risks`). Агент файл из шаблона больше не инстанцирует никогда;
  - при `id: null` команда сама выделяет следующий свободный `F<number>` (max существующих + 1); фактический ID всегда возвращается в `message`;
  - отказ при совпадении канонического текста с ЛЮБОЙ существующей строкой (включая `resolved`) — с подсказкой существующего ID;
  - новая строка вставляется **в начало** тела таблицы (соответствие действующему контракту артефакта «new rows at the top»; текущий код вставляет в конец — меняется сознательно);
  - **автокоррекция вердикта**: open `MUST-FIX` при `verdict ∈ {ready, ready_with_risks, repaired}` → `repair_required`; не-blocking при `verdict: ready` → `ready_with_risks`; иначе вердикт не трогается. Guard: если строки `verdict:` во frontmatter нет или её значение вне множества `{ready, ready_with_risks, repaired, repair_required}` (например, плейсхолдер шаблона до записи вердикта валидатором) — коррекция молча пропускается. Смена вердикта отражается в `message` результата. Остальные ключи frontmatter (`type`, `date`) не трогаются.
- `resolveFinding(filePath, id, resolution)`: переход только из `open`/`reopened`; resolution обязательна и не-placeholder; `status = resolved`.
- `reopenFinding(filePath, id, evidence)` (новая): переход только из `resolved`; evidence обязательна и не-placeholder; `status = reopened`; Resolution дополняется `; reopened: <evidence>` (текст Finding не меняется — ключ дедупликации стабилен). Применяет ту же автокоррекцию вердикта (reopened-строка — открытая).

### 5.3 CLI

`src/cli.ts`, `src/features/cli-help/render-help.ts`:

- `resolve-finding <id> --resolution <text> [--file <path>]` — `--resolution` обязательна.
- `reopen-finding <id> --evidence <text> [--file <path>]` — новая команда.
- `add-finding [F<number>] <title> <severity> --required-fix <text> [--class] [--iteration] [--file]` — позиционный ID опционален: если `args[1]` соответствует `/^F\d+$/i`, это ID (обратная совместимость), иначе — title. Коллизия форм исключена практикой (заголовок-«F12» бессодержателен); отражено в help.
- Авто-`--iteration`: текущий фолбэк (`Iteration N` из `state.activeIteration`) падает при `null` — то есть ровно в окне late-фидбэка после финальной валидации. Дополняется: если `--iteration` не задан и `state.activePhase` — `final_validation` (или `finding_repair` при `type: final` в findings), подставляется `"Final"`.
- **`set-verdict <verdict> [--file <path>]`** — новая команда: валидатор фиксирует итог фазы командой, а не ручной правкой YAML. Команда валидирует значение против замороженного множества `{ready, ready_with_risks, repair_required, repaired}` и консистентность с текущими строками (та же логика, что в парсере: `ready` при открытых строках — отказ, `repair_required` без открытых MUST-FIX — отказ и т.д.) — противоречивый вердикт отбивается в момент записи, а не постфактум. Если файла нет (валидация без замечаний) — создаёт его: шапка таблицы + frontmatter (`type` из `activePhase`, `date`, указанный `verdict`). Ключ `date` команда обновляет сама.
- `--file` не меняется: дефолтная резолюция до `validation_findings.md` активного change уже реализована (`resolveFindingsPath`).

Вместе с созданием файла в `add-finding` это делает артефакт **полностью CLI-owned**: единое правило без исключений — `validation_findings.md` мутируется только командами `phasedev` (создание, строки, вердикт); ручная правка любой его части агентом запрещена промпт-контрактами.

### 5.4 Baseline: снапшот и diff реестра

- Новый модуль `src/entities/validation-findings/findings-baseline.ts`; путь `findingsBaselinePath` (= `<changeDir>/.findings-baseline.json`) добавляется в `ChangePaths`.
- Формат: `{ rows: [{id, status, severity, className, iteration, finding, requiredFix}] }` (маппинг: поле `phase` из `ValidationFindingRow` пишется как `iteration`).
- **Единственный писатель — `advance`** при входе в `iteration_validation`, `final_validation`, `finding_repair` (точка вставки: после `applyStateSideEffects`, перед `saveFlowState`, где известен `nextState.activePhase`). Пустая таблица/отсутствующий файл → `rows: []`.
- `checkFindingsAgainstBaseline(findingsPath, baselinePath): string[]` — правила (каждое нарушение = блокирующий issue):
  - каждый ID из baseline существует в текущей таблице (удаление запрещено);
  - стабильные поля (Severity, Class, Iteration, Finding по каноническому ключу, Required Fix) не изменены (сравнение после trim/collapse whitespace);
  - переход `resolved → open` запрещён (только `resolved → reopened`).
- Graceful degrade: baseline отсутствует → diff молча пропускается (ручные запуски вне flow); baseline нечитаем (битый JSON) → одиночный issue с инструкцией удалить/восстановить.
- Recovery в тексте issue: восстановить строку; если реестр правился пользователем намеренно вне flow — удалить `.findings-baseline.json` и перезапустить.
- Подключение гейтов: `checkValidationCompletion` (после структурных проверок, при `paths && findings?.exists`; `paths` там — локальная переменная из `pathsForValidation`, не параметр) и `validatePhase` в кейсах `iteration_validation`, `final_validation`, `finding_repair` — через `validatePhaseExit` это автоматически блокирует `advance`.
- Очистка: `reopen-phase` и `reset-change` удаляют `.findings-baseline.json` (`fs.rmSync(..., { force: true })`) — иначе ручной откат фазы сравнивал бы таблицу с устаревшим снапшотом. При переходе `archive_ready → archive` файл удаляется перед перемещением папки change (служебный файл в архив не едет).

### 5.5 Промпт-контракты (шаблоны)

Изменения по смыслу — «intentional wording updates», замороженные YAML-ключи/вердикты не трогаются.

- `templates/artifacts/validation_findings.md`: 8-колоночный заголовок; контракт значений Resolution; append-only; «edit in place, never recreate from this template»; сверка нового замечания со ВСЕМИ строками; мутация файла только через CLI (`add-finding` / `resolve-finding` / `reopen-finding` / `set-verdict`); ручная правка любой части файла запрещена, включая frontmatter.
- `templates/validation_common.md`: реестровый блок заменяется — обязательная перепроверка КАЖДОЙ `resolved`-строки по её Resolution-evidence против фактического состояния репозитория (реальный фикс → строку не трогать; дефект жив → `reopen-finding` с новым evidence, никогда не новый ID); append-only с упоминанием baseline-гейта («controller compares the table against a baseline snapshot and blocks the phase if history was lost»); файл создаётся и мутируется ТОЛЬКО командами CLI (первый `add-finding` или `set-verdict` создают его сами — агент никогда не пишет файл руками, в том числе из шаблона); вердикт фиксируется `set-verdict`; авто-ID; запрет reopen без новых доказательств.
- `templates/validation_common.md`, блок **Write boundary (hard rule)** после `{{validation_execution_rule}}`: review-only фаза не создаёт/не меняет/не удаляет НИ ОДНОГО файла вне artifact allowlist (включая «очевидные однострочные фиксы» и временные правки с откатом); каждый дефект — только строка findings, фикс — только в `finding_repair`; замечание пользователя — только `phasedev add-finding`; при ЛЮБОМ делегировании промпт суб-агента обязан начинаться с фиксированной read-only формулировки («Read-only analysis. You MUST NOT create, modify, or delete any repository file…»); граница действует и ПОСЛЕ записи вердикта, до `phasedev advance`. Упоминаний программного контроллер-снапшота в тексте НЕТ (write-guard не строится).
- `templates/phase6a_iteration_validation.md`, `phase6b_final_validation.md`: в `## Artifact allowlist` — завершающая строка «Any file not listed above is read-only for this phase»; в `Phase completion:` — процедура late-фидбэка: не править код, не делегировать код-задачу, записать `phasedev add-finding` (команда сама скорректирует вердикт), затем `phasedev advance` → `finding_repair`.
- `templates/phase6r_finding_repair.md`: резолв только через `phasedev resolve-finding` с evidence (файлы + проверка «command -> result»); мутации строк только через CLI; запрет стирать чужой Resolution. Правило «do not change stable fields … unless needed to fix an explicit error» УДАЛЯЕТСЯ (конфликтует с baseline-гейтом) и заменяется на: стабильные поля неизменяемы; фактически ошибочная строка закрывается `resolve-finding` с resolution `inaccurate finding: <why>` + добавляется корректная строка через `add-finding`.
- `get-phase-prompt.ts` (`validationFindingsContract`) и `prompt-render-helpers.ts` (`finalValidationArtifactContract`): `canonicalFillRules` — «edit in place, never recreate; template defines structure for a missing file only» + «registry is append-only; the controller diffs it against a baseline snapshot».

### 5.6 Лимит repair-циклов — в конфиг (`maxRepairCycles`)

Захардкоженная константа `MAX_REPAIR_CYCLES = 3` (`advance-flow.ts:382`) выносится в конфиг по образцу существующего `maxIterations`. Это НЕ дубликаты: `maxIterations` ограничивает число итераций плана (route `iteration`, `advance-flow.ts:410`), `maxRepairCycles` — число последовательных repair-циклов без прогресса; оба лимита сохраняются.

- `src/entities/config/config.ts`: поле `maxRepairCycles: number` в `PhasedevConfig`, дефолт `3` в `DEFAULT_CONFIG`, парсинг root-ключа через `readPositiveInteger` (как у `maxIterations`).
- `src/features/phase-control/advance-flow.ts`: константа заменяется на `config.maxRepairCycles` (`config` уже доступен в этой функции — им пользуется maxIterations-guard). Текст отказа обновляется: «Repair cycle limit reached (N). … Increase maxRepairCycles in config.yaml or intervene manually.»
- `src/features/config-ops/set-config.ts`: разрешить `phasedev config set maxRepairCycles <n>` (по образцу ветки `maxIterations`).
- `skills/phasedev-orchestrator/SKILL.md`: `phasedev config maxRepairCycles` в примерах config-команд; в перечне стоп-условий рядом с «Max iterations» — «Repair cycle limit».
- Замороженный контракт `state.json` не меняется: поле `repairCycleCount` и его семантика остаются; конфигурируется только порог.

### 5.7 Скилл оркестратора

`skills/phasedev-orchestrator/SKILL.md` — секция User Feedback Handling является прямым источником инцидента (велит руками «add findings … set verdict to repair_required»):

- В «Core orchestrator commands» добавляются `add-finding` (с автокоррекцией вердикта; единственный путь добавления замечания), `reopen-finding`, `resolve-finding`, `set-verdict`.
- User Feedback Handling переписывается: **быстрый путь без делегирования** — конкретный, уже сформулированный пользователем дефект оркестратор записывает сам одним вызовом `add-finding` (по прецеденту Auto-Approval: controller-операция без интерпретации); суб-агент остаётся только для фидбэка, требующего анализа (дефект vs scope; смешанный), и его промпт становится тривиальным: текст фидбэка + «Run `phasedev feedback` and follow the printed contract». Вся содержательная инструкция уходит из SKILL.md в контракт команды `phasedev feedback` (§5.8) — захардкоженный JS-шаблон промпта из скилла удаляется.
- Строка Error Handling про write-guard из плана НЕ добавляется (write-guard не строится).

### 5.8 Команда `phasedev feedback` — контракт обработки пользовательского фидбэка

Сейчас контракт обработки фидбэка — единственная агентская инструкция, живущая вне фреймворка (захардкожена в `SKILL.md:180-200`): она не покрыта дрифт-тестами, не проходит canonical-правила шаблонов и молча устарела (велит руками «add findings … set verdict to repair_required», не зная про CLI-команды). Это и есть источник инцидента «фидбэк-агент правит код». Контракт переводится на штатный механизм фреймворка — «команда печатает контракт для агента», как `phasedev phase`:

- Новая команда `phasedev feedback [--project-path <path>]`: печатает контракт обработки фидбэка из нового шаблона `templates/feedback.md` тем же механизмом рендеринга, что фазовые промпты.
- Содержание контракта: классификация фидбэка — implementation-дефект → только CLI-команды findings (`add-finding` / `reopen-finding`); scope/design/plan → правка flow-артефактов + `approved: false` на изменённых (НЕ в findings); смешанный → оба пути; read-only граница записи для репозитория вне `.phasedev/**`; запрет `phasedev advance`; финальный `phasedev check` и отчёт (ID замечаний, артефакты, статусы approve).
- Команда знает состояние flow и подставляет живой контекст, которого нет у SKILL.md: активную фазу, путь к `validation_findings.md`, текущий вердикт, активную итерацию.
- Контракт feedback — controller-инструкция того же рода, что approval/blocker-промпты: **без** phase-specific skill policy (замороженное правило «Approval/blocker prompts stay policy-free» распространяется и на него).
- Текст фидбэка команде не передаётся — его суб-агенту передаёт оркестратор в делегирующем промпте; команда печатает только процедуру.

## 6. Тестирование

TDD по каждой задаче (падающий тест → реализация → PASS), затем полный `bun test` + `npm run typecheck` + CLI-smoke.

- Парсер: 8-колоночная таблица с resolution; legacy 7-колоночная без Resolution-issues; resolved без evidence → issue; open с непустым Resolution → issue; дубль текста среди open/reopened → issue; дубль open против resolved → НЕ issue; выживание пустой 8-й ячейки.
- manage-findings: 8-колоночная запись; отказ по семантическому дубликату с подсказкой ID; resolve с placeholder → отказ; reopen resolved с накоплением evidence; reopen open → отказ; миграция legacy; автокоррекция вердикта (ready→repair_required на MUST-FIX; ready→ready_with_risks на NIT; repair_required не трогается; отсутствующий/плейсхолдерный verdict — пропуск без изменений); сохранение `type`/`date`; авто-ID с дырой в нумерации (F1,F3 → F4).
- CLI: `resolve-finding` без `--resolution` → отказ с Usage; `reopen-finding` без `--evidence` → отказ; авто-ID форма `add-finding`; авто-`--iteration "Final"` в `final_validation`; `add-finding` при отсутствующем файле создаёт его (шапка, `type` из фазы, консистентный вердикт); `set-verdict ready` при открытых строках → отказ; `set-verdict repair_required` без открытых MUST-FIX → отказ; `set-verdict` при отсутствующем файле создаёт файл с пустой таблицей; невалидное значение вердикта → отказ.
- Baseline: снапшот (пустой при отсутствии файла); легальные переходы без issues; удалённая строка → issue с ID; изменённое стабильное поле → issue; `resolved → open` → issue; отсутствующий baseline → нет issues; толерантность к добавлению префикса reopened в Finding.
- Advance/гейты: advance в validation/repair фазы создаёт/обновляет `.findings-baseline.json`; удаление строки после baseline → `checkValidationCompletion` ok:false и refuse `advance`; без baseline — прежнее поведение; `reopen-phase`/`reset-change` удаляют baseline; `.findings-baseline.json` не попадает в changed-file inventory (лежит под `.phasedev/**`).
- Шаблоны/скилл: `test/template-validator-drift.test.ts`, `test/e2e-flow.test.ts` (обновление фикстур на 8 колонок), `test/skill-md-drift.test.ts` (route-kinds не меняются — остаётся зелёным).
- `maxRepairCycles`: дефолт 3 без ключа в config.yaml; override из config.yaml применяется; `phasedev config set maxRepairCycles` работает; отказ `advance` использует настроенный порог (тест с порогом 1).
- `phasedev feedback`: печатает контракт из `templates/feedback.md`; контракт содержит CLI-команды findings, границу записи и запрет `advance`; подставлен живой контекст (активная фаза, путь findings, вердикт); без skill policy.

## 7. Принятые остаточные риски

- **Правки кода в review-фазах программно не детектируются** (write-guard исключён решением пользователя): защита — только промпт-контракты §5.5/§5.7/§5.8 (граница записи, обязательное наследование при делегировании, canonical-путь late-фидбэка). При появлении рабочей git-интеграции слой можно добавить отдельным изменением.
- **Findings-команды не под state-lock** (в отличие от `approve`): read-modify-write гонка при одновременных мутациях таблицы двумя процессами возможна; `writeFileAtomic` спасает от порванного файла, но не от потерянного апдейта. Существующее поведение, риск низкий (мутации последовательны по природе flow).
- **Лимит repair-циклов (`maxRepairCycles`, дефолт 3)** распространяется и на циклы late-фидбэка: три раунда «фидбэк → repair → validation» без прогресса → отказ advance с требованием ручного вмешательства — желаемый стоп, не баг; порог настраивается в config.yaml.
- **Текстовый (не смысловой) ключ дедупликации**: `canonicalFindingKey` ловит только совпадение после нормализации; перефразированный дубль остаётся на совести промпт-правила «compare by meaning with EVERY existing row».

## 8. Отличия от плана `temp/plan/2026-07-07-findings-registry-integrity.md`

План требует актуализации перед исполнением:

1. **Task 6a (write-guard) исключается целиком** — вместе с `reviewWriteGuardPath`, экспортом `parseGitStatusLine`, правками `check-flow`/`phase-validators` в части guard-diff, тестами `test/write-guard.test.ts` и упоминаниями guard в Task 7 (Step 2a: убрать фразу «controller snapshots the worktree…», Step 2b: убрать «edits … are detected by the controller write-guard»), Task 7b Step 3 (строка Error Handling) и в Task 8 (smoke-шаг про write-guard).
2. **Автокоррекция вердикта получает guard** (§5.2): отсутствующая/невалидная строка `verdict:` → пропуск коррекции. В Task 2 добавляется соответствующий тест.
3. **Очистка `.findings-baseline.json` при архивации** (§5.4): удаление перед перемещением папки change (в плане при архиве удалялся только guard-файл).
4. Точка вставки в `advance-flow.ts` — строки 418–439 (между `applyStateSideEffects` и `saveFlowState`); `paths` в `checkValidationCompletion` — локальная переменная, не параметр.
5. **Новая задача: `maxRepairCycles` в конфиг** (§5.6) — в плане лимит repair-циклов не затрагивался; добавлена задача Task 7c.
6. **Полный CLI-ownership артефакта** (§5.2, §5.3): `add-finding` создаёт файл при отсутствии; новая команда `set-verdict` с проверкой консистентности; из промпт-контрактов убираются «инстанцируй из шаблона, если файла нет» и разрешение ручной правки frontmatter (в плане они сохранялись). Соответствующие правки нужны в Task 2, 3, 7, 7b плана; риск «ручная правка frontmatter» из плана снимается.
7. **Новая задача: команда `phasedev feedback`** (§5.8) — контракт обработки фидбэка переезжает из захардкоженного промпта в `SKILL.md` в шаблон `templates/feedback.md` + команду CLI; Task 7b упрощается — вместо переписывания JS-шаблона промпта в скилле остаётся быстрый путь `add-finding` и делегирование через «Run `phasedev feedback` and follow the printed contract».

## 9. Замороженные контракты (не меняются)

YAML-ключи `approved`, `verdict`, `type` и множество значений вердиктов; семантика `ready_with_risks`; формат заголовка итерации `## Iteration N: Name [x|~| |/]`; `state.json = { activePhase, activeIteration, repairCycleCount }`; направление зависимостей entrypoints → features → entities/shared; никаких новых скриптов в корне `src/`. Автокоррекция вердикта не меняет контракт: автоматизируется только переход значения, который агент и так обязан выполнять вручную по правилам консистентности парсера.
