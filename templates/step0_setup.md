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
7. Не записывайте `prd.md` и `rules.md`, пока не закрыты все вопросы, которые влияют на `Intent Card`, requirements, scope boundaries, success criteria, risk envelope, assumptions или test commands.
8. Для `feature` и `experiment` changes обязательно выясните hypothesis/decision need, resolution signal, expected user/business/system impact, decision deadline или причину `not_applicable`.
9. Для `fix`, `refactor` и `infra` changes обязательно выясните desired behavior или target state, preserved behavior, non-goals, regression boundaries, validation evidence и risk boundaries; `Resolution signal` и `Decision deadline` могут быть `not_applicable` только после такого intake.
10. Не заменяйте неизвестные ADLC/PRD поля догадками. Если пользователь не может ответить, зафиксируйте только явно accepted assumption; если assumption влияет на approval scope или risk, остановитесь и попросите approval этого assumption до записи PRD.
11. Создайте папку изменений: `openspec/changes/<название-доработки>/`.
12. Прочитайте artifact template для PRD: [prd.md template]({{prd_template_path}}).
13. Создайте `prd.md` в папке изменений, instantiating этот template под текущий change.
14. Используйте HTML comments из template как authoring guidance; в них задан field/section contract, допустимые значения `Change type`, правила `not_applicable`, ADLC-style intake expectations и blocker-question rule.
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
19. Не оставляйте в `prd.md` пустые ячейки Intent Card, copied field descriptions или placeholder-like prose.
20. Создайте `rules.md` в папке изменений. В начале файла должен быть YAML frontmatter:
---
approved: false
approved_by: ""
date: {{date}}
---
21. В `rules.md` обязательно добавьте раздел `## Test Commands`:
```md
## Test Commands
- unit: `...`
- phase: `...`
- full: `...`
```

Требования к артефактам:
- `prd.md` фиксирует intent, requirements, границы change и критерии успеха.
- `prd.md` должен быть instantiated from [prd.md template]({{prd_template_path}}).
- `rules.md` фиксирует project constraints и gate commands, нужные следующим этапам.
- ИИ-агент не имеет права менять `approved: false` на `approved: true`; approval делает пользователь.

## Human Review Formatting Policy

`prd.md` и `rules.md` являются approval artifacts, поэтому оформляйте их для быстрого human review.

Правила оформления:
- YAML frontmatter остается первым в каждом файле.
- Структуру выбирайте по содержанию конкретного change.
- Первая видимая часть документа должна быстро объяснять, что именно пользователь approve-ит.
- Сразу после title/intro добавьте compact visual review surface; это не фиксированная секция, а 2-5 callouts, bullets или table rows с самым важным для approval.
- В compact visual review surface используйте semantic emoji markers там, где они добавляют сигнал: 📌 approval scope, 🚫 out of scope, ✅ key success/decision, ⚠️ risk/reviewer attention, 🧪 validation, 🔒 security/secret boundary.
- Не оставляйте approval artifact как обычную простыню markdown, если semantic visual markers, callouts или grouping явно ускоряют review.
- Используйте один основной human language для prose artifact; code identifiers, file paths, commands и source terms оставляйте в оригинале.
- Если вопрос влияет на approval artifact, задайте его пользователю и остановитесь до ответа.
- Не записывайте pending open questions в `prd.md` или `rules.md` как замену вопросу пользователю.
- Отделяйте accepted assumptions и deferred design-stage decisions от вопросов, которые требуют ответа до approval.
- Не создавайте пустые, декоративные или искусственные разделы вроде risks/notes/security, если там нет material content.
- Используйте headings, короткие абзацы, bullets, tables, blockquotes и bold там, где это помогает чтению.
- Если список становится длиннее 7 пунктов, сгруппируйте его по смысловым категориям вместо одного long flat list.
- Используйте callouts для approval scope, reviewer attention, out-of-scope границ, accepted assumptions и deferred decisions, если они есть.
- Если есть scope boundaries, accepted assumptions или reviewer attention points, сделайте их визуально заметными near the top.
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
