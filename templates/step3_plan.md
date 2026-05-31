Этап 3. Plan.

Ваша задача — разложить утвержденный технический дизайн на пошаговый план реализации.

Входные артефакты (обязательно прочитайте их):
- Утвержденный дизайн: [design.md]({{design_path}})
- Правила разработки: [rules.md]({{rules_path}})

Инструкция по планированию:
1. Создайте файл плана реализации: [implementation_plan.md]({{plan_path}}).
2. Обязательно вставьте в начало файла YAML frontmatter:
---
approved: false
approved_by: ""
date: {{date}}
---
   - **Важное правило**: ИИ-агент не имеет права изменять `approved: false` на `approved: true`. Это может сделать только пользователь при ручной проверке.

3. Разделите реализацию проекта на последовательные автономные фазы (Phase 1, Phase 2 и т.д.):
   - Каждая фаза должна иметь заголовок вида `## Phase N: <Название фазы> [<статус>]` (например, `## Phase 1: Database Setup [ ]`).
   - Семантика статусов фазы: `[ ]` — не начата, `[~]` — implementation начат или завершен, но нужная validation еще не прошла, `[x]` — фаза прошла нужную validation.
   - В нормальном состоянии одновременно может быть только одна фаза `[~]`.
   - Если вся доработка помещается в одну фазу, flow будет идти `Implementation -> Final Validation` без отдельной Phase Validation.
   - Если фаз несколько, flow будет идти `Implementation -> Phase Validation` для каждой фазы, затем `Final Validation`.
   - **Баланс размера фаз**: Каждая фаза должна полностью выполняться в рамках одной рабочей сессии AI-агента (один автономный запуск/контекст работы агента) без переполнения лимита его контекста. Оптимальный объем фазы — изменение от 3 до 10 файлов. Избегайте избыточного дробления: если вся задача невелика, оформите её в виде одной фазы для одной сессии.
   - Внутри каждой фазы распишите конкретные атомарные задачи с чекбоксами `- [ ] <описание задачи>`.
   - Для каждой фазы укажите критерии готовности (Definition of Done) и точную команду запуска тестов (на основе `rules.md`).
   - Если конкретной фазе нужны дополнительные проверки сверх defaults из `rules.md`, добавьте простой markdown-блок внутри фазы:
```md
Additional checks:
- `...`
- ...
```
     Эти проверки дополняют default commands из `rules.md`, а не заменяют их.

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
- В `implementation_plan.md` сохраните все machine-readable элементы: phase headings, phase status checkboxes, task checkboxes и блок `Additional checks:`.

Завершение шага:
- После записи файла `implementation_plan.md` остановите работу.
- Сообщите пользователю о готовности плана. Объясните, что пользователю необходимо лично проверить файл [implementation_plan.md]({{plan_path}}), изменить `approved: false` на `approved: true` (и вписать имя в `approved_by: "..."`) в его заголовке, а затем запустить команду `flow next`.

## Artifact allowlist

Allowed persistent artifacts for this stage:
- `implementation_plan.md`

{{skill_policy}}
