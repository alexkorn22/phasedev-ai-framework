# Экстракт: acceptance-criteria-method (шаги 1–2 конвейера)

Дата: 2026-08-04. Фильтры применены — см. карточку `cards/acceptance-criteria-method.md`. Zuvo-часть (рецепт пруфа) — V20–V58 в `verification-method-extract.md`, здесь не дублируется.

## Inventory

| Path | Lines | Verdict |
|---|---|---|
| `ECC/skills/intent-driven-development/SKILL.md` | 360 | **Primary donor** — полный экстракт (A1–A61) |
| `zuvo/shared/includes/acceptance-proof-protocol.md` | 134 | Already extracted (V20–V58) |
| `zuvo/skills/brainstorm/agents/business-analyst.md` | 263 | Additional — edge-case/failure-mode элиситация, ship/success-критерии (A62–A78) |
| `zuvo/skills/brainstorm/agents/spec-reviewer.md` | 239 | Additional — ревью-чекпоинты по критериям (A79–A94) |
| `zuvo/skills/brainstorm/SKILL.md` | 671 | Additional — калибровка фактов, дисциплина вопросов, AC/Proof (A95–A105) |
| `ECC/skills/jira-integration`, `mle-workflow`; `zuvo/adversarial-loop-docs` | — | Additional, тонкие (A106–A111) |
| ~25 файлов (spec-miner, contract-first, tdd-workflow, execute/build/plan, gate-registry, banned-vocabulary и пр.) | — | Excluded — чужие темы/lifecycle (полный список в отчёте агента) |

## Extracted statements (A1–A111, выборочно трима, сила формулировок сохранена)

### `ECC/skills/intent-driven-development/SKILL.md`

- A1 (3): "Turn ambiguous or high-impact product and engineering changes into scoped, verifiable acceptance criteria before or alongside implementation."
- A2 (3): не триггерится на тривиальные правки и запросы с уже ясными условиями приёмки.
- A3 (9-10): "Inspect available context first, expose genuine ambiguity, and choose verification methods that fit the work and its risk."
- A4 (17): триггер — "the expected outcome is not yet observable or testable".
- A5 (25): технические факты — из репо/доков/схем/тестов ДО вопросов; продуктовые ограничения — только от пользователя или продуктового артефакта.
- A6 (26): выбор глубины Quick Capture / Full Brief [формат донора].
- A7 (27): "only asks questions whose answers cannot be inferred and that materially change scope or behavior".
- A8 (28): каждый критерий: starting condition, trigger, expected outcome, prohibited side effect, verification method, priority; "no vague words like 'correctly' or 'securely' without evidence".
- A9 (29): ясный запрос без блокеров — фиксируй критерии и продолжай; рискованный — блокеры и ждать подтверждения.
- A10 (30): ревизия упавшего критерия [механика revision-формата донора].
- A11 (58-59): ревью готовой спеки: "missing scope boundaries, unverifiable requirements ('the system shall be fast'), and silent assumptions" — правь, не перезапускай дискавери.
- A12 (63-64): "Inspect the available repository, documentation, issue, design, and test context before asking for technical facts that can be discovered locally."
- A13 (65-70): "Do not infer product or business constraints from code. Business rules, compliance and regulatory obligations, contractual SLAs, pricing, data-retention policy, prioritization, and target users cannot be read from a repository. Treat them as unknown until the user supplies them or an authoritative product artifact (PRD, contract, policy document) states them. Record them as assumptions flagged for confirmation, never as discovered facts. The repository tells you how the system behaves today, not what the business requires it to do."
- A14 (71-72): "Ask only questions whose answers are required and cannot be safely inferred. Group short, related questions."
- A15 (73-75): "Do not block implementation by default."
- A16 (76-78): явное подтверждение — только при material security exposure, data loss, irreversible migration, contract breakage, meaningful cost, destructive external action.
- A17 (79-81): не писать файлы/ветки/скиллы без запроса [lifecycle].
- A18 (82-84): "Treat automated tests as evidence, not truth... allow manual UX, accessibility, security, legal, or operational verification where automation cannot establish the outcome."
- A19 (85-87): "Never include real secrets, credentials, tokens, private keys, personal data, or sensitive production payloads in acceptance criteria, fixtures, examples... Use redacted or synthetic values."
- A20 (88-90): без destructive tests/migrations/probes против прода без явной авторизации и безопасной среды.
- A21 (91-96): критерий, невыполнимый из-за открывшегося ограничения, — "do not silently drop or workaround it": обнови, назови ограничение, пере-предъяви изменение.
- A22–A26 (100-128): смallest useful output; Quick Capture 3-7 критериев; Full Brief; ревью существующей спеки вместо рестарта [форматная обвязка донора].
- A27–A30 (134-154): что извлекать/спрашивать (observable outcome, actors, failure consequence, применимые риск-оси); "Record discovered facts separately from user-provided assumptions."
- A31 (156-160): репозиторий раскрывает технические факты, не бизнес-ограничения; "Never reconstruct these from code or naming."
- A32 (166-170): scope: goal одним предложением; in scope; out of scope ("tempting adjacent work explicitly excluded"); assumptions; blocking decisions.
- A33 (174-175): AC-нумерация [формат]; "criteria and tests are not required to map one-to-one."
- A34 (177-186): поля критерия: Scenario, Action/trigger, Expected observable behavior, Prohibited side effect, Verification method (automated test | integration | manual UX | accessibility | security review | operational | stakeholder acceptance), Environment/safety constraint, Priority.
- A35 (188-189): "Do not use words such as 'correctly', 'securely', 'fast', 'intuitive', or 'robust' without defining observable evidence or recording them as a human-review judgment."
- A36 (193-205): таблица категорий покрытия (happy path / validation / authz-privacy / persistence-migration / compatibility / failure recovery / idempotency-concurrency / performance / UX-a11y) — "include only categories that apply".
- A37–A44 (209-281): режимы предъявления и шаблон брифа [форматы донора].
- A45 (300-306): fail-пример: "AC-001: The export works correctly and is secure." — не наблюдаемо, нет сценария/триггера/verification; "A reader cannot tell whether the implementation satisfied it."
- A46 (320-321): pass-пример: "a concrete observable outcome, a prohibited side effect, and a named verification method. Two people would agree on whether it was met."
- A47 (326-331): fail-пример: пер-тировый лимит из кода — бизнес-правило, не discovered fact.
- A48–A53 (335-341): рубрика: каждый критерий со сценарием/наблюдаемым результатом/методом; vague-слова заменены или помечены human judgment; бизнес-ограничения supplied/assumed, не выведены из кода; scope явный; блокеры — только safety/correctness.
- A54–A60 (347-354): quality check (перекрывается с рубрикой; A54: "The goal describes an outcome rather than an implementation choice").
- A61 (358-360): handoff-механика [lifecycle].

