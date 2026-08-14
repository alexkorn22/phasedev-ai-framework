# Экстракт: debugging-method (шаги 1–2 конвейера)

Дата: 2026-08-04. Экстракт B1–B200 (агент opus, 30+ файлов). Фильтры применены — см. карточку `cards/debugging-method.md`. Здесь — конденсат; полные формулировки ключевых победителей сохранены дословно.

## Inventory (главное)

| Path | Lines | Verdict |
|---|---|---|
| `zuvo/skills/debug/SKILL.md` | 678 | **Primary** — 5 фаз, minimal repro, baseline, ≤3 гипотезы, error-type playbooks, bisect-трек (B1–B68) |
| `ECC/agents/build-error-resolver.md` | 123 | **Primary** — минимальные фиксы билд-ошибок (B69–B80) |
| `ECC/.agents/skills/agent-introspection-debugging/SKILL.md` | 152 | **Primary** — самодиагностика застрявшего агента (B81–B98) |
| `ECC/agents/network-troubleshooter.md` | 128 | Additional — «причина обязана объяснять ВСЕ симптомы» (B99–B107) |
| `ECC/skills/quality-nonconformance/SKILL.md` | 260 | Additional — RCA-красные флаги, «cannot reproduce ≠ does not exist» (B139–B152) |
| `ECC/commands/build-fix.md` + `.github/prompts/build-fix.prompt.md` | 66+47 | Additional — one-error-at-a-time, полная ошибка не последняя строка (B108–B121) |
| `ECC/agents/*-build-resolver.md` (11 файлов) | ~99–275 | Additional family, дедуплицировано — Key Principles + Stop Conditions (B122–B133) |
| `ECC/skills/orch-fix-defect` | 43+38 | Additional — «proving the bug first is what makes this a fix, not a tweak» (B134–B138) |
| `zuvo/skills/incident/SKILL.md` | 662 | Additional — лестница уверенности root cause (B153–B158) |
| `zuvo` execute/refactor/ship/worktree (baseline-механика) | — | Additional — B159–B171, переадресованы этапу 4 (verification) |
| `zuvo` verification-protocol, test-bugfix-protocol; ECC ci-failure playbook, mle, network-bgp и пр. | — | B172–B200, точечные подборы |

## Ключевые победители (дословно)

### Каркас (zuvo debug)

- B7: пять фаз — REPRODUCE → MINIMAL REPRO → NARROW (baseline) → DIAGNOSE → FIX+VERIFY; альтернативный трек REGRESSION BISECT для «this used to work».
- B9: входы Phase 1 — Expected behavior / Actual behavior / Reproduction steps / Scope ("always, intermittently, for all users, or under specific conditions?") / Timeline ("Was there a recent deploy, config change, or dependency update?").
- B10: "If reproduction is inconsistent, flag as a potential race condition, environment-dependent issue, or test-order dependency."
- B11: "A stack trace proves an error occurred at some point. It does not prove the error is reproducible right now."
- B12: репро-процедура; intermittent → "Run 3 times to confirm flakiness, then proceed with a flaky flag."
- B13: "Skip this phase only when the failure is self-evident (type error visible in code, compilation failure)."
- B14: "Before changing anything, determine whether this is a new regression or a pre-existing problem."
- B15/B16: baseline-процедура (уже падающие тесты, git log по затронутым файлам) и контракт: `BASELINE: [N] passing, [M] failing…; REGRESSION: YES (commit) | NO (pre-existing) | UNKNOWN`.
- B17–B22: порядок сужения: полный трейс ("The root cause is usually earlier in the chain"), логи вокруг момента, недавние изменения, сравнение окружений, бинарный поиск по пути.
- B23–B28: DIAGNOSE — трасса от входа до падения; "Form hypotheses (max 3)... ordered by likelihood"; "If 2 hypotheses fail, pivot: re-read the code path from scratch, add logging, or widen the search scope. Do not keep guessing in the same direction."; "Identify the specific line, condition, or assumption that fails. Distinguish root cause from symptoms."
- B29: таблица error type → typical root causes (undefined/null; wrong value; permission denied; timeout; flaky; works-in-dev-fails-in-prod) — перенесена целиком.
- B30–B33: доменные последовательности API/Frontend/DB/Async — в `references/domain-playbooks.md`.
- B34–B37: "Apply the minimal fix — Address the root cause only. Do not refactor adjacent code"; объяснить связь фикса с диагнозом; side effects; edge cases (null/empty/concurrent/high-load).
- B38–B40: таргетные тесты; сверка с baseline ("No new failures should appear"); "Re-run the exact reproduction... If the bug still occurs, the root cause diagnosis was wrong. Return to Phase 3."
- B42: регрессионный тест: воспроизводит точное условие; ассертит корректное поведение; "Would have caught this bug if it had existed before the original code was written".
- B48–B50: defense-in-depth (entry validation / business-logic invariant / environment guard / debug instrumentation); "if a similar bug occurs in the future, it fails loudly and early rather than silently propagating."
- B51–B61: bisect-трек: when/when-not; репро-тест обязан падать на HEAD; проверка good-коммита ("If the test also fails on the 'good' commit, this is not a regression"); guardrails (>20 шагов → range слишком широк или тест флаки; флаки → сначала чинить флакинес); чтение диффа first-bad-commit; обязательный cleanup.
- B68: tips → влиты в таблицу B29.

