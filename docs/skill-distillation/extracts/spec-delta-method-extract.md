# Экстракт: spec-delta-method (шаги 1–2 конвейера)

Дата: 2026-08-04. Экстракт P1–P50 (агент sonnet). Единственный профильный донор; свип обеих библиотек других источников не нашёл (doc-updater — генерация README из кода, contract-first — API-контракты, оба spec-reviewer'а — ревью, не майнинг; documentation-mandate — pre-excluded, конфликт №8).

## Inventory

| Path | Lines | Verdict |
|---|---|---|
| `ECC/agents/spec-miner.md` | 217 | **Primary — полный экстракт P1–P50**; sample-and-expand уже в codebase-recon (не ре-экстрагирован); Prompt Defense boilerplate исключён |
| `ECC/agents/doc-updater.md`, `code-explorer.md`, `skills/codebase-onboarding`, `skills/contract-first`; `zuvo` оба spec-reviewer'а, `documentation-mandate` | — | Excluded — другие механизмы / стоящие исключения |

## Ключевые победители

- P2/P6/P19/P20/P33: «A spec is not a document organized by type — it is a flat list of behavioral assertions. Every behavior is either a **Requirement** (triggered: WHEN → THEN) or an **Invariant** (always true)»; никаких глав по типам («API Contracts», «Business Rules») — «classification chapters add noise, not signal»; потребитель ищет по entities/enforced, не по заголовкам глав.
- P30: таблица Requirement vs Invariant (перенесена целиком).
- P7–P9: источники майнинга — сигнатуры публичных функций; guard-условия сервисного слоя; переходы статусов; доменная валидация; чистые вычисления; authz-проверки; assert'ы и constraint'ы БД; эмиссии событий; saga/компенсации. «Do not skip a behavior because it doesn't fit a category. If the code enforces something, it goes in the spec.»
- P10–P16, P25, P35: метаданные — entities, enforced (точность «прыгнуть в код»), test, id; «If you cannot determine a field, leave it out — never guess»; **id — стабильный якорь**: производится от самой верхней точки enforcement, «MUST NOT change when the human-readable Requirement name changes — it anchors MODIFIED Requirements in future deltas»; «A Requirement without enforced is a promise with no accountability»; depends_on/triggers — только статически трассируемые синхронные связи внутри одной capability, «Do NOT guess cross-module or event-driven async dependencies» (P50).
- P27/P28: у каждого Requirement минимум один сценарий; у Invariant сценариев нет — может быть verified_by.
- P4/P34/P45/P46: capability = связный кластер входных точек и их зависимостей, kebab-case имя; одна capability — один спек-файл, >500 строк → capability слишком широка; «Mining every module at once — spec rot starts when specs outpace usage»; не спекать генерированный код и vendored-зависимости.
- P31/P47: «**Never invent behavior.** If the code doesn't clearly express a contract», фиксируй как uncertainty с причиной — «don't create a Requirement from guesswork»; «Guessing at behavior because the code is hard to read» — FAIL.
- P32/P44: «**Cross-validate.** ...The actual contract is what callers rely on, not what docs claim»; копирование докстрингов без сверки с вызывающими — FAIL.
- P36: «**Flag, don't fix.** You're a miner, not a refactorer.»
- P29/P38/P40: каждая запись «last verified» несёт таймстамп и commit hash последней сверки код↔спека — «the anchor that makes freshness checks possible»; потребители проверяют свежесть до доверия.
- P37/P41: спека — baseline для будущих дельт (added/modified/removed поверх стабильных якорей); «MODIFIED Requirements will match by id, not by name»; структура плоская, чтобы дельта-операции были дёшевы.
- P22 (принцип): метаданные машинно-парсимые, ключ-значение — иначе спека не searchable (P48: «unsearchable spec is dead spec»).

## Решения фильтров (конфликт №7 применён)

**[format] — выбыло:** HTML-comment синтаксис, `openspec/specs/...` пути, 4-хештеговые заголовки, frontmatter-механика, литеральные `## ADDED/MODIFIED/REMOVED`-заголовки (концепция дельт сохранена без разметки), P21/P49-механика.

**Lifecycle — выбыло:** P39–P41 имена донорских агентов (механизм «match by stable id, check freshness» сохранён); P3-триггеры переписаны в When to Use без OpenSpec; P5 «спроси пользователя» — оркестрация (суть «не майнить всё сразу» сохранена через P45).

**Дедупы:** sample-and-expand → codebase-recon (уже там); «flag, don't fix» родствен recon-овскому «flag unknowns», но здесь про инконсистентности кода при майнинге — оставлен.
