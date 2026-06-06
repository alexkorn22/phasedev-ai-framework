Этап 1. Research.

Stage contract: создать фактическую базу для design stage.

{{skill_policy}}

Входные артефакты:
- Требования PRD и ADLC-style Intent Card: [prd.md]({{prd_path}})
- Правила разработки: [rules.md]({{rules_path}})

Выходной артефакт:
- [research_facts.md]({{research_path}}) (должен быть инициализирован на основе шаблона: [research_facts.md template]({{research_template_path}}))

Требования к `research_facts.md`:
- `research_facts.md` должен быть создан строго на основе шаблона [research_facts.md template]({{research_template_path}}). Все HTML-комментарии должны быть удалены.
- подтвержденные факты, релевантные `R#` requirements, `SC#` success criteria, `Intent Card`, `Resolution signal`, `Risk envelope`, scope boundaries, `Accepted Assumptions` и `Deferred Decisions` из `prd.md`;
- отдельный раздел `## PRD Intent Trace`, который кратко фиксирует: `Change type`, `User or business intent`, `Generation target`, `Resolution signal`, `Decision deadline`, `Risk envelope`, `Accepted Assumptions`, `Deferred Decisions` и какие части research подтверждают, ограничивают или ставят под вопрос эти поля;
- отдельный trace по каждому `R#` и `SC#` в разделе `## Requirements & Success Criteria Trace`: укажите, какие research facts подтверждают, ограничивают или блокируют конкретный requirement/criterion;
- ссылки на файлы и номера строк для фактов о кодовой базе в разделе `## Source Facts`;
- затронутые модули, публичные интерфейсы, зависимости, существующие контракты и ограничения;
- похожие существующие решения, если они найдены;
- если research facts показывают, что approved PRD intent, generation target, конкретный `R#`, конкретный `SC#`, accepted assumptions или risk envelope неполны, противоречивы или невыполнимы, не превращайте это в design assumption: остановитесь, сообщите PRD blocker пользователю и укажите, какие PRD поля/IDs нужно пересогласовать;
- явно отмеченные неизвестные или спорные области допускаются только для non-blocking research gaps в разделе `## Research Gaps & Blockers`; если они влияют на `Resolution signal`, `Risk envelope`, scope boundaries или success criteria, это blocker, а не обычный unknown;
- без архитектурных решений, implementation proposals и refactoring proposals.

## Artifact allowlist

Allowed persistent artifacts for this stage:
- `research_facts.md`

Завершение шага:
- После записи `research_facts.md` остановите работу.
- Сообщите пользователю, что research готов и следующий переход выполняется через `flow next`.
