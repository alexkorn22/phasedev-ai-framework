Этап 5B. Final Validation.

Stage contract: проверить реализованный рабочий код перед Archive.

Validation mode: review-only stage. Этот этап проверяет completeness/correctness review-методами и не является test execution gate.

{{skill_policy}}

Входные артефакты:
- Требования PRD и ADLC-style Intent Card: [prd.md]({{prd_path}})
- Правила разработки: [rules.md]({{rules_path}})
- Утвержденный дизайн: [design.md]({{design_path}})
- План реализации: [implementation_plan.md]({{plan_path}})

Обязательные проверки stage contract:
- для multi-phase плана все фазы в [implementation_plan.md]({{plan_path}}) имеют статус `[x]`;
- для single-phase плана единственная фаза может быть `[~]`, если все ее tasks `[x]` и сейчас выполняется final validation;
- реализованный change set соответствует `Intent Card`, requirements, scope boundaries и success criteria из [prd.md]({{prd_path}});
- `Generation target` из [prd.md]({{prd_path}}) покрыт approved plan/design и фактическим change set;
- `Resolution signal` из [prd.md]({{prd_path}}) покрыт checks/evidence, если он не `not_applicable`;
- `Risk envelope` из [prd.md]({{prd_path}}) не нарушен; если risk acceptance требуется, finding должен быть `RECOMMENDED` или `MUST-FIX` по severity;
- `Accepted Assumptions` из [prd.md]({{prd_path}}) не опровергнуты фактическим change set; если assumption больше не верен, добавьте `requirements` или `design` finding по причине;
- `Deferred Decisions` из [prd.md]({{prd_path}}) resolved only через approved design/plan или остались outside implementation scope; если implementation решил deferred decision самовольно, добавьте finding;
- полнота production/test/source/config changes approved plan-а проверена review-методами без запуска тестов;
- `Generation Bundle` в [implementation_plan.md]({{plan_path}}) проверен против фактического change set: заявленные required areas должны быть выполнены или иметь finding;
- `Check Evidence` для relevant phase scope в [implementation_plan.md]({{plan_path}}) проверен как evidence выполнения Implementation checks;
- если relevant `Check Evidence` отсутствует, остается `pending`, содержит `failed`, или не объясняет `blocked`, добавьте finding с `Class = validation` или более точным class, если есть конкретная implementation/design/plan причина;
- полностью игнорируйте `openspec/**` при поиске implementation findings: не diff, не review и не report любые файлы под `openspec/**` как change set, product code, PR scope или источник замечаний;
- используйте `openspec/changes/<active>` только как read-only входной контракт flow: requirements, rules, approved design, plan и previous validation history;
- тесты и дополнительные проверки из Implementation stage считаются уже успешно пройденными, потому что Implementation не может завершиться с failed tests/checks;
- не запускайте `unit`, `phase`, `full` или дополнительные проверки повторно на этом этапе;
- результат validation записан в [validation_findings.md]({{findings_path}});
- перед записью результата прочитайте artifact template: [validation_findings.md template]({{validation_findings_template_path}});
- YAML frontmatter в [validation_findings.md]({{findings_path}}) должен иметь `type: final` для Final Validation; не оставляйте template default `type: phase`;
- перед поиском новых ошибок прочитайте существующий `validation_findings.md`, если он есть;
- итоговый файл должен строго соответствовать artifact template и strict registry rules из template comments;
- не удаляйте строки замечаний;
- новое замечание добавляйте новой строкой в начало таблицы;
- если finding семантически совпадает с прежним, обновите существующую строку с тем же `ID` и не создавайте дубликат;
- если прежний finding был `resolved`, не меняйте его на `reopened` без нового конкретного evidence из рабочего кода вне `openspec/**`;
- если finding действительно вернулся после repair, отметьте его как reopened по artifact template rules;
- если открытых замечаний нет, все равно сохраните пустую таблицу с header и separator row из artifact template.

Если план состоит из одной фазы и итоговый verdict `ready` или `ready_with_risks`, измените статус этой фазы в [implementation_plan.md]({{plan_path}}) с `[~]` на `[x]`.

Если итоговый verdict `repair_required`, не переводите незавалидированную фазу в `[x]`.

## Artifact allowlist

Allowed persistent artifacts for this stage:
- `validation_findings.md`
- phase status in `implementation_plan.md`, only when allowed by validation verdict

Завершение шага:
- После записи `validation_findings.md` и возможного обновления single-phase статуса остановите работу.
- Сообщите пользователю verdict и следующий переход через `flow next`.
