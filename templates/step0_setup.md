Этап 0. AI Layer Setup.

Stage contract: подготовить начальные артефакты change.

{{skill_policy}}

Вход:
- описание задачи/доработки из текущего контекста;
- правила и ограничения пользователя для этой задачи;
- проектный репозиторий;
- доступные пользователю уточнения, если описание задачи недостаточно для требований.

Обязательные действия:
1. Сначала запросите у пользователя описание задачи/доработки, если его еще нет в контексте, и остановитесь до ответа.
2. Затем отдельным запросом запросите правила и ограничения для этой задачи, если их еще нет в контексте, и остановитесь до ответа.
3. Не создавайте `prd.md` и `rules.md`, пока оба пункта не получены: описание задачи и правила/ограничения задачи.
4. Проведите PRD intake перед созданием файлов: максимально выясните у пользователя intent, expected outcome, generation target, success/resolution signal, scope boundaries, non-goals, risk envelope, constraints, validation expectations, accepted assumptions и deferred decisions.
5. Используйте question tool для intake-вопросов, если он доступен; если question tool недоступен, задавайте вопросы обычным сообщением и останавливайтесь до ответа.
6. Задавайте вопросы пакетами по 1-3 коротких вопроса за раз, чтобы не перегружать пользователя, но продолжайте intake столько раундов, сколько нужно для закрытия material ambiguity.
7. Не записывайте `prd.md` и `rules.md`, пока не закрыты все вопросы, которые влияют на `Intent Card`, `R#` requirements, `SC#` success criteria, `In scope:` / `Out of scope:`, risk envelope, assumptions или test commands.
8. Для `feature` и `experiment` changes обязательно выясните hypothesis/decision need, resolution signal, expected user/business/system impact, decision deadline или причину `not_applicable`.
9. Для `fix`, `refactor` и `infra` changes обязательно выясните desired behavior или target state, preserved behavior, non-goals, regression boundaries, validation evidence и risk boundaries; `Resolution signal` и `Decision deadline` могут быть `not_applicable` только после такого intake.
10. Не заменяйте неизвестные ADLC/PRD поля догадками. Если пользователь не может ответить, зафиксируйте только явно accepted assumption; если assumption влияет на approval scope или risk, остановитесь и попросите approval этого assumption до записи PRD.
11. Создайте папку изменений: `openspec/changes/<название-доработки>/`.
12. Прочитайте artifact templates для PRD и Rules: [prd.md template]({{prd_template_path}}), [rules.md template]({{rules_template_path}}).
13. Создайте `prd.md` в папке изменений, instantiating этот template под текущий change.
14. Используйте HTML comments из template как authoring guidance; в них задан strict PRD contract, field/section contract, допустимые значения `Change type`, правила `not_applicable`, ADLC-style intake expectations и blocker-question rule.
15. Удалите все HTML comments из финального `prd.md`.
16. В начале `prd.md` должен быть YAML frontmatter:
---
approved: false
approved_by: ""
date: {{date}}
---
17. В `prd.md` обязательно заполните `## Intent Card` реальными значениями для текущего change:
   - `Change type`;
   - `User or business intent`;
   - `Generation target`;
   - `Resolution signal`;
   - `Decision deadline`;
   - `Risk envelope`.
