# Config Restructure & Runner Separation — Design Specification

> **spec_id:** 2026-07-01-config-runner-separation-1030
> **topic:** Config Restructure and Runner Separation
> **status:** Approved
> **created_at:** 2026-07-01T10:30:00Z
> **reviewed_at:** 2026-07-01T10:45:00Z
> **approved_at:** 2026-07-01T10:55:00Z
> **approval_mode:** interactive
> **adversarial_review:** warnings (fixed)
> **author:** zuvo:brainstorm

## Design Constraints (source: `temp/PRD-config-runner-separation.md`)

- **DC-1** [config-structure] `config.yaml` top-level ключ `codex:` (обёртка) → **удалён**. Файл и так в PhaseDev проекте.
- **DC-2** [config-structure] `codex.stages:` → **`phases:`**
- **DC-3** [stage-names] Старые названия этапов → новые: `setup→change_intake`, `research→code_research`, `design→technical_design`, `plan→iteration_planning`, `phase_validation→iteration_validation`, `repair→finding_repair`. Составные имена: `setup_approval→change_intake_approval`, `invalid_research→invalid_code_research`, `invalid_design→invalid_technical_design`, `invalid_plan→invalid_iteration_planning`, `plan_approval→iteration_planning_approval`.
- **DC-4** [runner-separation] Все Codex SDK поля (`model`, `reasoningEffort`, `sandboxMode`, `approvalPolicy`, `networkAccessEnabled`, `streamAgentOutput`) → **`runner.yaml`**
- **DC-5** [runner-separation] `codex.default` → **удалён**, перенесён в `runner.yaml`
- **DC-6** [runner-separation] Блок `loop: { ... }` (с `maxIterations`, `logDir`, `enableLogs`) → **`runner.yaml`**
- **DC-7** [new-fields] `runArchiveStage: true` — новое поле в корне `config.yaml`
- **DC-8** [new-fields] `autoApprove: false` — новое поле в корне `config.yaml`
- **DC-9** [runner-separation] Watchdog + notification конфиги → **`runner.yaml`**
- **DC-10** [code-changes] `entities/config/config.ts` — удалить runner-поля, добавить `phases`/`runArchiveStage`/`autoApprove`
- **DC-11** [code-changes] `features/runner/config.ts` — собственные `RunnerConfig` типы + парсер `runner.yaml`
- **DC-12** [code-changes] `runner.ts` — загрузка обоих конфигов по отдельности
- **DC-13** [code-changes] `run-flow-ralph.ts` — принимать `Config` + `RunnerConfig` раздельно
- **DC-14** [orchestrator] `SKILL.md` — переименовать все названия этапов (см. DC-3 mapping table)
- **DC-15** [non-goals] Без изменений логики раннера, `flow-route.ts`, `entities/` (кроме `config.ts`), без удаления кода раннера, без изменения содержимого skills в example config
- **DC-16** [non-goals] `parseRunnerConfig` — новая функция в runner feature
- **DC-17** [implementation-order] Phase 1: Config types + parsing → Phase 2: Runner config loading → Phase 3: CLI + flow → Phase 4: SKILL.md → Phase 5: Tests
- **DC-18** [typescript] Внутренний `Config` интерфейс переименовывает `codex.stages` в `phases` — никаких ECC-era названий в рантайме
- **DC-19** [edge-cases] Отсутствующий `runner.yaml` обрабатывается graceful fallback (легаси режим)
- **DC-20** [edge-cases] CLI `phasedev config` принимает старые ключи с deprecation предупреждением
- **DC-21** [runner-allowlist] `.phasedev/runner.yaml` добавляется в `isIgnoredFlowSnapshotPath`
- **DC-22** [migration] При обнаружении старого формата `codex.stages` — парсинг с deprecation warning и отображением в новый runtime объект

## Problem Statement

После ребрендинга в PhaseDev AI Framework `config.yaml` всё ещё содержит старые названия из ECC/Codex эры. Конфиг объединяет настройки ядра (этапы/фазы, навыки) и настройки раннера (Codex SDK, цикл, watchdog, уведомления) в одном файле. Это приводит к трём проблемам:

1. **Запутанность:** Пользователь видит `codex.stages.setup` и не понимает, что это `change_intake` в терминах фреймворка.
2. **Избыточная вложенность:** Лишний уровень `codex:` обёртки.
3. **Сцепление:** Runner глубоко интегрирован в ядро через импорты. Удаление или замена раннера в будущем требует изменений в ядре.