### `zuvo/skills/brainstorm/agents/business-analyst.md`

- A62–A63 (37-43): скрытые требования, edge cases, боли кодовой базы, "Concrete acceptance criteria that can be tested".
- A64–A67 (94-112): категории edge-cases: границы данных (empty/null/max/несуществующая запись/неожиданное состояние), timing/concurrency, authorization (включая multi-tenant leak), integration boundaries.
- A68 (114): "Skip categories that are clearly irrelevant... But explain which categories you skipped and why."
- A69 (118): "Edge cases... cover **input validation**... Failure modes cover **system resilience**... Both are needed. An agent can be excellent at one and completely blind to the other."
- A70 (132-138): поля failure-mode: Detection, Impact radius, User-facing symptom, Recovery mechanism, Data consistency, Detection lag.
- A71 (152): без структуры агенты выдают "generic answers ('falls back', 'retries', 'lock file')... they could be copy-pasted for any dependency."
- A72 (154): "Not every failure mode needs mitigation... explicit decision per failure mode rather than defaulting to 'mitigate everything' (over-engineering) or 'mitigate nothing' (optimism bias)."
- A73 (158-163): критерий обязан быть Specific ("'handles errors gracefully' is too vague; 'returns 400 with validation details when email is missing' is specific"), Testable, Independent, Realistic.
- A74–A76 (165-177): два тира — Ship criteria (must/should/edge) и Success criteria (quality/efficiency/validation); "All ship criteria can be met while success criteria fail — that means infrastructure works but value is not delivered. Both tiers must be present."
- A77 (200): edge-case claim обязан нести "Evidence: file_path:line or pattern that shows this is a real concern, not hypothetical".
- A78 (192): "If no implicit requirements found: 'User's stated requirements appear complete for this scope.'"

### `zuvo/skills/brainstorm/agents/spec-reviewer.md` (ревью-сторона)

- A79–A82: "Can an implementer build this feature correctly using only this spec?"; completeness/consistency/clarity/YAGNI/scope; численные заявления — evidenced или помечены inferred/estimated.
- A83–A86: edge cases с обработкой; failure modes 1:1 к компонентам; конкретность сценариев; "A spec can pass C7 and fail C7b completely."
- A87–A90: критерии testable+specific+трассируемы к problem statement; success-критерии отдельно, measurable, с validation methodology; "'Looks good' or 'feels right' is not a validation step."
- A91: out-of-scope: различать "deferred to later" от "permanently excluded" — "Conflating the two loses planning information."
- A92: пустые Open Questions ≠ разрешённые неоднозначности; «решения»-переодетые-вопросы.
- A93 (166-170): калибровка находок: "would they build the wrong thing?" / "would they get stuck?" → flag; "stylistic preference" → не flag.
- A94: не флагать детали плана, форматирование, отвергнутые альтернативы, теоретические опасения без связи с требованиями.

### `zuvo/skills/brainstorm/SKILL.md`

- A95 (165): несколько подсистем → декомпозиция, одна спека на подсистему; "Trying to brainstorm everything at once produces vague specs that cannot drive implementation."
- A96–A97 (281-288): верифицировать точные заявления (счётчики, existence, runtime location) до повторения как факт; иначе метка `inferred`/`estimate`.
- A98 (308-313): вопросы по одному; ≥2 именованных альтернатив с трейдоффами; "Do NOT ask 'I recommend X. OK?'"; единственный вариант → зафиксируй решение с обоснованием.
- A99 (319): scope-изменение посреди диалога: явно признать, пере-подтвердить формулировку, решить с пользователем — эта спека или follow-up.
- A100–A103 (458-482): Proof-подпункт у каждого AC; ship vs success в шаблоне [формат — суть уже в V23/A76].
- A104–A105: ревью на completeness/consistency/YAGNI/ambiguity/scope; vague AC → open questions или явное разрешение.

### Тонкие доноры

- A106–A108 (jira-integration): извлечение testable-критериев из тикета; "If acceptance criteria are vague, ask for clarification before writing code" [дубль A11].
- A109 (mle-workflow): "Do not accept 'improve the model' as a requirement. Tie the model to an observable product behavior and a measurable acceptance gate" [частный случай A35].
- A110 (adversarial-loop-docs): "'The spec is vague' is not actionable. 'Section..., item 3: "system responds quickly" — no latency threshold defined' is actionable."
- A111: severity-классификация [машинка донора].
