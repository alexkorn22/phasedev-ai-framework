Этап 2. Design.

Stage contract: подготовить утверждаемый architecture package на основе требований и research facts.

Входные артефакты:
- Требования PRD: [prd.md]({{prd_path}})
- Правила разработки: [rules.md]({{rules_path}})
- Результаты исследования: [research_facts.md]({{research_path}})

Обязательный выходной артефакт:
- [architecture/design.md]({{design_path}})

`architecture/design.md` является обязательной точкой входа для design stage и единственным design approval gate.

Дополнительные architecture files внутри `architecture/` разрешены, если design становится слишком большим для одного файла. Примеры: `data-flow.md`, `api-contracts.md`, `ui-architecture.md`, `migration-plan.md`.

Требования к `architecture/design.md`:
- YAML frontmatter:
---
approved: false
approved_by: ""
date: {{date}}
---
- краткое summary решения;
- список design decisions;
- открытые риски и вопросы;
- ссылки на все дополнительные architecture files, если они созданы.

Все referenced files внутри `architecture/` считаются частью утвержденного дизайна, если они явно перечислены в approved `architecture/design.md`.

Controller проверяет approval только у `architecture/design.md`; отдельный approval для architecture subdocuments не требуется.

## Artifact allowlist

Allowed persistent artifacts for this stage:
- `architecture/design.md`
- linked files inside `architecture/`, only when they are referenced from `architecture/design.md`

Ограничения:
- не изменяйте production code на этом этапе;
- ИИ-агент не имеет права менять `approved: false` на `approved: true`; approval делает пользователь.

## Human Review Formatting Policy

`architecture/design.md` является approval artifact, поэтому оформляйте его для быстрого human review.

Правила оформления:
- YAML frontmatter остается первым в файле.
- Структуру выбирайте по содержанию конкретного change.
- Первая видимая часть документа должна быстро объяснять, какое technical direction пользователь approve-ит.
- Сразу после title/intro добавьте compact visual review surface; это не фиксированная секция, а 2-5 callouts, bullets или table rows с самым важным для approval.
- В compact visual review surface используйте semantic emoji markers там, где они добавляют сигнал: 📌 approval scope, 🚫 out of scope, ✅ key decision/success, ⚠️ risk/reviewer attention, 🧪 validation, 🔒 security/secret boundary.
- Не оставляйте approval artifact как обычную простыню markdown, если semantic visual markers, callouts или grouping явно ускоряют review.
- Используйте один основной human language для prose artifact; code identifiers, file paths, commands и source terms оставляйте в оригинале.
- Если вопрос влияет на approval artifact, задайте его пользователю и остановитесь до ответа.
- Не записывайте pending open questions в `architecture/design.md` как замену вопросу пользователю.
- Отделяйте accepted assumptions и deferred design-stage decisions от вопросов, которые требуют ответа до approval.
- Не создавайте пустые, декоративные или искусственные разделы вроде risks/alternatives/security, если там нет material content.
- Используйте headings, короткие абзацы, bullets, tables, blockquotes и bold там, где это помогает чтению.
- Если список становится длиннее 7 пунктов, сгруппируйте его по смысловым категориям вместо одного long flat list.
- Используйте callouts для approval scope, reviewer attention, changed contracts, risks, accepted assumptions и deferred decisions, если они есть.
- Если есть material risks, tradeoffs, accepted assumptions, changed contracts или reviewer attention points, сделайте их визуально заметными near the top.
- Можно использовать эмоджи как смысловые visual markers, если они помогают сканировать документ.
- не используйте эмоджи в YAML frontmatter.
- не используйте эмоджи в командах, file paths, code blocks и обязательных machine-readable labels.
- В `architecture/design.md` сохраните все machine-readable элементы approval frontmatter и явно перечислите linked architecture files, если они входят в approved design.

Завершение шага:
- После записи architecture package остановите работу.
- Сообщите пользователю, что нужно проверить `architecture/design.md`, установить `approved: true` и затем запустить `flow next`.

{{skill_policy}}