**Кто затронут:** Все пользователи PhaseDev, разработчики, CI/CD пайплайны.
**Что будет, если ничего не делать:** С каждым новым релизом расхождение между TS-типами (уже используют новые названия) и `config.yaml` будет расти, путая пользователей и блокируя валидацию.

## Design Decisions

| # | Решение | Обоснование |
|---|---------|-------------|
| DD-1 | TypeScript `Config` интерфейс: `phases:` вместо `codex.stages` | Полная консистентность именования — никаких ECC-наследов в рантайме (per DC-18) |
| DD-2 | Runner-поля выделены в `RunnerConfig` интерфейс в `features/runner/config.ts` | Чистое разделение ответственности; раннер имеет собственные типы (per DC-11) |
| DD-3 | `loadConfig()` загружает оба файла и возвращает `Config` | Единая точка входа для всех потребителей (per DC-12) |
| DD-4 | `runArchiveStage` и `autoApprove` — поля верхнего уровня в `Config` | Это поведенческие флаги flow-контроллера, не раннера (per DC-7, DC-8) |
| DD-5 | Общие типы (`SandboxMode`, `ApprovalPolicy`, `ReasoningEffort`) остаются в `entities/config` | Избегаем дублирования; runner импортирует их оттуда |
| DD-6 | Старые CLI ключи (`codex.stages.*`) принимаются с deprecation hint | Обратная совместимость для скриптов и CI (per DC-20) |
| DD-7 | `.phasedev/runner.yaml` в allowlist снапшотов | Защита от ложного учёта изменений конфига как прогресса (per DC-21) |

## Solution Overview

Конфигурация разбивается на два файла:

```
project-root/
  .phasedev/
    config.yaml     # этапы + навыки + runArchiveStage + autoApprove
    runner.yaml     # настройки Codex SDK + цикл + watchdog + уведомления
```

- `entities/config/config.ts` — только `Config` интерфейс (с `phases:`, `runArchiveStage`, `autoApprove`) + парсинг `config.yaml`
- `features/runner/config.ts` — `RunnerConfig` интерфейс + `parseRunnerConfig()` + re-экспорт Config типов
- `runner.ts` — загружает оба файла, запускает `runRunner(config, runnerConfig)`
- `cli.ts` — `phasedev config` читает только `config.yaml`
- Flow-контроллер (`stage-control/`) работает только с `Config`

### Внутренние интерфейсы

```typescript
// entities/config/config.ts
export interface Config {
  phases: Partial<Record<Exclude<Stage, "init">, StageConfig>>;
  runArchiveStage: boolean;
  autoApprove: boolean;
}

// features/runner/config.ts
export interface RunnerConfig {
  runner: {
    model: string;
    reasoningEffort: ReasoningEffort;
    sandboxMode: SandboxMode;
    approvalPolicy: ApprovalPolicy;
    networkAccessEnabled: boolean;
    streamAgentOutput: boolean;
    maxIterations: number;
    logDir: string;
    enableLogs: boolean;
    watchdog: WatchdogConfig;
    notifications: NotificationConfig;
  };
}
```

## Detailed Design

### Data Model

#### `Config` (core framework)

```typescript
// entities/config/config.ts

export interface Config {
  phases: Partial<Record<Exclude<Stage, "init">, StageConfig>>;
  runArchiveStage: boolean;
  autoApprove: boolean;
}

export interface StageConfig {
  skills: {
    routers: string[];
    main: string[];
    additional: string[];
  };
}
```

**Изменения от текущего:**
- `codex: { default, stages, sandboxMode, ... }` → удалён
- `loop: { maxIterations, logDir, ... }` → удалён
- `phases:` на верхнем уровне (заменяет `codex.stages:`)
- `runArchiveStage` и `autoApprove` — поля верхнего уровня (были в `loop.*`)

#### `RunnerConfig` (runner)

