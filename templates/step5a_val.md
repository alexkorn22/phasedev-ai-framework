Этап 5A. Phase Validation.

Stage contract: проверить готовность текущей фазы в multi-phase плане.

Validation mode: review-only stage. Этот этап проверяет completeness/correctness review-методами и не является test execution gate.

{{skill_policy}}

Входные артефакты:
- Требования PRD и ADLC-style Intent Card: [prd.md]({{prd_path}})
- Правила разработки: [rules.md]({{rules_path}})
- Утвержденный дизайн: [design.md]({{design_path}})
- План реализации: [implementation_plan.md]({{plan_path}})

Текущая фаза:
{{phase_id}}

Обязательные проверки stage contract:
- соответствие результата текущей фазы approved PRD scope/intent, approved design и criteria из plan;
- текущая фаза не нарушает `Risk envelope`, scope boundaries, accepted assumptions и deferred decisions из [prd.md]({{prd_path}});
- текущая фаза не разрешает deferred PRD decisions и не меняет accepted assumptions вне approved design/plan;
- если текущая фаза заявляет checks, связанные с `Resolution signal`, `Check Evidence` должен отражать их выполнение или объясненный blocker;
- полнота production/test/source/config changes текущей фазы и task statuses текущей фазы проверены review-методами без запуска тестов;
- `Check Evidence` текущей фазы в [implementation_plan.md]({{plan_path}}) проверен как evidence выполнения Implementation checks;
- если relevant `Check Evidence` текущей фазы отсутствует, остается `pending`, содержит `failed`, или не объясняет `blocked`, добавьте finding с `Class = validation` или более точным class, если есть конкретная implementation/design/plan причина;
- полностью игнорируйте `openspec/**` при поиске implementation findings: не diff, не review и не report любые файлы под `openspec/**` как change set, product code, PR scope или источник замечаний;
- используйте `openspec/changes/<active>` только как read-only входной контракт flow: requirements, rules, approved design, plan и previous validation history;
- тесты и дополнительные проверки из Implementation stage считаются уже успешно пройденными, потому что Implementation не может завершиться с failed tests/checks;
- не запускайте тесты и дополнительные проверки повторно на этом этапе;
- результат validation записан в [validation_findings.md]({{findings_path}});
- перед записью результата прочитайте artifact template: [validation_findings.md template]({{validation_findings_template_path}});
- YAML frontmatter в [validation_findings.md]({{findings_path}}) должен иметь `type: phase` для Phase Validation;
- перед поиском новых ошибок прочитайте существующий `validation_findings.md`, если он есть;
- итоговый файл должен строго соответствовать artifact template и strict registry rules из template comments;
- не удаляйте строки замечаний;
- новое замечание добавляйте новой строкой в начало таблицы;
- если finding семантически совпадает с прежним, обновите существующую строку с тем же `ID` и не создавайте дубликат;
- если прежний finding был `resolved`, не меняйте его на `reopened` без нового конкретного evidence из рабочего кода вне `openspec/**`;
- если finding действительно вернулся после repair, отметьте его как reopened по artifact template rules;
- если открытых замечаний нет, все равно сохраните пустую таблицу с header и separator row из artifact template.

Если итоговый verdict `ready` или `ready_with_risks`, измените статус текущей фазы в [implementation_plan.md]({{plan_path}}) с `[~]` на `[x]`.

Если итоговый verdict `repair_required`, оставьте статус текущей фазы `[~]`.

## Artifact allowlist

Allowed persistent artifacts for this stage:
- `validation_findings.md`
- phase status in `implementation_plan.md`, only when allowed by validation verdict

Завершение шага:
- После записи `validation_findings.md` и возможного обновления статуса фазы остановите работу.
- Сообщите пользователю verdict и следующий переход через `flow next`.
