Этап 5R. Repair Loop.

Stage contract: обработать open findings из validation и подготовить change к повторной validation.

{{skill_policy}}

Входные артефакты:
- Отчет валидации: [validation_findings.md]({{findings_path}})
- План реализации: [implementation_plan.md]({{plan_path}})
- Технический дизайн: [design.md]({{design_path}})
- Требования PRD и ADLC-style Intent Card: [prd.md]({{prd_path}})
- Результаты исследования: [research_facts.md]({{research_path}})
- Правила разработки: [rules.md]({{rules_path}})

{{repair_queue}}

Правила обработки findings:
- перед изменением реестра прочитайте artifact template: [validation_findings.md template]({{validation_findings_template_path}});
- [validation_findings.md]({{findings_path}}) должен строго соответствовать artifact template и strict registry rules из template comments;
- рабочая очередь выше содержит только актуальные blocking findings;
- repair должен сохранять соответствие `Intent Card`, `R#` requirements, scope boundaries, `SC#` success criteria, `Accepted Assumptions`, `Deferred Decisions` и `Risk envelope` из [prd.md]({{prd_path}});
- если finding относится к requirement или success criterion, repair path и обновленная строка finding должны ссылаться на конкретный `R#` или `SC#`;
- если fixing path требует изменить `Generation target`, `Resolution signal`, конкретный `R#`, scope boundaries, конкретный `SC#`, accepted assumptions, deferred decisions или risk envelope из PRD, это `requirements` finding path: обсудите с пользователем и сбросьте approval измененного `prd.md`;
- не удаляйте строки замечаний;
- исправление finding фиксируйте изменением `Status` существующей строки на `resolved`;
- не меняйте стабильные поля существующей строки, если это не нужно для исправления явной ошибки в строке;
- если repair повторно запускает checks или меняет evidence по затронутой фазе, обновите `Check Evidence` в [implementation_plan.md]({{plan_path}});
- в `Check Evidence` используйте только `Result`: `pending`, `passed`, `failed`, `blocked`, `not_applicable`;
- не оставляйте relevant repair evidence в состоянии `pending` или `failed`, кроме внешнего blocker, который зафиксирован как `blocked` с причиной;
- `implementation`: обновите change set в рамках текущего approved design и plan;
- `plan`: обновите [implementation_plan.md]({{plan_path}}), затем обновите affected change set;
- `design`: обновите [design.md]({{design_path}}) и связанные architecture files, затем обновите affected plan/change set;
- `requirements`: после обсуждения с пользователем обновите [prd.md]({{prd_path}}), затем affected design/plan/change set;
- если в table cell нужен символ `|`, он должен быть экранирован как `\|`.

Правило verdict:
- сохраняйте `type` в YAML frontmatter как scope последней validation: `phase` для Phase Validation repair, `final` для Final Validation repair; не сбрасывайте final repair на template default `phase`;
- не меняйте `verdict: repair_required`, пока все актуальные blocking findings не имеют последний статус `resolved`;
- когда все актуальные blocking findings имеют последний статус `resolved`, установите `verdict: repaired` и обновите дату;
- не устанавливайте `ready` или `ready_with_risks` на Repair Loop этапе.

Повторный human approval:
- если во время repair изменили уже утвержденный `prd.md`, `architecture/design.md` или `implementation_plan.md`, измените YAML frontmatter этого артефакта с `approved: true` на `approved: false` и очистите `approved_by`, если поле есть;
- это разрешено только для артефактов, которые действительно изменены в этом repair;
- обновление только task checkboxes, phase status или `Check Evidence` в `implementation_plan.md` не считается изменением approved plan content и не требует сброса approval;
- Для чистого `implementation` repair не меняйте approval-статусы требований, дизайна или плана.

## Artifact allowlist

Allowed persistent artifacts for this stage:
- affected production/test code
- affected approved flow artifacts required by finding class
- `validation_findings.md`

Завершение шага:
- После перевода всех актуальных blocking findings в `resolved` и установки `verdict: repaired` остановите работу.
- Сообщите пользователю, что repair готов к повторной validation через `flow next`.