```typescript
// features/runner/config.ts

export interface RunnerConfig {
  runner: {
    model: string;
    reasoningEffort: ReasoningEffort;
    sandboxMode: SandboxMode;
    approvalPolicy: ApprovalPolicy;
    networkAccessEnabled: boolean;
    streamAgentOutput: boolean;
    maxIterations: number;
    logDir: string;
    enableLogs: boolean;
    watchdog: WatchdogConfig;
    notifications: NotificationConfig;
  };
}

export interface WatchdogConfig {
  enabled: boolean;
  turnTimeoutMs: number;
  inactivityTimeoutMs: number;
  statusIntervalMs: number;
  abortGraceMs: number;
}

export interface NotificationConfig {
  telegram: TelegramNotificationConfig;
}

export interface TelegramNotificationConfig {
  enabled: boolean;
  botTokenEnv: string;
  chatIdEnv: string;
}
```

#### Общие типы (остаются в `entities/config/config.ts`)

```typescript
export type ReasoningEffort = "low" | "medium" | "high" | "xhigh" | "max";
export type SandboxMode = "workspace-write" | "workspace-read" | "no-sandbox" | "private";
export type ApprovalPolicy = "never" | "always" | "on-mutation" | "diff-trace";
```

#### `STAGES` set

```typescript
const STAGES = new Set<Exclude<Stage, "init">>([
  "change_intake",
  "code_research",
  "technical_design",
  "iteration_planning",
  "implementation",
  "iteration_validation",
  "final_validation",
  "finding_repair",
  "archive",
]);
```

*(Без изменений — уже использует новые названия. `final_validation` — реальный этап фреймворка, присутствует в `Stage` union и `flow-route.ts`, не подлежит переименованию.)*

### API Surface

#### `parseConfig(raw: any): Config`

- Парсит `phases` вместо `codex.stages`
- Не парсит `model`, `reasoningEffort`, `default`, `loop.*`, `sandboxMode*`
- Парсит `runArchiveStage` и `autoApprove` из корня
- **Миграция:** если найден `codex.stages` — парсит как legacy с deprecation warning, маппит старые названия этапов на новые

#### `parseRunnerConfig(raw: any): RunnerConfig`

- Новая функция в `features/runner/config.ts`
- Парсит `runner.yaml`
- Валидирует все поля

#### `loadConfig(configDir: string): { config: Config; runnerConfig: RunnerConfig }`

- Загружает `config.yaml` и `runner.yaml` из указанной директории
- Если `runner.yaml` **существует** — все runner-поля берутся из него. Пропущенные поля используют жёсткие дефолты из `DEFAULT_RUNNER_CONFIG`. Runner-поля из `config.yaml` **не читаются** (IC-6).
- Если `runner.yaml` **отсутствует** — пытается извлечь runner-поля из `config.yaml` (legacy режим с deprecation warning). Legacy field mapping см. ниже.
- Возвращает два объекта

#### Legacy Field Migration Table (старый `config.yaml` → новый `RunnerConfig`)

При обнаружении старого формата (наличие ключа `codex:`), `loadConfig` маппит поля по следующей таблице:

| Старый путь в `config.yaml` | Новое поле в `RunnerConfig` | Примечание |
|------------------------------|-----------------------------|------------|
| `codex.default.model` | `runner.model` | Глобальная модель по умолчанию |
| `codex.default.reasoningEffort` | `runner.reasoningEffort` | Per-stage model/effort overrides **игнорируются**; используется только `codex.default.*` |
| `codex.stages.<stage>.model` | — | **Игнорируется** в legacy режиме. Если обнаружен — выводится **WARNING для каждого этапа**: "Per-stage model override for '<stage>' is not supported in legacy mode. Define runner.yaml for per-stage model configuration." |
| `codex.stages.<stage>.reasoningEffort` | — | **Игнорируется** в legacy режиме. Если обнаружен — выводится **WARNING для каждого этапа**: "Per-stage reasoningEffort override for '<stage>' is not supported in legacy mode. Define runner.yaml for per-stage model configuration." |
| `codex.sandboxMode` | `runner.sandboxMode` | Прямое отображение |
| `codex.approvalPolicy` | `runner.approvalPolicy` | Прямое отображение |
| `codex.networkAccessEnabled` | `runner.networkAccessEnabled` | Прямое отображение |
| `codex.streamAgentOutput` | `runner.streamAgentOutput` | Прямое отображение |
| `loop.maxIterations` | `runner.maxIterations` | Прямое отображение |
| `loop.logDir` | `runner.logDir` | Прямое отображение |
| `loop.enableLogs` | `runner.enableLogs` | Прямое отображение |
| `loop.runArchiveStage` | → `Config.runArchiveStage` | **Не в RunnerConfig** — остаётся в Config |
| `loop.autoApprove` | → `Config.autoApprove` | **Не в RunnerConfig** — остаётся в Config |
| `loop.watchdog.*` | `runner.watchdog.*` | Прямое отображение |
| `loop.notifications.*` | `runner.notifications.*` | Прямое отображение |