### Build errors (ECC)

- B69: "get builds passing with minimal changes — no refactoring, no architecture changes, no improvements."
- B72/B109: собрать ВСЕ ошибки, категоризовать, порядок фиксов по зависимостям (imports/types раньше логики).
- B110/B122/B123: цикл по одной ошибке: read context → diagnose root cause → minimal fix → re-run → новая ошибка = свежий диагноз, не связка.
- B111/B128: стоп-условия: та же ошибка после 3 попыток; фикс порождает больше ошибок, чем чинит; нужны архитектурные изменения; отсутствующие зависимости → решение пользователя.
- B115: "Fix root causes — do not suppress warnings or skip checks."
- B116/B18: полная ошибка, не последняя строка.
- B118/B121/B124/B125: никаких `any`/`@ts-ignore`/`eslint-disable`/приглушений «чтобы позеленело» без документированной причины; "Fix root cause over suppressing symptoms"; "If the error indicates a real architectural problem... stop and report — do not paper over."
- B120: "A single root cause often produces multiple error messages. After fixing, scan for similar patterns elsewhere."

### Самовосстановление застрявшего агента (ECC introspection)

- B89: "is the failure deterministic or transient?"; "what is the smallest reversible action that would validate the diagnosis?"
- B95: порядок интервенций: "1. Restate the real objective in one sentence. 2. Verify the world state instead of trusting memory. 3. Shrink the failing scope. 4. Run one discriminating check. 5. Only then retry."
- B96: анти-паттерн "retrying the same action three times with slightly different wording".

### Универсальные гемы свипа

- B101.4: "Confirm that the suspected cause explains all observed symptoms."
- B140: каждое «почему» подтверждается данными, не мнением.
- B144: "human error is never a root cause — why did the system allow the error?"; красный флаг: "your root cause matches the problem statement reworded."
- B150: 5-почему навязывает одну цепочку — множественные взаимодействующие причины требуют явного перечисления всех.
- B151: "Cannot reproduce ≠ does not exist."
- B155: root cause CONFIRMED = 2+ независимых сигнала согласуются (temporal + code overlap + telemetry/репро); один сигнал — не основание для рискованных действий.
- B135: "Proving the bug exists first is what separates a fix from a tweak."
- B178: если честный регрессионный тест был бы красным на текущем коде — не ослаблять ассерт и не парковать баг: характеризационный тест текущего (бажного) поведения → фикс → флип теста.
- B180.6/B181: "Promote the smallest fix path only when it includes a local reproduction"; "Do not keep rerunning CI until a transient green result appears."
- B193: рискованные зоны (миграции, auth, контракты, деньги) — по одному фиксу за раз, тесты после каждого, ломает — немедленный revert.

## Переадресации (не в этот скилл)

- B159–B166, B170–B171 (baseline-снапшот сессии, pre-existing vs diff-introduced, dirty-tree, WARN-с-доказательствами) → этап 4, `verification-method`/`test-quality-method`.
- B45–B47 (триаж находок adversarial-ревью) → этап 5, `code-review-method`.
- B74, B126, B127, B131, B132 (TS/Dart/Django/Java/React-специфика) → ось B, волна стековых дельт.
- B43–B44, B63–B67 (CQ/Q-пороги, бэклог-протокол, гейт-блоки) — машинка донора, конфликты №3/№4.
- B196 ("write tests for bugs that were found") — территория Test Economy (dev-core).
