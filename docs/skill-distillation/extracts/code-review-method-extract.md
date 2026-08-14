# Экстракт: code-review-method (шаги 1–2 конвейера)

Дата: 2026-08-04. Экстракт C1–C130 (агент opus, 25+ файлов). Фильтры — см. карточку.

## Inventory (главное)

| Path | Verdict |
|---|---|
| `zuvo/rules/cq-checklist.md` (370) | **Primary**: три состояния оценки (1/0/N/A) + out-of-scope как четвёртое; смыслы CQ1–CQ40; evidence-стандарты (file:function:line, negative evidence, «vague = 0», «all paths not one», «count your claims»); анти-геймингные N/A-правила; таблица валидных/невалидных N/A по каждому гейту; фокус-гейты по типам кода; процедура детекции дублирования. Скоринг-арифметика отклонена |
| `zuvo/shared/includes/agent-preamble.md` (59) | **Primary** (почти целиком): read-only контракт аудитора; evidence-формат (финальный дом V99/V100/V102); модель уверенности 0–25/26–50/51+; scope vs backlog; «не заявляй полноту»; «не повторяй находки других агентов» |
| `zuvo/skills/review/agents/confidence-rescorer.md` (120) | **Primary**: факторы скоринга (критичный гейт +25, конкретное воспроизведение +20, user-visible/money/auth +15, теория −20, покрыто тестами −15, намеренный выбор автора −15); диспозиция; «факторы — ориентиры, не арифметика»; калибровочные примеры |
| `zuvo/shared/includes/adversarial-loop.md` (374, policy-часть) | «Skipped ≠ clean pass»; «ноль находок на диффе 150+ строк подозрителен»; FP-классы verify-then-dismiss (type-disproven, settled-fact, артефакты провайдера); CRITICAL/WARNING без file:line → даунгрейд в INFO с пометкой; фикс-политика по severity; кап known concerns (3); VERIFIED CONTEXT (переоткрытие только с цитатой опровергающего кода; блок из голых утверждений хуже отсутствия блока); false-re-raise check; нерешённый CRITICAL меняет формулировку завершения; «clean pass ≠ доказательство корректности» |
| `zuvo/rules/file-limits.md` (260) | **Primary** (вспомогательный сигнал, конфликт №2): пороги файлов/функций/вложенности/параметров/зависимостей; правила разбиения; контр-правило «что НЕ должно переезжать» (инстанс-API, identity re-exports); переносимость порогов на другие стеки (функции переносятся, файлы — по конвенции проекта, дефолт ≤400) |
| `ECC/agents/code-reviewer.md` (323) | **Primary**: процесс (полный файл + окружение, не ханки); фильтры шума (консолидация похожих, скип стилистики); Pre-Report Gate (4 вопроса); требование трёх доказательств для HIGH/CRITICAL; «ноль находок — валидный и ожидаемый результат; сфабрикованные находки — главный отказ LLM-ревьюеров»; каталог 12 типовых FP; «не удерживай апрув ради видимости строгости»; конвенции проекта важнее общих правил; приоритеты для AI-generated кода |
| `ECC/agents/silent-failure-hunter.md` (59) | Чеклист: пустые catch, потерянный контекст логов, опасные фолбэки (`.catch(() => [])`), потеря стек-трейсов, отсутствие таймаутов/отката |
| `ECC/agents/type-design-analyzer.md` (50) | Четыре измерения: encapsulation / invariant expression / usefulness / enforcement |
| `zuvo/skills/review/SKILL.md` (1239, sweep) | Pre-existing политика (критичные всегда репортить, кап RECOMMENDED); staleness-чек `[ALREADY-PATCHED]`; MUST-FIX/RECOMMENDED/NIT; NIT-субординация; структурные рефакторы → defer с рецептом, не блокер; критично-гейтовый обход фильтра уверенности (=100); per-file оценки, никогда агрегат; «честность о скипе — всё равно скип»; скоуп-забор для repo-wide сканеров с двумя причинными исключениями; самоаттестация vs machine-checked; SELF-REVIEW маркер |
| `zuvo/skills/receive-review/SKILL.md` (340, sweep) | Verify premise before conclusion; критерии fix vs push-back; запрет перформативного согласия («You're absolutely right!»); калибровка доверия по источнику (user high / внешний standard / автоматика skeptical, AI-ревьюер = гипотезы); confidence ≠ importance (B46); pre-existing ≠ skip (B47); truncation ≠ coverage; находка vs заявленный инвариант — не применять молча ни одну сторону |
| Суб-агенты review (behavior/structure/cq-auditor) | Калибровочные примеры (в т.ч. «flagging would be wrong» и «CQ8=0 WRONG — should be N/A»); запреты (не флагать при глобальном exception filter; naming по конвенциям проекта читается до флага; независимая пере-деривация — «не доверяй оценкам лида»; measurement data обязательна для структурных находок) |
| `backlog-protocol.md`, `severity-vocabulary.md`, `cross-provider-review.md`, `quality-gates.md`, `q-scoring-protocol.md`, `code-audit` | Маршрутизация по уверенности + Zero Silent Discards (>25% — в отчёт или бэклог, никогда молча); «higher severity wins» при дублях; подавление secret-FP (комментарии/плейсхолдеры); bounding whack-a-mole (изобретённая конвенция после двух чистых фиксов требует живой call site); деттерминированные tool-находки обходят фильтр; «internally perfect but contradicts a provided constraint = FAIL» |
| `ECC` commands/rules (code-review, review-pr, common) | Семь категорий ревью; таблица решений; ≥80-порог [конфликт с моделью 51+ — разрешено в пользу 51+]; 80% coverage [конфликт №1 — отброшено] |
| `ECC/agents/gan-evaluator.md` | Анти-снисходительность («generous by default — fight it»; «no points for effort»); правила качества фидбэка (каждая находка с «how to fix», quantify, сравнение со спекой, признавать реальные улучшения) |
| Отложено | 20 per-language ревьюеров ECC (3.7k строк) — ось B; provider/CodeSift/artifact-механика — [infra]; plan-reviewer «err on the side of flagging» — НЕ перенесён (противоположность нашей модели; контекст план-ревью) |

## Разрешения противоречий доноров (зафиксированы в карточке)

1. Порог репорта: 51+ (модель уверенности, конфликт №4); ECC «>80%» не вторая шкала — его суть живёт в Pre-Report Gate.
2. Треугольник калибровки: «ноль находок валиден» + «борись со снисходительностью» + «чисто на большом диффе подозрительно» — одна секция.
3. «Ничего не отбрасывать» vs «0–25 отбросить»: 0–25 отбрасывается; 26–50 фиксируется, не репортится; 51+ репортится; выше 25 — никогда молча.
4. Confidence ≠ importance: критичная по классу находка с низкой уверенностью верифицируется, не отбрасывается (исключение фильтра).
5. Донор-vs-донор: MUST-FIX/RECOMMENDED/NIT (zuvo) выбран как словарь severity; CRITICAL/HIGH/MEDIUM/LOW ECC не заводится второй шкалой.