#### `getConfigValue(config: Config, key: string): unknown`

- `phasedev config phases.<stage>.skills.main` — работает
- `phasedev config codex.stages.<stage>.skills.main` — возвращает значение с deprecation hint: `"Используйте 'phases.<stage>.skills.main'"`

#### `getStageSkillConfig(config: Config, stage: Stage): StageSkillConfig`

- Читает `config.phases[stage]?.skills` вместо `config.codex.stages[stage]?.skills`
- Поведение не меняется

#### `getStageModelConfig` — **удалён** (не нужен core слою)

### Integration Points

| Файл | Что меняется |
|------|-------------|
| `src/entities/config/config.ts` | `Config` → `phases:`, убрать `codex:`, `loop:`. Убрать `getStageModelConfig`. Обновить `parseConfig`, `DEFAULT_CONFIG`, `getConfigValue`. |
| `src/features/runner/config.ts` | Новые типы (`RunnerConfig`, `WatchdogConfig`, etc.) + `parseRunnerConfig()`. Re-экспорт Config-типов из entities. |
| `src/features/runner/index.ts` | Экспорт `RunnerConfig`, `parseRunnerConfig`. **Не экспортирует core Config типы** (per PRD 5.3). Может ре-экспортировать `Stage`, `StageConfig` для loose separation. |
| `src/features/runner/run-flow-ralph.ts` | `runRunner(config: Config, runnerConfig: RunnerConfig)` — два параметра вместо одного. Кодекс-SDK создаётся с `runnerConfig`, flow-контроль с `config`. |
| `src/features/runner/codex-turn.ts` | Импорт `ApprovalPolicy`, `ReasoningEffort`, `SandboxMode` из `./config` (без изменений, но источник меняется). |
| `src/runner.ts` | Загружает оба файла, передаёт `config` + `runnerConfig` в `runRunner`. |
| `src/cli.ts` | `phasedev config <key>` — только `config.yaml`. `phasedev next` — `getStageSkillConfig(config, stage)`. |
| `src/features/stage-control/get-next-prompt.ts` | Импорт `Config` — без изменений (использует `config.phases`). |
| `src/features/stage-control/phase-routing.ts` | Импорт `Config` — без изменений. |
| `src/features/stage-control/archive-stage.ts` | Импорт `Config` — без изменений. |
| `src/features/stage-control/get-init-prompt.ts` | Импорт `Config` — без изменений. |
| `src/features/stage-control/skill-policy.ts` | `getStageSkillConfig(config, stage)` — читает `config.phases[stage]`. Без изменений. |
| `src/features/project-init/init-project.ts` | Создаёт оба файла (`config.yaml` + `runner.yaml`). |
| `src/shared/fs/resolve-project-log-dir.ts` | `resolveProjectLogDir(logDir: string)` — принимает `runnerConfig.runner.logDir` как строку. Чистая утилита. |
| `config.yaml` | Новая структура: `phases:`, `runArchiveStage`, `autoApprove`. |
| `runner.yaml` | **Новый файл.** |
| `skills/phasedev-orchestrator/SKILL.md` | Все старые названия этапов → новые. Полный mapping:<br>`setup→change_intake`, `setup_approval→change_intake_approval`<br>`research→code_research`, `invalid_research→invalid_code_research`<br>`design→technical_design`, `invalid_design→invalid_technical_design`<br>`plan→iteration_planning`, `invalid_plan→invalid_iteration_planning`, `plan_approval→iteration_planning_approval`<br>`phase_validation→iteration_validation`<br>`repair→finding_repair` |
| `test/config.test.ts` | Тесты на `phases`, новые тесты на `runArchiveStage`/`autoApprove`. |
| `test/runner.test.ts` | `RunnerConfig` в фикстурах. |
| `test/cli.test.ts` | Обновлённые фикстуры. |
| `test/controller.test.ts`, `test/parser.test.ts` | Обновлённые фикстуры. |

### Interaction Contract

Не применимо — нет изменений кросс-каттинг поведенческих контрактов.

### Integration Contract

