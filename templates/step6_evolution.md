Этап 6. System Evolution.

Этот этап зарезервирован для ручного post-incident анализа и не является частью обычного `flow next` маршрута.

Используйте его только по явной команде пользователя.

Входные данные:
- Описание инцидента: {{incident}}
- Зона кода, где проявилась ошибка: {{change_scope}}
- Тесты и проверки вокруг сбоя: {{test_scope}}

Stage contract:
- определить root cause summary;
- указать, на каком этапе flow инцидент должен был быть обнаружен;
- предложить permanent preventer: изменение reusable rule/template, regression check, backlog item или изменение flow;
- не изменять одноразовый `rules.md` завершенного change без явной просьбы пользователя;
- применять изменения только если пользователь явно попросил.

## Artifact allowlist

Allowed persistent artifacts for this stage:
- no persistent artifacts unless the user explicitly asks to apply a preventer

Завершение шага:
- После анализа остановите работу.
- Сообщите root cause summary и предложенные preventers.
- Не предлагайте `flow next` для продолжения обычного маршрута.

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
