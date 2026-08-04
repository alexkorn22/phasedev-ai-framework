# Экстракт: test-quality-method (шаги 1–2 конвейера)

Дата: 2026-08-04. Экстракт Q1–Q106 (агент opus; нумерация агента, не донорские Q-гейты). Фильтры — см. карточку. ECC аудиторского метода не несёт (единственный артефакт `pr-test-analyzer.md` полностью поглощён zuvo).

## Inventory (главное)

| Path | Lines | Verdict |
|---|---|---|
| `zuvo/rules/testing.md` | 624 | **Primary**: классификатор STRONG/WEAK/TAUTOLOGICAL/DEAD; Oracle Independence + dual-oracle; Assertion Strength 5 уровней + гейт 60%; 12 quick-fail паттернов; evidence-требования критичных гейтов; red-flag эвристики; M1–M5 мутации; предикатно-слепой фейк |
| `zuvo/shared/includes/blind-coverage-audit.md` | 139 | **Primary** (целиком): contract-blind правила; 9 видов инвентаря; ownership; 7-значная шкала покрытия; false-positive гардрейлы; reachability |
| `zuvo/shared/includes/gate-registry.md` | 311 | AP1–AP32 канонический каталог анти-паттернов; conditional-триггеры Q20–Q25 |
| `zuvo/shared/includes/test-contract.md` | 239 | Порог N-1/N/N+1; двойное требование error-path; side-effect инвентарь; positive-anchor; отвергнутые источники оракула; pass-through исключение |
| `zuvo/skills/test-audit/SKILL.md` | 607 | Red-flag пре-скан; phantom mocks; coverage completeness с исключениями; suite-aware; калибровки |
| `test-blocklist.md`, `test-mock-safety-{core,js,php}.md`, `test-edge-cases.md`, `test-code-types-core.md`, `test-mutation-probes.md`, `test-quality-gate.md`, `q-scoring-protocol.md`, `quality-gates.md`, `test-inventory-protocol.md` | — | Блокированные паттерны; 7 правил мок-безопасности; edge-чеклист по типам параметров; типы кода; пробы; strengthening-only; evidence-стандарт; N/A-дисциплина |
| `write-tests/agents/*` (blind-coverage-auditor, adversarial-test-reviewer, test-quality-reviewer) | — | Hard Rules аудитора; приоритеты adversarial; «не хвалить тест-файл» |
| `fix-tests/SKILL.md` | 419 | P-каталог смеллов (P-40…P-70, G-43) |
| `write-e2e/references/quality-gates.md` | 124 | Causal oracle (универсальной силы) |
| Отклонено по стоящим решениям | — | Пороги покрытия (80/70/90%), обязательные типы тестов, PASS/FIX/REWRITE и тиры A–D, TDD-цикл, verification-темы |

## Ключевые победители (конденсат; полные формулировки — в SKILL.md, перенесены дословно)