| IC-ID | Инвариант | Секции, где цитируется |
|-------|-----------|------------------------|
| IC-1 | `phases` — объект с ключами из `STAGES` set (без `init`) | Data Model, API Surface, Integration Points |
| IC-2 | `RunnerConfig.runner.model` — `string`, `RunnerConfig.runner.reasoningEffort` — `ReasoningEffort` | Data Model, API Surface |
| IC-3 | `parseConfig` не выбрасывает ошибку на неизвестные ключи в `phases` — только warning | API Surface, Edge Cases |
| IC-4 | `getConfigValue` маппит старые ключи (`codex.default.*`, `codex.sandboxMode`, `codex.stages.*`, `loop.*`) на новые пути (`phases.*`, `runArchiveStage`, `autoApprove`) | API Surface (Legacy Migration), CLI Backward Compatibility |
| IC-5 | `.phasedev/runner.yaml` добавлен в `isIgnoredFlowSnapshotPath` | Integration Points, Runner Allowlist |
| IC-6 | Если `runner.yaml` существует — runner-поля читаются **только из него** (даже если пропущены поля), не из legacy config.yaml | API Surface (`loadConfig`), Edge Cases (EC-2) |
| IC-7 | При старте runner проверяет SKILL.md на наличие устаревших названий этапов; при обнаружении — **fatal error** с указанием файла и строк | Integration Points (SKILL.md) |

#### SKILL.md Stage Name Validation

При старте раннера (в `loadConfig` или `runner.ts`) добавляется проверка:

```typescript
function validateSkillMdStageNames(skillMdPath: string): void {
  const content = readFileSync(skillMdPath, "utf-8");
  const oldStagePatterns = [
    /\bsetup\b/, /\bsetup_approval\b/,
    /(?<!\w)research\b/, /\binvalid_research\b/,
    /(?<!\w)design\b/, /\binvalid_design\b/,
    /(?<!\w)plan\b/, /\binvalid_plan\b/, /\bplan_approval\b/,
    /\bphase_validation\b/,
    /\brepair\b/,
  ];
  for (const pattern of oldStagePatterns) {
    if (pattern.test(content)) {
      throw new Error(
        `SKILL.md содержит устаревшие названия этапов (${pattern.source}). ` +
        "Запустите 'phasedev migrate-skill-md' для автоматического обновления."
      );
    }
  }
}
```

Это предотвращает runtime-ошибки, когда оркестратор ищет этапы по новым названиям, а SKILL.md всё ещё использует старые.

### Edge Cases

| EC | Сценарий | Риск | Обработка |
|----|----------|------|-----------|
| EC-1 | **Существующий проект со старым `config.yaml`** (старые названия этапов `setup`, `research`...) | `STAGES` валидация выбросит ошибку | `loadConfig` детектит `codex.stages` структуру, парсит с deprecation warning, маппит `setup→change_intake` и т.д. |
| EC-2 | **`runner.yaml` не существует** | Раннер не имеет настроек | `runner.yaml` — опционален. `loadConfig` извлекает runner-поля из `config.yaml` (legacy). Deprecation warning. |
| EC-3 | **Конфликт значений** в `config.yaml` и `runner.yaml` | Непредсказуемое поведение | Runner-поля из `runner.yaml` имеют приоритет. Warning при конфликте. |
| EC-4 | **`phases` секция пуста или отсутствует** | Этапы без навыков | Дефолт: `{}`. Stage-controller использует пустые навыки. |
| EC-5 | **`phasedev config codex.stages.setup.model`** (старый CLI ключ) | "key not found" | CLI принимает старые ключи с deprecation hint: `→ используйте 'phases.change_intake'` |
| EC-6 | **`.phasedev/runner.yaml` не в allowlist снапшотов** | Изменения раннера считаются прогрессом | `isIgnoredFlowSnapshotPath` включает `.phasedev/runner.yaml` (per IC-5) |
| EC-7 | **Неизвестные ключи в `phases` секции** (например, опечатка `"implemntation"`) | Будущие этапы фреймворка вызовут ошибку | Warning вместо throw (per IC-3). Forward compatibility. |
| EC-8 | **`runArchiveStage`/`autoApprove` отсутствуют** | Используются дефолты | Дефолты: `runArchiveStage: true`, `autoApprove: false` |

### Failure Modes

#### Config Parser (`parseConfig` / `parseRunnerConfig`)

