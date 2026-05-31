## Mandatory Skill Selection Router

Для каждого этапа Flow агент обязан выбрать skills осознанно: сначала определить stage contract из `flow next`, затем выбрать минимальный набор method skills под текущий этап и домен задачи.

### Skill budget

- Setup, Research, Design, Plan, Implementation, Archive: максимум 4 skill bodies на этап.
- Phase Validation, Final Validation, Repair Loop: максимум 5 skill bodies на этап.
- `using-zuvo`, `using-agent-skills`, `flow-init` и `flow-next` считаются control/routing skills и не входят в лимит, если они уже активны и не перечитываются полностью.
- `dev-core` обязателен и входит в лимит для этапов `2 Design`, `3 Plan`, `4 Implementation`, `5R Repair Loop`.
- Если нужно превысить лимит, сначала остановись и объясни пользователю, почему stage contract нельзя выполнить в лимите.

### Selection algorithm

1. Прочитай текущий `flow next` stage contract и artifact allowlist.
2. Определи домен по evidence из PRD/design/plan/code: backend/API, DB, frontend/UI, security, performance, CI/CD, browser/E2E, docs/content, framework docs.
3. Подключи обязательные stage-core skills.
4. Добавляй domain skills только при evidence. Не подключай frontend skills для backend-only задач, DB skills без DB/schema/query work, API skills без API surface.
5. Если skill обычно пишет `audit-results/`, `audits/`, `memory/`, `.zuvo/` или docs вне allowlist, используй его только как метод анализа; результат inline-ить в разрешенный артефакт или финальный ответ.
6. После использования skills вернись к Flow stage contract и выполни только разрешенные действия текущего этапа.

### Domain skill triggers

- backend/API: `api-and-interface-design`, `api-audit`.
- database: `db-audit`.
- frontend/UI: `frontend-ui-engineering`, `frontend-design`, `design-review`.
- browser/E2E: `browser-testing-with-devtools`, `playwright`, `write-e2e`.
- security/auth/input/secrets: `security-and-hardening`, `security-audit`.
- performance: `performance-optimization`, `performance-audit`.
- dependencies/build graph: `dependency-audit`.
- CI/CD: `ci-cd-and-automation`, `ci-audit`.
- framework docs/current APIs: `source-driven-development`, `context7-docs-lookup`.
- OpenAI products/APIs: `openai-docs`.
- NestJS: `nestjs-expert`.
- FSD architecture: `fsd-2-1-architect`.
- content/SEO/GEO: `content-audit`, `seo-audit`, `geo-audit`.

### Stage-core recommendations

- `0 Setup`: required `spec-driven-development`, `context-engineering`; optional `prompt-improver`, `env-audit`, `git-workflow-and-versioning`.
- `1 Research`: required `architecture`; optional `source-driven-development`, `context7-docs-lookup`, targeted audit skills по evidence.
- `2 Design`: required `dev-core`, `architecture`; optional `api-and-interface-design`, `security-and-hardening`, `frontend-ui-engineering`, `frontend-design`, `architecture-patterns`, `fsd-2-1-architect`, `deprecation-and-migration`.
- `3 Plan`: required `dev-core`, `planning-and-task-breakdown`, `test-driven-development`; optional `incremental-implementation`, `write-e2e`, `ci-cd-and-automation`, `security-and-hardening`.
- `4 Implementation`: required `dev-core`, `incremental-implementation`, `test-driven-development`; add максимум 1 domain implementation skill по touched surface.
- `5A Phase Validation`: required `code-review-and-quality`; optional targeted validators: `test-audit`, `api-audit`, `security-audit`, `browser-testing-with-devtools`, `playwright`, `performance-audit`, `a11y-audit`, `design-review`.
- `5B Final Validation`: required `code-review-and-quality`, `security-and-hardening`; optional broad final checks по risk: `code-audit`, `review`, `test-audit`, `dependency-audit`, `db-audit`, `performance-audit`, `a11y-audit`, `design-review`, `ci-audit`.
- `5R Repair Loop`: required `dev-core`, `receive-review`; add repair skill по finding class: `debugging-and-error-recovery`/`debug`, `fix-tests`/`write-tests`, `refactor`/`code-simplification`, `security-and-hardening`.
- `6 Archive`: required `spec-driven-development`; optional `architecture`, `api-and-interface-design`, `deprecation-and-migration`, `source-driven-development` only when needed to map approved artifacts into durable requirements. Do not use `documentation-and-adrs`, `ship`, `deploy`, or `release-docs` unless the user explicitly expands archive scope beyond requirement/spec sync.
