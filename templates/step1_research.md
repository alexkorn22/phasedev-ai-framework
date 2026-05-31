Этап 1. Research.

Stage contract: создать фактическую базу для design stage.

Входные артефакты:
- Требования PRD: [prd.md]({{prd_path}})
- Правила разработки: [rules.md]({{rules_path}})

Выходной артефакт:
- [research_facts.md]({{research_path}})

Требования к `research_facts.md`:
- подтвержденные факты, релевантные требованиям из `prd.md`;
- ссылки на файлы и номера строк для фактов о кодовой базе;
- затронутые модули, публичные интерфейсы, зависимости, существующие контракты и ограничения;
- похожие существующие решения, если они найдены;
- явно отмеченные неизвестные или спорные области;
- без архитектурных решений, implementation proposals и refactoring proposals.

## Artifact allowlist

Allowed persistent artifacts for this stage:
- `research_facts.md`

Завершение шага:
- После записи `research_facts.md` остановите работу.
- Сообщите пользователю, что research готов и следующий переход выполняется через `flow next`.

{{skill_policy}}