| Сценарий | Детекция | Impact Radius | Симптом | Recovery | Data Consistency | Detection Lag |
|----------|----------|---------------|---------|----------|------------------|---------------|
| Старые названия этапов в `codex.stages` (legacy mode) | `parseConfig` детектит `codex.stages` | config loading | Deprecation warning при старте | Прозрачный маппинг | Нормальная — объект с новыми названиями | Immediate |
| `codex.stages` И `phases` одновременно | Парсер проверяет наличие обоих | config loading | Warning: `phases` wins | Приоритет `phases` | `phases` используется | Immediate |
| Пустой `runner.yaml` | `parseRunnerConfig({})` | runtime runner | Silent — дефолты | N/A | Полные дефолты | Immediate |
| `loop.watchdog.turnTimeoutMs` — строка вместо числа | `readPositiveInteger` | watchdog | Validation error | Выбросить ошибку с описанием | N/A | Immediate |
| `runner.model` — не строка (напр., объект) | `readString` | Codex thread | Validation error | Выбросить ошибку | N/A | Immediate |
| runner.yaml с синтаксической ошибкой YAML | `yaml.parse` выбросит `YAMLException` | Весь раннер | "Failed to parse runner.yaml" | User фиксит YAML | N/A | Immediate |

**Cost-benefit:** Frequency: редкое (конфиги редко меняются) × Severity: среднее (раннер не стартует) → **Decision: Mitigate** (валидация с понятными ошибками)

#### Runner Config Loading (`runner.ts`, `run-flow-ralph.ts`)

| Сценарий | Детекция | Impact Radius | Симптом | Recovery | Data Consistency | Detection Lag |
|----------|----------|---------------|---------|----------|------------------|---------------|
| `runner.yaml` не существует, и `config.yaml` старый | `loadConfig` → `parseConfig` legacy fallback | config loading | Deprecation warning | Runner стартует с извлечёнными полями | Нормальная | Immediate |
| `runner.yaml` не существует, и `config.yaml` новый | `loadConfig` defaults for runner | Все runner-решения | Runner использует дефолты | Создать runner.yaml | Полные дефолты | Immediate |
| `logDir` — абсолютный путь | `resolveProjectLogDir` выбросит ошибку | Логирование | "logDir must be a relative path" | User фиксит runner.yaml | N/A | Immediate |

**Cost-benefit:** Frequency: редкое × Severity: среднее → **Decision: Mitigate** (чёткие сообщения об ошибках)

#### CLI (`cli.ts`)

| Сценарий | Детекция | Impact Radius | Симптом | Recovery | Data Consistency | Detection Lag |
|----------|----------|---------------|---------|----------|------------------|---------------|
| `phasedev config phases.change_intake` — новый ключ | `getConfigValue` traverses `config.phases` | CLI output | Корректный ответ | N/A | N/A | Immediate |
| `phasedev config codex.stages.setup` — старый ключ | `getConfigValue` маппит на `phases.change_intake` | CLI output | Значение + deprecation hint | Продолжить с hint | N/A | Immediate |
| `phasedev init-project` — существующий проект без runner.yaml | `initProject` проверяет наличие файлов; если config.yaml уже существует — **ничего не перезаписывает** (только создаёт runner.yaml если отсутствует); если оба существуют — **no-op** | project init | Сообщение: "Project already initialized. Use --force to overwrite existing configs." | User запускает phasedev next (runner.yaml fallback сработает) | N/A | Immediate |
| `phasedev check --expect-stage design` (старое имя) | `isStageKind` проверяет Stage union (уже новые имена) | CLI validation | "Unknown stage: design" | User использует новое имя | N/A | Immediate |

**Cost-benefit:** Frequency: частое (CLI — основной интерфейс) × Severity: низкое (правильные сообщения об ошибках) → **Decision: Mitigate** (legacy key mapping + понятные ошибки)

## Acceptance Criteria

### Ship Criteria

- **AC1 — `config.yaml` использует `phases:` вместо `codex.stages`, все ключи этапов переименованы**
  - Surface: `config`
  - Proof: `parseConfig(yaml.parse(readFileSync("config.yaml")))` завершается без ошибок
  - Expected: Возвращает `Config` с `phases: { change_intake: {...}, ... }`
  - Artifact: `zuvo/proofs/AC1-config-parse.txt`

