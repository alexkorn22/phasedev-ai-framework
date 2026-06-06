Этап 1. Research.

Stage contract: создать фактическую базу для design stage.

{{skill_policy}}

Входные артефакты:
- Требования PRD и ADLC-style Intent Card: [prd.md]({{prd_path}})
- Правила разработки: [rules.md]({{rules_path}})

Выходной артефакт:
- [research_facts.md]({{research_path}})

Требования к `research_facts.md`:
- подтвержденные факты, релевантные требованиям, `Intent Card`, `Resolution signal`, `Risk envelope`, scope boundaries, success criteria, `Accepted Assumptions` и `Deferred Decisions` из `prd.md`;
- отдельный раздел `## PRD Intent Trace`, который кратко фиксирует: `Change type`, `User or business intent`, `Generation target`, `Resolution signal`, `Decision deadline`, `Risk envelope`, `Accepted Assumptions`, `Deferred Decisions` и какие части research подтверждают, ограничивают или ставят под вопрос эти поля;
- ссылки на файлы и номера строк для фактов о кодовой базе;
- затронутые модули, публичные интерфейсы, зависимости, существующие контракты и ограничения;
- похожие существующие решения, если они найдены;
- если research facts показывают, что approved PRD intent, generation target, success criteria, accepted assumptions или risk envelope неполны, противоречивы или невыполнимы, не превращайте это в design assumption: остановитесь, сообщите PRD blocker пользователю и укажите, какие PRD поля нужно пересогласовать;
- явно отмеченные неизвестные или спорные области допускаются только для non-blocking research gaps; если они влияют на `Resolution signal`, `Risk envelope`, scope boundaries или success criteria, это blocker, а не обычный unknown;
- без архитектурных решений, implementation proposals и refactoring proposals.

## Artifact allowlist

Allowed persistent artifacts for this stage:
- `research_facts.md`

Завершение шага:
- После записи `research_facts.md` остановите работу.
- Сообщите пользователю, что research готов и следующий переход выполняется через `flow next`.
