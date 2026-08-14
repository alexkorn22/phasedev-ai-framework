# Экстракт: codebase-recon (шаги 1–2 конвейера)

Дата: 2026-08-04. Фильтры применены — см. карточку `cards/codebase-recon.md`.

## Inventory

| Path | Lines | Verdict |
|---|---|---|
| `ECC/agents/code-explorer.md` | 79 | primary donor |
| `ECC/skills/codebase-onboarding/SKILL.md` | 235 | primary donor |
| `ECC/agents/spec-miner.md` | 218 | primary donor (только sample-and-expand; остальное — spec-delta-method) |
| `zuvo/shared/includes/blind-coverage-audit.md` | 140 | primary donor (только правило контрактной слепоты) |
| `ECC/skills/code-tour/SKILL.md` | 254 | excluded — генерирует .tour-артефакты, не метод разведки |
| `ECC/skills/repo-scan/SKILL.md` | 79 | excluded — аудит third-party зависимостей |
| `ECC/skills/search-first/SKILL.md` | 183 | excluded — build-vs-buy воркфлоу |
| `ECC/skills/context-budget/SKILL.md` | 136 | excluded — аудит оверхеда компонентов Claude Code |
| `zuvo/skills/structure-audit`, `code-audit`, `security-audit` | — | excluded — ревью/секьюрити (другие скиллы) |
| `zuvo/skills/architecture/SKILL.md` | 546 | excluded — потребитель разведки, CodeSift-связан |
| `zuvo/skills/using-zuvo`, `refactor`, `execute/agents/implementer` | — | excluded — чужой lifecycle |
| Прочие хиты grep (ECC стек-скиллы, zuvo includes, переводы, диспатч-ссылки) | — | excluded — ложные срабатывания по ключевым словам |

## Extracted statements (R1–R60)

### `ECC/agents/code-explorer.md`

- R1 (5): `tools: Read, Grep, Glob`
- R2 (19): "You deeply analyze codebases to understand how existing features work before new work begins."
- R3 (25): "find the main entry points for the feature or area"
- R4 (26): "trace from user action or external trigger through the stack"
- R5 (30): "follow the call chain from entry to completion"
- R6 (31): "note branching logic and async boundaries"
- R7 (32): "map data transformations and error paths"
- R8 (36): "identify which layers the code touches"
- R9 (37): "understand how those layers communicate"
- R10 (38): "note reusable boundaries and anti-patterns"
- R11 (42): "identify the patterns and abstractions already in use"
- R12 (43): "note naming conventions and code organization principles"
- R13 (47): "map external libraries and services"
- R14 (48): "map internal module dependencies"
- R15 (49): "identify shared utilities worth reusing"
- R16 (53-78): Output Format template (schema отчёта донора)
- (Prompt Defense Baseline 8-16 — исключён при экстракте, boilerplate)

### `ECC/skills/codebase-onboarding/SKILL.md`

- R17 (3): description — onboarding guide + starter CLAUDE.md
- R18 (14-18): триггеры when-to-use донора
- R19 (24): "Gather raw signals about the project without reading every file. Run these checks in parallel:"
- R20 (27-29): "Package manifest detection → package.json, go.mod, Cargo.toml, pyproject.toml, pom.xml, build.gradle, Gemfile, composer.json, mix.exs, pubspec.yaml"
- R21 (31-33): "Framework fingerprinting → next.config.*, nuxt.config.*, angular.json, vite.config.*, django settings, flask app factory, fastapi main, rails config"
- R22 (35-36): "Entry point identification → main.*, index.*, app.*, server.*, cmd/, src/main/"
- R23 (38-40): "Directory structure snapshot → Top 2 levels of the directory tree, ignoring node_modules, vendor, .git, dist, build, __pycache__, .next"
- R24 (42-44): "Config and tooling detection → .eslintrc*, .prettierrc*, tsconfig.json, Makefile, Dockerfile, docker-compose*, .github/workflows/, .env.example, CI configs"
- R25 (46-48): "Test structure detection → tests/, test/, __tests__/, *_test.go, *.spec.ts, *.test.js, pytest.ini, jest.config.*, vitest.config.*"
- R26 (53-60): Tech Stack: languages/versions, frameworks/major libraries, databases/ORMs, build tools, CI/CD
- R27 (62-65): Architecture Pattern: monolith/monorepo/microservices/serverless; frontend/backend split; API style REST/GraphQL/gRPC/tRPC
- R28 (67-68): "Map the top-level directories to their purpose"
- R29 (80-85): "Trace one request from entry to response": где входит (router/handler/controller), как валидируется (middleware/schemas/guards), где бизнес-логика (services/models/use cases), как достигает БД (ORM/raw/repositories)
- R30 (89-94): Naming conventions: file naming, component/class naming, test file naming
- R31 (96-100): Code patterns: error handling style, DI vs direct imports, state management, async patterns
- R32 (102-105): Git conventions: branch naming, commit style, PR workflow
- R33 (106): shallow/absent git history → "skip this section and note 'Git history unavailable or too shallow to detect conventions'"
- R34–R35 (108-110, 173): два выходных документа; enhance существующего CLAUDE.md
- R36 (206): "Don't read everything — reconnaissance should use Glob and Grep, not Read on every file. Read selectively only for ambiguous signals."
- R37 (207): "Verify, don't guess — if a framework is detected from config but the actual code uses something different, trust the code."
- R38 (208): respect existing CLAUDE.md
- R39 (209): "Stay concise — the onboarding guide should be scannable in 2 minutes."
- R40 (210): "Flag unknowns — if a convention can't be confidently detected, say so rather than guessing. 'Could not determine test runner' is better than a wrong answer."
- R41 (214): анти-паттерн: CLAUDE.md длиннее 100 строк
- R42 (215): "Listing every dependency — highlight only the ones that shape how you write code" (anti-pattern)
- R43 (216): "Describing obvious directory names — `src/` doesn't need an explanation" (anti-pattern)
- R44 (217): "Copying the README — the onboarding guide adds structural insight the README lacks" (anti-pattern)
- R45 (227-233): ветвление фаз под выходные документы донора

### `ECC/agents/spec-miner.md` (sample-and-expand)

- R46 (59): "A 50-file module cannot be fully read in one session. Use this progressive strategy:"
- R47 (61): "**Sample**: Read the entry files first — routers, controllers, service facades, public API surfaces. These typically contain ~70% of behavioral assertions."
- R48 (63): "**Expand**: For each behavior found in the sample, trace one level down its call chain... Stop when:"
- R49 (64): "The call chain reaches an external boundary (DB query, HTTP call, message queue)"
- R50 (65): "Three consecutive expanded files yield no new behavioral assertions"
- R51 (66): "You've read 15 files total for this capability"
- R52 (68): "**Defer**: If files remain unread, list them in a deferred comment... They can be mined in a subsequent session."
- R53 (216): "FAIL: Reading every file in a large module instead of using sample-and-expand — wastes tokens and hits context limits"

### `zuvo/shared/includes/blind-coverage-audit.md` (контрактная слепота)

- R54 (18): "The audit is **production-first**."
- R55–R57 (20-29): изоляция blind-аудита; что аудитору нельзя читать до вердикта
- R58 (31): "Do not inherit the writer's plan. Build the coverage inventory from source."
- R59 (33): "If strict isolation is unavailable, do not claim a passing blind audit. Defer the audit or fail the file explicitly."
- R60 (37-39): "Read the production file fully before reading the test file. Enumerate every owned behavior row-by-row."
