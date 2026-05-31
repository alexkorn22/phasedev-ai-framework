# Agentic Engineering Flow

`Agentic Development Flow` управляет поэтапной работой ИИ-агента над изменением в проекте. Контроллер не выполняет работу сам: он определяет текущий этап, печатает точный контракт этапа и задает допустимые артефакты, статусы и условия остановки.

Главный принцип: flow хранит состояние в файлах проекта, а не в истории переписки. Поэтому любой этап можно выполнить в новой сессии агента, если передать ему `flow init`, а затем текущий `flow next`.

## Артефакты

Активное изменение хранится в `<projectPath>/openspec/changes/<change-name>`.

Основные файлы:

- `prd.md`: требования, границы задачи и критерии успеха.
- `rules.md`: правила разработки, ограничения и команды проверок.
- `research_facts.md`: подтвержденные факты исследования кодовой базы.
- `architecture/design.md`: утвержденный технический дизайн.
- `implementation_plan.md`: фазы реализации и task checkboxes.
- `validation_findings.md`: замечания проверки, итоговый вердикт и состояние исправлений.
- `openspec/specs`: итоговые спецификации после архивации.
- `openspec/flow-ralph`: журналы автоматического Ralph-раннера.

## Этапы

Flow использует такие этапы:

- `0. AI Layer Setup`: подготовить `prd.md` и `rules.md`.
- `1. Research`: собрать факты из кодовой базы.
- `2. Design`: подготовить документы дизайна для проверки человеком.
- `3. Plan`: разложить дизайн на фазы в `implementation_plan.md`.
- `4. Implementation`: выполнить текущую фазу.
- `5A. Phase Validation`: проверить одну фазу в многофазном плане.
- `5B. Final Validation`: проверить весь набор изменений перед архивацией.
- `5R. Repair Loop`: исправить замечания из проверки.
- `6. Archive`: обновить спецификации по archived change и завершить archive state.

Контроллер сам выбирает следующий этап по текущему состоянию файлов. Не нужно передавать номер этапа вручную.

## Ручной режим

Перейдите в папку контроллера:

```bash
cd /Users/oleksandrkorniienko/WORK/ag-dev-flow
```

Установите зависимости перед первым запуском Ralph-раннера:

```bash
npm install
```

Инициализируйте сессию агента:

```bash
bun run src/flow-cli.ts init --project-path /absolute/project
```

Затем получите текущий контракт этапа:

```bash
bun run src/flow-cli.ts next --project-path /absolute/project
```

Для ручного CLI можно передать другой config:

```bash
bun run src/flow-cli.ts next --project-path /absolute/project --config /absolute/path/to/config.yaml
```

Обычный ручной цикл:

1. Выполнить `flow init` в новой сессии агента.
2. Выполнить `flow next`.
3. Передать напечатанный prompt агенту.
4. Дождаться завершения этапа.
5. Если контроллер просит human approval, проверить файл и изменить `approved: false` на `approved: true`.
6. Для следующего этапа открыть новую сессию агента и снова выполнить `flow init`, затем `flow next`.

Пример для проекта, которым управляет flow:

```bash
bun run src/flow-cli.ts init --project-path /absolute/project
bun run src/flow-cli.ts next --project-path /absolute/project
```

## Ralph-раннер

Ralph-раннер автоматизирует ручной цикл со сбросом контекста.

Правило запуска: один этап равен одной новой сессии Codex.

В каждой итерации раннер делает следующее:

1. Создает новую сессию Codex.
2. Отправляет prompt из `flow init`.
3. Отправляет текущий prompt из `flow next`.
4. Ждет завершения контракта этапа.
5. Записывает журнал.
6. Закрывает эту сессию и больше ее не использует.
7. Повторяет цикл с новой сессией.

Раннер не привязан к номерам этапов. Он каждый раз спрашивает существующий контроллер flow, какой prompt сейчас актуален, и передает его Codex. Если flow дошел до архивации и `.flow-archive.json` переведен в `completed`, раннер останавливается со статусом `archived`.

Запуск:

```bash
npm run flow:ralph -- --project-path /absolute/project
```

Пример:

```bash
npm run flow:ralph -- --project-path /absolute/project
```

Можно передать другой config:

```bash
npm run flow:ralph -- --project-path /absolute/project --config /absolute/path/to/config.yaml
```

## Конфигурация

Настройки находятся в `config.yaml` в корне этого репозитория:

```text
/Users/oleksandrkorniienko/WORK/ag-dev-flow/config.yaml
```

