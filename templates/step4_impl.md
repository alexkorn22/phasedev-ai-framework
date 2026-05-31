Этап 4. Implementation.

Stage contract: выполнить только текущую фазу approved implementation plan.

Входные артефакты:
- Правила разработки: [rules.md]({{rules_path}})
- Утвержденный дизайн: [design.md]({{design_path}})
- План реализации: [implementation_plan.md]({{plan_path}})

Текущая фаза:
{{phase_id}}

Задачи текущей фазы:
{{phase_tasks}}

Дополнительные проверки текущей фазы из плана:
{{phase_checks}}

Обязательные результаты:
- задачи текущей фазы выполнены в рамках approved design и approved plan;
- task checkboxes текущей фазы в [implementation_plan.md]({{plan_path}}) обновлены на `[x]` для выполненных задач;
- заголовок текущей фазы остается `[~]` до успешной validation;
- gate command выполнена или причина невозможности зафиксирована: `{{test_command}}`;
- additional checks выполнены или причина невозможности зафиксирована;
- если gate command или additional checks завершились с ошибкой, исправьте причину failure и повторяйте проверки до successful pass;
- не завершайте Implementation с failed tests/checks, кроме внешнего blocker, который невозможно устранить в рамках текущего этапа;
- итоговый ответ содержит краткое описание change set, gate evidence и оставшиеся риски.

Ограничения:
- не расширяйте scope за пределы текущей фазы без явного решения пользователя;
- не переводите фазу в `[x]` на этом этапе.

## Artifact allowlist

Allowed persistent artifacts for this stage:
- production/test code needed for current phase
- task checkboxes in `implementation_plan.md`

Завершение шага:
- После обновления change set и `implementation_plan.md` остановите работу.
- Сообщите пользователю, что текущая фаза готова к validation и следующий переход выполняется через `flow next`.

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
