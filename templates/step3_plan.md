Этап 3. Plan.

Ваша задача — разложить утвержденный технический дизайн на пошаговый план реализации.

{{skill_policy}}

Входные артефакты (обязательно прочитайте их):
- Требования PRD и ADLC-style Intent Card: [prd.md]({{prd_path}})
- Утвержденный дизайн: [design.md]({{design_path}})
- Правила разработки: [rules.md]({{rules_path}})

Инструкция по планированию:
1. Прочитайте artifact template: [implementation_plan.md template]({{implementation_plan_template_path}}).
2. Создайте файл плана реализации: [implementation_plan.md]({{plan_path}}), instantiating этот template под текущий change.
3. Используйте HTML comments из template как authoring guidance, но удалите все comments из финального `implementation_plan.md`.
4. Не меняйте `approved: false` на `approved: true`; approval делает только пользователь.
5. Разделите реализацию на последовательные автономные фазы:
   - каждая фаза, включая единственную, проходит `Implementation -> Phase Validation`;
   - после успешной Phase Validation всех фаз flow идет в `Final Validation`;
   - каждая фаза должна полностью выполняться в рамках одной рабочей сессии AI-агента без переполнения контекста;
   - оптимальный объем фазы — изменение от 3 до 10 файлов; не дробите маленький change искусственно.
6. Не создавайте generic `Definition of Done`; phase completion определяется task/subtask checkboxes и required checks по artifact template.
7. Заполните `## Generation Bundle` в [implementation_plan.md]({{plan_path}}); для каждой области используйте только `yes`, `no` или `not_applicable` и коротко объясните решение.
8. План должен trace-ить `Intent Card` из [prd.md]({{prd_path}}):
   - `Generation Bundle` должен соответствовать `Generation target` и `Risk envelope`;
   - phase sequencing должен покрывать каждый `R#`, каждый `SC#` и approved design;
   - checks/evidence должны покрывать `Resolution signal`, если он не `not_applicable`;
   - если `Risk envelope` требует rollout, observability или rollback path, соответствующие строки `Generation Bundle` не должны быть `not_applicable`.
9. План должен явно связать фазы, tasks, checks и `Check Evidence` с конкретными `R#` и `SC#`; не используйте обобщенные ссылки вроде "all requirements" без IDs.
10. План должен учитывать `Accepted Assumptions` и `Deferred Decisions` из PRD:
   - accepted assumptions становятся constraints для sequencing, task scope и checks;
   - deferred decisions из PRD должны быть явно resolved by approved design или mapped to конкретную plan boundary/task/check;
   - не планируйте работу на silent assumptions, которых нет в PRD/design.
11. Если approved design или plan decomposition не покрывает `Generation target`, `Resolution signal`, конкретный `R#`, конкретный `SC#`, accepted assumptions или risk envelope из PRD, остановитесь и попросите пользователя пересогласовать PRD/design вместо создания неполного плана.
12. Для каждой фазы добавьте `### Check Evidence` сразу после `### Checks`; все строки evidence изначально должны иметь `Result = pending`, кроме явно неприменимых checks с `not_applicable`.
13. Не используйте task checkboxes внутри `Check Evidence`; evidence rows должны быть обычными markdown table rows, чтобы не смешиваться с executable tasks.

## Human Review Formatting Policy

`implementation_plan.md` является approval artifact, поэтому оформляйте его для быстрого human review.

Правила оформления:
- YAML frontmatter остается первым в файле.
- Структуру выбирайте по содержанию конкретного change.
- Первая видимая часть документа должна быстро объяснять порядок фаз и что именно пользователь approve-ит.
- Сразу после title/intro добавьте compact visual review surface; это не фиксированная секция, а 2-5 callouts, bullets или table rows с самым важным для approval.
- В compact visual review surface используйте semantic emoji markers там, где они добавляют сигнал: 📌 approval scope, 🚫 out of scope, ✅ key decision/success, ⚠️ risk/reviewer attention, 🧪 validation, 🔒 security/secret boundary.
- Не оставляйте approval artifact как обычную простыню markdown, если semantic visual markers, callouts или grouping явно ускоряют review.
- Используйте один основной human language для prose artifact; code identifiers, file paths, commands и source terms оставляйте в оригинале.
- Если вопрос влияет на approval artifact, задайте его пользователю и остановитесь до ответа.
- Не записывайте pending open questions в `implementation_plan.md` как замену вопросу пользователю.
- Отделяйте accepted assumptions и deferred design-stage decisions от вопросов, которые требуют ответа до approval.
- Не создавайте пустые, декоративные или искусственные разделы, если они не помогают review.
- Используйте headings, короткие абзацы, bullets, tables, blockquotes и bold там, где это помогает чтению.
- Если список становится длиннее 7 пунктов, сгруппируйте его по смысловым категориям вместо одного long flat list.
- Используйте callouts для approval scope, reviewer attention, sequencing risks, accepted assumptions и deferred decisions, если они есть.
- Если есть sequencing risks, accepted assumptions, dependencies или reviewer attention points, сделайте их визуально заметными near the top.
- Можно использовать эмоджи как смысловые visual markers, если они помогают сканировать документ.
- не используйте эмоджи в YAML frontmatter.
- не используйте эмоджи в командах, file paths, code blocks и обязательных machine-readable labels.
- не используйте эмоджи в machine-parsed заголовках фаз `## Phase N: <Название фазы> [<статус>]`.
- В `implementation_plan.md` сохраните все machine-readable элементы из artifact template.

Завершение шага:
- После записи файла `implementation_plan.md` остановите работу.
- Сообщите пользователю о готовности плана. Объясните, что пользователю необходимо лично проверить файл [implementation_plan.md]({{plan_path}}), изменить `approved: false` на `approved: true` (и вписать имя в `approved_by: "..."`) в его заголовке, а затем запустить команду `flow next`.

## Artifact allowlist

Allowed persistent artifacts for this stage:
- `implementation_plan.md`