- **Стойка аудитора**: production-first; contract-blind (не читать контракт/самооценку автора/прежние находки до вердикта); прочитать production-файл ДО тест-файла; строгая изоляция недоступна → не заявлять чистый blind-аудит; «green suite ≠ quality»; «evaluate from memory» запрещено; объём — затронутая поверхность, не весь сьют.
- **Инвентарь покрытия**: 9 видов owned-поведения (branch, error_path, fallback, side_effect, callback_forwarding, prop_forwarding, a11y_output, async_state, delegation_contract); ownership (thin delegator — аудит форвардинга, не даунстрима; barrel — N/A); шкала FULL/PARTIAL/NONE/STRUCTURAL_ONLY/PARTIAL-by-constraint/UNREACHABLE/N/A (7-значная авторитетна — 5-значная копия агента устарела); «highest-value missing test» обязан быть достижим при production-ограничениях; гардрейлы от пере-фейла (синхронный мок Suspense → PARTIAL, не NONE); мета-чек «не тестируй молча некорректное поведение — это легитимизирует баги».
- **Oracle Independence**: таблица источников (spec > ручной расчёт литералом > референс-данные > обратная операция; «copied from implementation» — reject); три отвергнутых источника дословно («I ran the function and it returned X», «the code does X*Y so I expect X*Y», «the mock returns X so I check for X»); два вопроса к каждому expected value; dual-oracle для финансов/алгоритмики с флагом при расхождении; pass-through исключение (echo+CalledWith — единственная санкционированная форма, только для чистой делегации).
- **Сила ассертов**: 5 уровней (existence → shape → value → interaction → semantic); гейт: ≥60% ассертов файла уровня 3+; ортогональность силы и происхождения (level-3 toEqual с echo-значением всё равно фейл); классификация STRONG(keep)/WEAK(add value)/TAUTOLOGICAL(replace)/DEAD(delete); >60% слабых+тавтологичных+мёртвых → переписывать с нуля.
- **Критичные проверки** (пять, любой ноль — провал независимо от остального): каждый error-path с конкретным типом И сообщением; все ветви исполнены; тесты импортируют реальный production-код; ассерты проверяют значения, не только счётчики/форму; нет тавтологичных оракулов. Каждая единица — с пруф-строкой file:line; без пруфа — ноль. N/A покидает знаменатель, не входит в числитель; каждый N/A обоснован; злоупотребление N/A → «low-signal audit».
- **Структурные правила**: порог N → тесты N-1/N/N+1 (№1 паттерн boundary-багов); error-path — двойное требование (тип+сообщение И непроизошедшие side effects); side-effect инвентарь (CalledWith в каждом success, not.toHaveBeenCalled в каждом error — №1 пробел первых прогонов); positive-anchor (негативный ассерт без позитивного проходит на undefined); causal oracle («ассерт, который пройдёт при удалённой фиче, — не оракул»); предикатно-слепой DB-фейк инвалидирует scoping-тесты (сеять две конкурирующие строки, ассертить невозвращение чужой).
- **Моки**: лестница real → real+fixtures → fakes → mocks (последний резерв, только внешний I/O); 7 правил безопасности (верифицировать каждый мок позитивно и негативно; сброс между тестами; мок на границе, не внутренний метод; синглтон-состояние; когерентность цепочки; identity при dedup; filtered last-call); phantom mocks (мок незвамого модуля); «permissive mock — тест тестирует мок»; «мок с 10+ стабами → бери реальный класс».
- **Quick-fail (12) и анти-паттерны**: always-true; UI input echo; MSW echo; opaque dispatch; silent skip; wrong initial state; loading-only; тавтологичный оракул; raw .length; vague quantity на известной фикстуре; mock echo; persistent skip без тикета. AP31 (закоммиченный .only — тихий коллапс сьюта) и AP32 (retry-маскировка флаки) — авто-фейлы. Пре-скан: zero expect; fixture:assertion >20:1; 50%+ toBeTruthy-only.
- **Мутационные пробы**: M1–M5 (негировать условие; убрать null-guard; сменить оператор; сменить return; сменить ошибку) — «какой тест это поймает?»; выжившая проба = пробел покрытия, файл не закрывается.
- **Дисциплина фикса**: strengthening only — фикс, удаляющий/ослабляющий ассерт ради оценки, — анти-паттерн; ассерт, упавший после усиления, — production-находка, не тест-правка; максимум 2 прохода аудита, после — честный WARN, не PASS.
- **Разное**: coverage completeness (перечислить публичные методы; исключения: API-endpoint через client.get, page-component через render, re-export'ы не считаются); orphan-тесты; suite-aware режим (сиблинг-файлы одного production — вместе); THIN/STANDARD/COMPLEX калибровка глубины.

## Переадресации и отказы

- Q23 (baseline полного прогона) — уже в `verification-method`.
- Q81 («self-scoring is not an audit») — принцип уже в `verification-method` (Independence), здесь только test-специфика strengthening-only.
- Тул-специфика (vitest hoisted/clearAllMocks, PHPUnit onlyMethods/addMethods, NestJS logger spy, RTL/MSW примеры) → `references/` скилла и ось B.
- Пороги 80/70/90%, PASS/FIX/REWRITE, тиры A–D, «-1 за AP, кап -5», минимальные счётчики тестов — конфликты №1/№3, не перенесены.
- Донор-vs-донор: ECC «positive observations» против zuvo «do not praise the test file» — победил zuvo (похвала — шум в аудите); зафиксировано здесь, в конфликт-лог не выносится (не конфликт со сводом).