```yaml
codex:
  default:
    model: gpt-5.4 # варианты: gpt-5.4, gpt-5.4-mini, gpt-5.3-codex, gpt-5.2
    reasoningEffort: high # варианты: minimal, low, medium, high, xhigh

  stages:
    implementation:
      model: gpt-5.4
      reasoningEffort: high
      skills:
        routers: []
        main:
          - dev-core
          - incremental-implementation
          - test-driven-development
        additional:
          - api-and-interface-design
    final_validation:
      model: gpt-5.4
      reasoningEffort: high
    archive:
      model: gpt-5.4
      reasoningEffort: medium

  sandboxMode: workspace-write # варианты: workspace-write, danger-full-access; workspace-write = полный доступ на запись внутри проекта
  approvalPolicy: never # варианты: never, on-request, on-failure, untrusted
  networkAccessEnabled: false # варианты: true, false
  streamAgentOutput: true # варианты: true, false; true = печатать полный streaming вывод Codex agent в консоль

loop:
  maxIterations: 10 # максимум сессий этапов за один запуск
  stopOnNoProgress: true # защита от бесконечного цикла, если этап не продвинул состояние flow
  logDir: openspec/flow-ralph # путь относительно projectPath
```

`codex.default` задает модель и уровень reasoning по умолчанию. `codex.stages` позволяет переопределить их для отдельных этапов: `setup`, `research`, `design`, `plan`, `implementation`, `phase_validation`, `final_validation`, `repair`, `archive`. Если этап не указан в `codex.stages`, используется `codex.default`.

`codex.stages.<stage>.skills` задает строгий список external skills для prompt текущего этапа. `routers` читаются первыми, если указаны. `main` — основной допустимый пул, `additional` — запасной допустимый пул. Агент не должен предварительно читать все skill bodies; он выбирает минимальный нужный набор по evidence этапа. Если нужного skill нет в `routers`, `main` или `additional`, агент должен остановиться и попросить обновить config или явно разрешить исключение.

Skills не наследуются из `codex.default`: каждый stage должен перечислять их явно. Если `skills` пустой или отсутствует, prompt этапа запрещает external skills без отдельного разрешения пользователя.

`flow init` и текущий `flow next` внутри одной сессии этапа используют одну и ту же модель: модель выбирается по этапу, который вернул `flow next`.

Рекомендуемый режим прав: `workspace-write`. Он дает агенту право писать внутри папки проекта, но не открывает полный доступ ко всей системе. `danger-full-access` используйте только если сознательно принимаете этот риск.

Во время работы раннер печатает текущий этап и настройки модели:

```text
[FLOW RALPH] iteration 1/10
[FLOW RALPH] stage: implementation
[FLOW RALPH] model: gpt-5.4
[FLOW RALPH] reasoning: high
[FLOW RALPH] active change: /absolute/project/openspec/changes/add-auth
[FLOW RALPH] starting Codex session...
[FLOW RALPH] running flow init...
[CODEX flow init] turn.started
[CODEX flow init] reasoning: ...
[CODEX flow init] turn.completed usage: input=..., cached=..., output=..., reasoning=...
[FLOW RALPH] flow init completed
[FLOW RALPH] running stage: implementation
[CODEX implementation] command: bun test
[CODEX implementation] command output:
...
[CODEX implementation] file_change: completed update openspec/changes/add-auth/validation_findings.md
[CODEX implementation] agent_message:
...
[FLOW RALPH] stage completed: implementation
```

Если `codex.streamAgentOutput: true`, Codex streaming выводится полностью: reasoning summary, команды, aggregated output команд, изменения файлов, tool calls, web search, todo list, финальные сообщения агента и usage. Если поставить `false`, в консоли останутся только сообщения `[FLOW RALPH]`, а Codex turn будет выполняться в buffered-режиме. Полный скрытый chain-of-thought модели не выводится, потому что Codex SDK его не раскрывает.

## Журналы

Раннер пишет JSONL-журналы в:

```text
<projectPath>/openspec/flow-ralph
```

В журнале фиксируются:

- номер итерации;
- id сессии Codex;
- текущий этап;
- модель и уровень reasoning;
- активное изменение до и после этапа;
- snapshot состояния flow до и после этапа;
- итоговый ответ агента;
- статус итерации.

Журналы не пишутся в папку активного изменения, чтобы не загрязнять артефакты flow.

## Проверки с участием человека

Некоторые этапы намеренно останавливаются на human review.

Типичные approval artifacts:

- `prd.md`;
- `rules.md`;
- `architecture/design.md`;
- `implementation_plan.md`.

Если контроллер печатает `[FLOW CONTROLLER] BLOCKED`, раннер всегда останавливается до запуска Codex. Агент не должен автоматически менять `approved: false` на `approved: true`.

После проверки файла человеком:

1. Измените YAML frontmatter на `approved: true`.
2. При необходимости заполните `approved_by`.
3. Запустите раннер снова:

```bash
npm run flow:ralph -- --project-path /absolute/project
```

## Проверка и Repair Loop

Проверка записывает результат в `validation_findings.md`.

Основные verdict:

- `ready`: blocking findings нет.
- `ready_with_risks`: есть только non-blocking findings.
- `repair_required`: есть blocking findings, failed gates или недостаточно evidence.
- `repaired`: этап исправления завершил работу и нужна повторная проверка.

Если найден `repair_required`, следующий `flow next` отправит агента в Repair Loop. После исправления Ralph-раннер стартует новую сессию Codex, снова выполнит `flow init`, затем текущий `flow next`, и проверка будет повторена.

Ralph-раннер защищает validation/repair цикл от простого зацикливания. После Repair Loop он запоминает blocking findings, которые были переведены в `resolved`, по semantic signature из `type`, `Phase`, `Class` и нормализованного `Description`. Если следующая Phase Validation или Final Validation снова открывает такой же blocking finding, раннер останавливается со статусом `blocked` и причиной вида `Repeated validation finding after repair: ...`.

Для этой защиты validation prompts требуют сохранять прежний `ID` и близкое исходное `Description` для семантически того же finding. Если finding вернулся после repair, validation должна поставить `Status` = `reopened` и добавить в `Description` только префикс `reopened/regression: ` перед прежним текстом. Repair Loop не должен менять issue-текст `Description` у resolved finding; evidence по исправлению пишется рядом с таблицей: changed area, verification performed и tradeoff.

## Архивация

После успешной Final Validation контроллер начинает Archive stage внутри обычного `next`:

1. `bun run src/flow-cli.ts next --project-path /absolute/project` проверяет `validation_findings.md`, что `type: final`, `verdict: ready` или `ready_with_risks`, и все фазы в `implementation_plan.md` имеют `[x]`.
2. До печати prompt контроллер переносит active change из `openspec/changes/<change-name>` в `openspec/changes/archive/<YYYY-MM-DD>-<change-name>`.
3. В archived change создается pending-state файл `.flow-archive.json` со статусом `in_progress`.
4. Prompt архивации ссылается уже на archived change path.
5. Агент создает delta specs в `openspec/changes/archive/<YYYY-MM-DD>-<change-name>/specs`, разбивая их по функциональным областям (`specs/<capability>/spec.md`), обновляет `openspec/specs`, затем меняет `.flow-archive.json` на `status: "completed"`.

Отдельного archive script и отдельной archive-команды нет. Повторный `flow next` при незавершенном archive stage находит pending `.flow-archive.json` и печатает тот же Archive prompt для уже archived change. Это позволяет возобновить archive stage после сбоя без потери active change.

Раннер считает работу завершенной, когда pending-state файл archived change имеет `status: "completed"`.

Проверка TypeScript:

```bash
npm run typecheck
```

## Решение проблем

Если проект не является git-репозиторием:

- Codex SDK ожидает рабочую директорию внутри git-репозитория.
- Запускайте раннер на настоящем проекте с `.git`.

Если Codex CLI не авторизован:

- SDK не сможет стартовать агента.
- Авторизуйте Codex CLI обычным способом и повторите запуск.

Если не хватает test command:

- Проверьте `rules.md`.
- Должен быть раздел:

```markdown
## Test Commands
- unit: `...`
- phase: `...`
- full: `...`
```

Если план невалиден:

- Проверьте `implementation_plan.md`.
- Фазы должны идти последовательно с `Phase 1`, `Phase 2` и так далее.
- Только одна фаза может иметь статус `[~]`.
- Каждая фаза должна иметь хотя бы один task checkbox.

Если раннер остановился с `no_progress`:

- Агент не изменил состояние flow за сессию этапа.
- Проверьте последний JSONL-журнал в `openspec/flow-ralph`.
- Частая причина: агент задал вопрос пользователю, не смог выполнить команду или уперся в недоступную среду.

Если раннер остановился с `max_iterations`:

- Flow не дошел до архивации за `loop.maxIterations`.
- Увеличьте лимит в `config.yaml`, если этапов действительно больше.

Если раннер остановился на blocker:

- Это штатное поведение.
- Проверьте сообщение контроллера, выполните проверку человеком или исправьте указанную проблему, затем запустите раннер снова.
- Если причина blocker начинается с `Repeated validation finding after repair`, проверьте конфликт между исправлениями: одно repair-изменение могло восстановить прежний blocking finding. В этом случае нужен human decision: изменить design/plan, принять риск или выполнить более широкий repair.
