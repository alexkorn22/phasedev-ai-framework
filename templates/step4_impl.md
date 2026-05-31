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

{{skill_policy}}
