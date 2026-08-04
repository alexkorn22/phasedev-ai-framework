# Экстракт: tdd-method (шаги 1–2 конвейера)

Дата: 2026-08-04. Фильтры применены — см. карточку `cards/tdd-method.md`.

## Inventory

| Path | Lines | Verdict |
|---|---|---|
| `zuvo/shared/includes/tdd-protocol.md` | 78 | **Primary** — механика цикла (T1–T23); тотальность-строки исключены границей задачи |
| `zuvo/shared/includes/no-pause-protocol.md` | 116 | **Partial** — запрет псевдо-пауз (T24–T42); Post-Cap/watchdog/write-integrity исключены (решение конфликта №5) |
| `zuvo/skills/execute/agents/implementer.md` | 282 | Secondary — только добавляющие детали (T43–T47) |
| `ECC/skills/tdd-workflow/SKILL.md` | 583 | Pre-excluded (конфликт №1: покрытие 80%, тотальность), но извлечена уникальная механика цикла (T48–T54) |
| `ECC/agents/tdd-guide.md`, `ECC/rules/common/testing.md`, шимы/промпты | — | Pre-excluded / дубли без уникальной механики |
| `zuvo` plan/execute/debug/mutation/ship/worktree, test-contract, rules/testing | — | Excluded — чужие темы (план-авторинг, верификация, дебаг, качество тестов) |
| ECC переводы и tool-зеркала | — | Excluded — дубли английских исходников |

## Extracted statements (T1–T54, ключевые)

### `zuvo/shared/includes/tdd-protocol.md`

- T1–T4 (13-16): RED: "Write a test that describes the behavior you are about to implement"; прогнать сьют; "Confirm the new test fails (and fails for the right reason — missing function, wrong return value, etc.)"; "If the test passes immediately, something is wrong. Either the behavior already exists (you do not need to write code) or the test is not testing what you think it is. Investigate before proceeding."
- T5–T8 (20-23): GREEN: "Write only enough production code to make the failing test pass"; "Confirm the new test passes AND all existing tests still pass"; "Do not add functionality beyond what the test requires. If you need more behavior, go back to RED and write another test first."
- T9–T13 (27-32): REFACTOR: duplication/naming/structure в обоих видах кода; "all tests still pass — the refactoring must not change any behavior"; "Then repeat: RED for the next behavior..."
- T14 (38): багфикс: "RED = test that reproduces the bug, GREEN = fix that makes it pass".
- T15 (43): "Pure refactoring where existing tests already cover the behavior and remain green" — валидный случай без нового RED.
- T16–T22 (54-61): таблица red flags: код до теста → стоп, тест первым; проход с первого раза → расследуй; "I'll write the tests after" → тест сейчас; "existing tests cover this" → "Run existing tests with the new code removed. If they pass, the behavior is NOT covered"; "Test exists but never ran red... Delete the production code temporarily, confirm the test fails, then restore"; рефактор сломал тест → откати, либо behavior-preserving, либо новый RED.
- T23 (78): коммит после каждого GREEN-REFACTOR цикла [коммит-ритм — режем по роадмапу, requireIterationCommit].

### `zuvo/shared/includes/no-pause-protocol.md` (принятая часть конфликта №5)

- T24 (3): "When a skill iterates over N items..., it must process ALL of them in one run unless a hard blocker fires."
- T25 (11): "After completing item N in a loop, the orchestrator MUST immediately start item N+1."
- T26–T33 (13-20): запрещено: оценка оставшегося времени; экстраполяция «не влезет в сессию»; меню "(A) continue, (B) stop, (C) different scope"; "do you want me to continue?"; пауза "to be safe"; "split into multiple sessions"; стоп после первого элемента "to validate the approach"; ожидание подтверждения между элементами одобренного батча.
- T34 (22): "The plan / scope / file list was already approved at the entry gate. That approval covers ALL items. Asking again is approval-gate fatigue and burns the user's time and tokens."
- T35–T37 (28-36): валидные стопы: все элементы в терминальном состоянии; явный interrupt пользователя; "If none of these fired: keep going."
- T39 (88): "Do NOT halt with 'I think this is enough for one session'. That is not a valid reason."
- T40–T41 (95-105): ❌/✅ примеры (по 3-5); правильный ритм: "Task 1/21 COMPLETED. Starting Task 2/21."
- T42 (116): "The loop continuation behavior is non-negotiable — it is the contract with the user."

### `zuvo/skills/execute/agents/implementer.md`

- T44 (117): "Confirm it fails for the RIGHT reason (missing function, wrong return value — not a syntax error or import failure)"
- T45 (119): проход сразу → "stop... Investigate."
- T46 (129): "If existing tests break: fix the regression before proceeding."
- T43 (109), T47 (280): порядок шагов плана; не стейджить с падающими тестами [принадлежит фреймворку/верификации — фильтр 1].

### `ECC/skills/tdd-workflow/SKILL.md` (уникальная механика)

- T49 (159-168): валидный RED: **Runtime RED** (таргет компилируется, тест реально исполнен, результат RED) или **Compile-time RED** (тест впервые инстанцирует/трогает отсутствующий код-путь, и провал компиляции — сам сигнал); провал вызван целевым багом/отсутствующей реализацией, а не посторонним синтаксисом/сетапом/зависимостями.
- T50 (170): "A test that was only written but not compiled and executed does not count as RED."
- T51 (172): "Do not edit production code until this RED state is confirmed."
- T52–T53 (198-200): перегнать тот же таргет после фикса → GREEN; "Only after a valid GREEN result may you proceed to refactor."
- T48 (157), T54 (79-82): "RED gate for all production changes" [тотальность — режем]; коммит-структура [коммит-ритм — режем].