- **AC2 — `runner.yaml` создан и содержит все runner-specific поля**
  - Surface: `config`
  - Proof: `parseRunnerConfig(yaml.parse(readFileSync("runner.yaml")))` завершается без ошибок
  - Expected: Возвращает `RunnerConfig` с `runner: { model, reasoningEffort, ... }`
  - Artifact: `zuvo/proofs/AC2-runner-parse.txt`

- **AC3 — `loadConfig` загружает оба файла и возвращает `{ config, runnerConfig }`**
  - Surface: `backend-logic`
  - Proof: `loadConfig(testDir)` где есть оба файла
  - Expected: `config.phases` содержит этапы, `runnerConfig.runner.model` содержит модель
  - Artifact: `zuvo/proofs/AC3-dual-load.txt`

- **AC4 — `loadConfig` работает с legacy config.yaml (без runner.yaml)**
  - Surface: `backend-logic`
  - Proof: `loadConfig(testDir)` где только старый `config.yaml` с `codex.stages`
  - Expected: Deprecation warning; возвращает `{ config, runnerConfig }` где `runnerConfig.runner.model` извлечён из legacy
  - Artifact: `zuvo/proofs/AC4-legacy-load.txt`

- **AC5 — `runRunner` принимает `Config` + `RunnerConfig` раздельно**
  - Surface: `backend-logic`
  - Proof: `runRunner(config, runnerConfig)` — тайпчек проходит, раннер стартует
  - Expected: Runner использует `runnerConfig.runner.model` для Codex, `config.runArchiveStage` для flow
  - Artifact: `zuvo/proofs/AC5-runner-signature.txt`

- **AC6 — `.phasedev/runner.yaml` в `isIgnoredFlowSnapshotPath`**
  - Surface: `backend-logic`
  - Proof: `isIgnoredFlowSnapshotPath(".phasedev/runner.yaml")` возвращает `true`
  - Expected: `true`
  - Artifact: `zuvo/proofs/AC6-allowlist.txt`

- **AC7 — `phasedev init-project` создаёт оба файла**
  - Surface: `integration`
  - Proof: `phasedev init --project-path /tmp/test-project`; проверить наличие `.phasedev/config.yaml` и `.phasedev/runner.yaml`
  - Expected: Оба файла существуют, парсятся без ошибок
  - Artifact: `zuvo/proofs/AC7-init-files.txt`

- **AC8 — `bun test` проходит**
  - Surface: `integration`
  - Proof: `cd /tmp/test-project && bun test`
  - Expected: exit 0
  - Artifact: `zuvo/proofs/AC8-test-suite.txt`

- **AC9 — `npm run typecheck` проходит**
  - Surface: `integration`
  - Proof: `cd /tmp/test-project && npm run typecheck`
  - Expected: exit 0
  - Artifact: `zuvo/proofs/AC9-typecheck.txt`

### Success Criteria

- **AC-S1 — Нет регрессии функциональности: `phasedev next` работает на проекте с новым форматом**
  - Surface: `integration`
  - Proof: `phasedev init --project-path /tmp/test-project && cd /tmp/test-project && phasedev next`
  - Expected: Команда завершается без ошибок (с учётом, что проект пуст)
  - Artifact: `zuvo/proofs/ACS1-next-smoke.txt`

- **AC-S2 — Пользователь со старым проектом может запустить `phasedev next` без ручной миграции**
  - Surface: `integration`
  - Proof: Создать legacy проект со старым `config.yaml`; запустить `phasedev next`
  - Expected: Deprecation warning; команда выполняется
  - Artifact: `zuvo/proofs/ACS2-legacy-smoke.txt`

- **AC-S3 — `phasedev config codex.stages.*` показывает deprecation hint и значение**
  - Surface: `integration`
  - Proof: `phasedev config codex.stages.implementation`
  - Expected: Значение + `Deprecation: используйте 'phases.implementation'`
  - Artifact: `zuvo/proofs/ACS3-deprecation.txt`

## Whole-feature Smoke Proofs

- **SMOKE1 — Init → Config → Next полный цикл (новый формат)**
  - Preconditions: Временная директория
  - Proof: `phasedev init --project-path /tmp/smoke-test && cd /tmp/smoke-test && phasedev config runArchiveStage && phasedev next`
  - Expected: Init создаёт оба файла; config выводит `true`; next завершается (пустой проект может быть заблокирован — это ожидаемо)
  - Artifact: `zuvo/proofs/smoke-new-project.txt`

