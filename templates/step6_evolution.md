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

## Skill Policy

This reserved manual stage is outside normal `flow next` routing and has no configured external skills.
Do not use external skills unless the user explicitly approves them for this manual analysis.

Ограничения:
- не переходите к следующему этапу без новой команды `flow next`;
- не меняйте approvals, statuses или verdicts вне правил текущего stage contract;
- не меняйте approved artifacts вне stage contract;
- не выполняйте работу вне текущего этапа, если пользователь явно не попросил;
