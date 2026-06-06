Этап 4. Implementation.

Stage contract: выполнить только текущую фазу approved implementation plan.

{{skill_policy}}

Входные артефакты:
- Требования PRD и ADLC-style Intent Card: [prd.md]({{prd_path}})
- Правила разработки: [rules.md]({{rules_path}})
- Утвержденный дизайн: [design.md]({{design_path}})
- План реализации: [implementation_plan.md]({{plan_path}})

Текущая фаза:
{{phase_id}}

Задачи текущей фазы:
{{phase_tasks}}

Контекст текущей фазы из плана:
{{phase_excerpt}}

Дополнительные проверки текущей фазы из плана:
{{phase_checks}}

Обязательные результаты:
- задачи текущей фазы выполнены в рамках approved `prd.md`, approved design и approved plan;
- change set текущей фазы выполняет только связанные с текущей фазой `R#` и `SC#` из approved plan и не расширяет scope за пределы `In scope:`;
- change set текущей фазы не нарушает `Out of scope:`, `Risk envelope`, scope boundaries, accepted assumptions, deferred decisions и success criteria из [prd.md]({{prd_path}});
- если во время implementation обнаружено, что approved plan/design не покрывает `Resolution signal`, `Generation target`, accepted assumptions, deferred decisions или risk boundary из PRD, остановитесь и сообщите blocker вместо расширения scope самостоятельно;
- не разрешайте deferred decisions из PRD самостоятельно на Implementation этапе, если они не были resolved by approved design/plan;
- task checkboxes текущей фазы в [implementation_plan.md]({{plan_path}}) обновлены на `[x]` для выполненных задач;
- заголовок текущей фазы остается `[~]` до успешной validation;
- gate command выполнена или причина невозможности зафиксирована: `{{test_command}}`;
- additional checks выполнены или причина невозможности зафиксирована;
- `### Check Evidence` текущей фазы в [implementation_plan.md]({{plan_path}}) обновлен после выполнения gate command и additional checks;
- в `Check Evidence` используйте только `Result`: `pending`, `passed`, `failed`, `blocked`, `not_applicable`;
- не завершайте Implementation, если relevant `Check Evidence` текущей фазы остается `pending` или `failed`;
- если check невозможно выполнить из-за внешнего blocker, зафиксируйте `Result = blocked`, краткую причину в `Evidence`/`Notes`, и объясните blocker в итоговом ответе;
- если gate command или additional checks завершились с ошибкой, исправьте причину failure и повторяйте проверки до successful pass;
- не завершайте Implementation с failed tests/checks, кроме внешнего blocker, который невозможно устранить в рамках текущего этапа;
- итоговый ответ содержит краткое описание change set, gate evidence и оставшиеся риски.

Ограничения:
- не расширяйте scope за пределы текущей фазы, связанных `R#`/`SC#` и `In scope:` без явного решения пользователя;
- не переводите фазу в `[x]` на этом этапе.

## Artifact allowlist

Allowed persistent artifacts for this stage:
- production/test code needed for current phase
- task checkboxes and `Check Evidence` rows in `implementation_plan.md`

Завершение шага:
- После обновления change set и `implementation_plan.md` остановите работу.
- Сообщите пользователю, что текущая фаза готова к validation и следующий переход выполняется через `flow next`.
