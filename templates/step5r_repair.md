Этап 5R. Repair Loop.

Stage contract: обработать open findings из validation и подготовить change к повторной validation.

Входные артефакты:
- Отчет валидации: [validation_findings.md]({{findings_path}})
- План реализации: [implementation_plan.md]({{plan_path}})
- Технический дизайн: [design.md]({{design_path}})
- Требования PRD: [prd.md]({{prd_path}})
- Результаты исследования: [research_facts.md]({{research_path}})
- Правила разработки: [rules.md]({{rules_path}})

Список открытых замечаний для исправления:
{{open_findings}}

Правила обработки findings:
- перед началом работы над конкретным finding измените его статус в [validation_findings.md]({{findings_path}}) с `open` на `in_progress`;
- `implementation`: обновите change set в рамках текущего approved design и plan;
- `plan`: обновите [implementation_plan.md]({{plan_path}}), затем обновите affected change set;
- `design`: обновите [design.md]({{design_path}}) и связанные architecture files, затем обновите affected plan/change set;
- `requirements`: после обсуждения с пользователем обновите [prd.md]({{prd_path}}), затем affected design/plan/change set;
- после обработки finding измените его статус на `resolved`.
- не меняйте исходный `Description` у resolved finding: он используется для распознавания повторов;
- для каждого `resolved` finding сохраняйте repair evidence рядом с таблицей: changed area, verification performed, tradeoff.

Правило verdict:
- не меняйте `verdict: repair_required`, пока все findings не имеют статус `resolved`;
- когда все findings `resolved`, установите `verdict: repaired` и обновите дату;
- не устанавливайте `ready` или `ready_with_risks` на Repair Loop этапе.

## Repair Visual Formatting

В `validation_findings.md` можно использовать эмоджи как смысловые visual markers, если они помогают быстро отличать blocking, non-blocking, resolved и informational items.

Правила:
- Visual markers не заменяют machine-readable поля `verdict`, `type`, `Status`, `Class`, `Blocks PR?`, `Phase`.
- не используйте эмоджи в YAML frontmatter.
- не используйте эмоджи в командах, file paths, code blocks и обязательных machine-readable labels.
- Если finding исправлен, сохраняйте историю причины, исправления и проверки; visual marker можно обновить, но текстовый `Status` остается источником истины.

Повторный human approval:
- если во время repair изменили уже утвержденный `prd.md`, `architecture/design.md` или `implementation_plan.md`, измените YAML frontmatter этого артефакта с `approved: true` на `approved: false` и очистите `approved_by`, если поле есть;
- это разрешено только для артефактов, которые действительно изменены в этом repair;
- Для чистого `implementation` repair не меняйте approval-статусы требований, дизайна или плана.

## Artifact allowlist

Allowed persistent artifacts for this stage:
- affected production/test code
- affected approved flow artifacts required by finding class
- `validation_findings.md`

Завершение шага:
- После перевода всех findings в `resolved` и установки `verdict: repaired` остановите работу.
- Сообщите пользователю, что repair готов к повторной validation через `flow next`.

{{skill_policy}}
