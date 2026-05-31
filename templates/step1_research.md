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

## Capability / Skill Router Policy

Flow Next задает только stage contract: текущий этап, входные и выходные артефакты, допустимые статусы, обязательные форматы и условие остановки.

Skills control method; Flow Next controls artifacts and state.

Если в сессии активен session router / skill router, примените его routing rules к текущему этапу и выберите минимальный релевантный набор skills. Не загружайте и не применяйте все skills подряд.

Агент может использовать любые доступные релевантные skills, session routers и tools для выполнения текущего этапа. Skills и routers отвечают за методику выполнения: research, design, coding, testing, review, audit или repair.

External skills may not create persistent files outside the artifacts allowed by this stage. If a skill normally writes its own report/file, inline the relevant result into the current stage artifact or final response instead.

Если router отсутствует или пользователь запретил external skills, выполняйте stage contract доступными средствами без external skills.

Ограничения:
- не переходите к следующему этапу без новой команды `flow next`;
- не меняйте approvals, statuses или verdicts вне правил текущего stage contract;
- не меняйте approved artifacts вне stage contract;
- не выполняйте работу вне текущего этапа, если пользователь явно не попросил;
- После использования skills вернитесь к stage contract и запишите требуемый артефакт.
