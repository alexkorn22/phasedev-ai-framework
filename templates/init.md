Запомни схему Agentic Engineering Flow для этой сессии.

Этот prompt инициализирует контекст работы:
- не начинай выполнять этапы после него;
- не считай, что нужно автоматически стартовать с Этапа 0;
- нужный этап и его задачу я передам следующим prompt (через команду flow next);
- этапы до текущего могли быть уже пройдены в другой сессии.

Базовый каталог для артефактов изменений: `openspec/changes/<название-доработки>/` в корне проекта.

Используй этот каталог для сохранения и чтения артефактов:
- `prd.md` - утвержденные продуктовые требования;
- `rules.md` - глобальные правила и ограничения;
- `research_facts.md` - факты исследования кодовой базы;
- `architecture/design.md` - главный утвержденный технический дизайн;
- `implementation_plan.md` - план реализации по фазам;
- `validation_findings.md` - замечания validation и статус их исправления.

Схема работы:
0. AI Layer Setup: уточнить требования у пользователя, изучить проект и подготовить `prd.md` и `rules.md`.
1. Research: собрать `research_facts.md` только из подтвержденных фактов.
2. Design: подготовить дизайн-документы для Human Review.
3. Plan: разложить утвержденный дизайн в `implementation_plan.md` для Human Review.
4. Implementation: выполнить одну фазу плана в чистом контексте.
5A. Phase Validation: проверить готовый код одной фазы в multi-phase плане.
5B. Final Validation: проверить весь change set перед PR после всех фаз.
5R. Repair Loop: обработать замечания validation и исправить код/тесты/план/дизайн.
6. Archive: синхронизировать OpenSpec delta specs из archived change в `openspec/specs` и завершить `.flow-archive.json`.

Маршрутизация validation:
- Если в плане одна фаза: `Implementation -> Final Validation`; Phase Validation не запускается отдельно.
- Если в плане несколько фаз: `Implementation -> Phase Validation` для каждой фазы, затем `Final Validation`.
- В нормальном состоянии одновременно может быть только одна фаза со статусом `[~]`.
- После успешной Final Validation следующий `flow next` запускает Archive.

Правила flow:
- Каждый этап использует только нужные входные артефакты.
- Выполнив задачи текущего этапа, запиши результаты в файлы изменений, после чего останови работу и сообщи пользователю о готовности.
- НЕ переходи к следующему этапу самостоятельно. Переход на следующий этап осуществляется только после того, как пользователь запустит команду `flow next` и передаст тебе следующую инструкцию.
- Если в ходе выполнения этапа тебе требуется сделать продуктовый или архитектурный выбор, не пиши код наобум — спроси пользователя через question tool или обычное сообщение и дождись ответа.
- Всегда Используй субагентов, там где это эффективно

## Human Review Formatting Policy

Approval artifacts должны быть удобны для human review, но этот policy не является жестким skeleton.

Для `prd.md`, `rules.md`, `architecture/design.md` и `implementation_plan.md`:
- YAML frontmatter остается первым в файле;
- первая видимая часть документа должна быстро объяснять, что именно пользователь approve-ит;
- сразу после title/intro добавь compact visual review surface; это не является фиксированной секцией и может быть blockquote, 2-5 bullets или компактная table;
- в compact visual review surface используй semantic emoji markers там, где они добавляют сигнал: 📌 approval scope, 🚫 out of scope, ✅ key decision/success, ⚠️ risk/reviewer attention, 🧪 validation, 🔒 security/secret boundary;
- Не оставляй approval artifact как обычную простыню markdown, если semantic visual markers, callouts или grouping явно ускоряют review;
- Используй один основной human language для prose artifact; code identifiers, file paths, commands и source terms оставляй в оригинале;
- Если вопрос влияет на approval artifact, задай его пользователю до записи файла и остановись до ответа;
- не записывай pending open questions в approval artifact как замену вопросу пользователю;
- фиксируй только resolved decisions, accepted assumptions и deferred design-stage decisions, которые не блокируют approval текущего этапа;
- структуру выбирай по содержанию конкретного change, а не по универсальному шаблону;
- не создавай пустые, декоративные или искусственные разделы ради видимости полноты;
- используй headings, короткие абзацы, bullets, tables, blockquotes и bold там, где это ускоряет чтение;
- группируй long flat lists по смысловым категориям, если плоский список становится трудным для review;
- используй callouts для approval scope, out-of-scope границ, reviewer attention, accepted assumptions и deferred decisions, если они есть;
- если есть риски, tradeoffs, accepted assumptions, deferred decisions или out-of-scope границы, сделай их визуально заметными;
- можно использовать эмоджи как смысловые visual markers, если они помогают сканированию;
- не используй эмоджи в YAML frontmatter, командах, file paths, code blocks и machine-readable частях flow;
- сохрани все machine-readable элементы, которые нужны controller: approval fields, `## Test Commands`, phase headings и checkbox statuses.

## Capability / Skill Router Policy

Если в сессии активен один или несколько session routers / skill routers, агент ДОЛЖЕН применить их правила маршрутизации к текущей задаче этапа.

Flow Next задает только stage contract:
- текущий этап;
- входные и выходные артефакты;
- допустимые статусы;
- обязательные форматы;
- условие остановки.

Skills control method; Flow Next controls artifacts and state.

Если active router выбирает skills, используй минимальный релевантный набор для текущего этапа. Не загружай и не применяй все skills подряд.

Агент может использовать любые доступные релевантные skills, session routers и tools для выполнения текущего этапа. Skills и routers отвечают за методику выполнения: research, design, coding, testing, review, audit или repair.

External skills may not create persistent files outside the artifacts allowed by the current stage. If a skill normally writes its own report/file, inline the relevant result into the current stage artifact or final response instead.

Если router отсутствует или пользователь запретил external skills, выполняй stage contract доступными средствами без external skills.

После использования skills агент обязан вернуться к stage contract текущего этапа Flow Next и записать требуемый артефакт.

## Conflict resolution

Если инструкция Flow Next конфликтует с инструкцией дополнительного skill:
1. Не выходи за границы stage contract текущего этапа Flow Next.
2. Не переходи к следующему этапу без новой команды пользователя.
3. Не меняй файлы, которые текущий этап не разрешает менять.
4. Не меняй approvals, statuses или verdicts вне правил текущего stage contract.
5. Если skill требует действие, запрещенное текущим этапом, пропусти это действие и кратко зафиксируй причину.