18. Для обычных fix/refactor/infra changes поля `Resolution signal` и `Decision deadline` могут быть `not_applicable`, но строки нельзя удалять.
19. `prd.md` должен иметь строго такую видимую структуру и только ее: `# PRD`, затем `## Intent Card`, `## Approval Summary`, `## Requirements`, `## Scope Boundaries`, `## Success Criteria`, `## Accepted Assumptions`, `## Deferred Decisions`.
20. Не добавляйте в `prd.md` другие `##` sections вроде `Risks`, `Notes`, `Open Questions`, `Validation`, `Non-goals` или `Security`; если такой смысл нужен, поместите его в один из разрешенных разделов.
21. Не добавляйте в `prd.md` заголовки `###` или глубже; дополнительную информацию пишите только внутри разрешенных sections через списки, таблицы или короткие абзацы.
22. В `## Intent Card` таблица должна содержать только предусмотренные строки в фиксированном порядке; `Resolution signal` используйте только для hypotheses/experiments/future decision и не повторяйте `Success Criteria`; для обычных задач ставьте `not_applicable`, если verification полностью покрыта `SC#`.
23. В `## Requirements` используйте machine-readable пункты `R1: ...`, `R2: ...`; в `## Success Criteria` используйте `SC1: ...`, `SC2: ...`.
24. В `## Scope Boundaries` обязательно добавьте явные строки `In scope:` и `Out of scope:`.
25. `## Accepted Assumptions` и `## Deferred Decisions` могут быть `None`, если их нет.
26. Если информации не хватает для `R#`, `SC#`, `In scope:` / `Out of scope:` или `Intent Card`, задайте вопрос и не пишите `prd.md`.
27. Не оставляйте в `prd.md` пустые ячейки Intent Card, copied field descriptions, placeholder-like prose, `TBD`, `TODO`, `unknown`, `clarify later` или `to be decided`.
28. Создайте `rules.md` в папке изменений, instantiating [rules.md template]({{rules_template_path}}) под текущий change.
29. Используйте HTML comments из template как authoring guidance, но удалите все comments из финального `rules.md`.
30. В начале `rules.md` должен быть YAML frontmatter:
---
approved: false
approved_by: ""
date: {{date}}
---
31. `rules.md` должен иметь строго такую видимую структуру и только ее: `# Rules`, затем `## Test Commands`.
32. В `rules.md` обязательно заполните раздел `## Test Commands`:
```md
## Test Commands
- unit: `...`
- phase: `...`
- full: `...`
```

Требования к артефактам:
- `prd.md` фиксирует intent, `R#` requirements, границы change и `SC#` criteria в строгой структуре без дополнительных sections.
- `prd.md` должен быть instantiated from [prd.md template]({{prd_template_path}}).
- `rules.md` фиксирует gate commands, нужные следующим этапам, и должен быть instantiated from [rules.md template]({{rules_template_path}}).
- ИИ-агент не имеет права менять `approved: false` на `approved: true`; approval делает пользователь.

## Human Review Formatting Policy

`prd.md` и `rules.md` являются approval artifacts, поэтому оформляйте их для быстрого human review.

Правила оформления:
- YAML frontmatter остается первым в каждом файле.
- Для `prd.md` не выбирайте структуру по содержанию: используйте только строгий PRD contract из template.
- Первая видимая часть `prd.md` после `# PRD` должна быть `## Intent Card`; approval context пишите внутри разрешенных sections.
- Compact visual review surface для `prd.md` разрешен только как строки/списки/таблицы внутри `## Approval Summary`, без новых headings.
- В compact visual review surface используйте semantic emoji markers там, где они добавляют сигнал: 📌 approval scope, 🚫 out of scope, ✅ key success/decision, ⚠️ risk/reviewer attention, 🧪 validation, 🔒 security/secret boundary.
- Не оставляйте approval artifact как обычную простыню markdown, если semantic visual markers, callouts или grouping явно ускоряют review.
- Используйте один основной human language для prose artifact; code identifiers, file paths, commands и source terms оставляйте в оригинале.
- Если вопрос влияет на approval artifact, задайте его пользователю и остановитесь до ответа.
- Не записывайте pending open questions в `prd.md` или `rules.md` как замену вопросу пользователю.
- Отделяйте accepted assumptions и deferred design-stage decisions от вопросов, которые требуют ответа до approval.
- Не создавайте в `prd.md` любые дополнительные sections вроде risks/notes/security; material content распределяйте по разрешенным sections.
- В `prd.md` не используйте headings кроме строго разрешенных; короткие абзацы, bullets, tables, blockquotes и bold можно использовать только внутри разрешенных sections.
- Если список становится длиннее 7 пунктов, сгруппируйте его по смысловым категориям вместо одного long flat list.
- Для `prd.md` используйте только разрешенные sections: scope boundaries пишите в `## Scope Boundaries`, assumptions в `## Accepted Assumptions`, deferred decisions в `## Deferred Decisions`, reviewer attention в `## Approval Summary`.
- Можно использовать эмоджи как смысловые visual markers, если они помогают сканировать документ.
- не используйте эмоджи в YAML frontmatter.
- не используйте эмоджи в командах, file paths, code blocks и обязательных machine-readable labels.
- В `rules.md` сохраните все machine-readable элементы раздела `## Test Commands` без декоративного форматирования внутри команд.

## Artifact allowlist

Allowed persistent artifacts for this stage:
- change folder `openspec/changes/<название-доработки>/`
- `prd.md`
- `rules.md`

Завершение шага:
- После создания `prd.md` и `rules.md` остановите работу.
- Сообщите пользователю, что он должен проверить файлы, установить `approved: true` и затем запустить `flow next`.