- **SMOKE2 — Legacy проект без runner.yaml**
  - Preconditions: Временная директория со старым `config.yaml` (codex.stages.plan, loop.maxIterations, и т.д.)
  - Proof: `cd /tmp/smoke-legacy && phasedev config phases.iteration_planning && phasedev next`
  - Expected: Deprecation warning на load; `phasedev config phases.iteration_planning` выводит значение; next работает
  - Artifact: `zuvo/proofs/smoke-legacy.txt`

## Validation Methodology

**Proof runners required:**
- `bun test` — для всех AC (unit + интеграционные)
- `npm run typecheck` — для type safety
- `curl` не требуется (нет HTTP эндпоинтов)

**Infrastructure prerequisites:**
- Node.js >= 20
- bun
- Временная директория для smoke тестов

**Per-AC proofs:** См. каждую AC выше.

## Rollback Strategy

- **Kill switch:** `loadConfig` сохраняет полную обратную совместимость со старым `config.yaml`. Удаление `runner.yaml` возвращает к legacy поведению.
- **Fallback:** Если новый формат вызывает проблемы, пользователь может:
  1. Удалить `runner.yaml` — `loadConfig` продолжит работать в legacy режиме
  2. Переименовать `phases:` обратно в `codex.stages:` — будет работать с deprecation warning
- **Data preservation:** Конфиги — не состояние, миграция не требуется
- **Rollback procedure:** `git revert` коммитов; альтернативно — удалить `runner.yaml` и если был изменён `config.yaml`, восстановить из истории

## Backward Compatibility

- **Старый `config.yaml`** с `codex.stages.plan.model` и т.д. → парсится в legacy режиме
- **CLI-ключи** `codex.stages.*` → маппятся на `phases.*`
- **Программный API:** `getConfigValue(config, "codex.stages.implementation.model")` → возвращает `undefined` (правильный новый путь: `getConfigValue(config, "phases.implementation.model")`)
- **Migration path:** Никакой ручной миграции не требуется — `loadConfig` обрабатывает оба формата

## Out of Scope

### Deferred to v2

- Автоматическая перезапись старого `config.yaml` в новый формат (CLI команда `phasedev migrate-config`)
- Deprecation warnings → hard errors (будет после периода стабильности)

### Permanently out of scope

- Изменение логики раннера
- Изменение `flow-route.ts`
- Удаление кода раннера из репозитория
- Изменение содержимого skills в example config

## Open Questions

*(Нет — все вопросы разрешены в Phase 2)*

## Adversarial Review

**Provider:** gemini (pass 1) | codex-5.3: failed/empty | pass 2: не запущен (classifier unavailable)
**Status:** `partial (1/2 providers)` — все findings исправлены и подтверждены spec-reviewer (итерация 3)

### Pass 1 Findings

| # | Severity | Issue | Resolution |
|---|----------|-------|------------|
| CR-1 | **CRITICAL** | Legacy migration silently drops per-stage model/effort overrides | **FIXED**: добавлен per-stage WARNING при обнаружении per-stage overrides в legacy режиме. Выводится сообщение с рекомендацией создать `runner.yaml`. |
| CR-2 | **CRITICAL** | `init-project` поведение противоречит AC7 | **FIXED**: уточнено поведение — для нового проекта создаются оба файла; для существующего — runner.yaml если отсутствует, config.yaml не перезаписывается; если оба есть — no-op. |
| W-1 | **WARNING** | `final_validation` в STAGES set выглядит неопределённым | **FIXED**: добавлен комментарий, что `final_validation` — реальный этап фреймворка, присутствует в Stage union и `flow-route.ts`, не подлежит переименованию. |
| W-2 | **WARNING** | `runner.yaml` partial merge не определён | **FIXED**: добавлен IC-6 — если `runner.yaml` существует, runner-поля читаются **только из него**, пропущенные поля используют `DEFAULT_RUNNER_CONFIG`. |
| W-3 | **WARNING** | Нет валидации SKILL.md после переименования | **FIXED**: добавлен IC-7 с `validateSkillMdStageNames()` — проверка при старте раннера, fatal error при обнаружении старых названий. |

### Pass 2

Pass 2 не запущен — security classifier временно недоступен. Все found issues из pass 1 исправлены и прошли spec-reviewer (APPROVED, итерация 3). Никаких неисправленных CRITICAL/WARNING не осталось.

**Итог:** `adversarial_review: warnings (fixed)`
