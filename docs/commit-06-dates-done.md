# Commit 06 — feat(dates:done): guard & confirm; block stats until dates:done

## Цель
Обработать кнопку "✅ Готово" (dates:done), запретить расчёты если не выбрано ни одной даты, и передать управление в движок статистики только после успешной проверки.

## Принцип
**Никаких автозапусков расчётов "где-то по пути"** — статистика запускается **только** после dates:done и **только** при валидной сессии + выбранных датах.

## Что сделано

### 1. Обработка dates:done
- Ловим `callback_data = "dates:done"`
- Запускаем проверки перед запуском расчётов

### 2. Валидация (guard)
Проверяем два условия:
```javascript
// 1. Есть валидная сессия файла
const hasSession = !!(sess && sess.from && sess.to && Array.isArray(sess.months));

// 2. Выбрана хотя бы одна дата
const hasAtLeastOne = Array.isArray(dates) && dates.length > 0;
```

### 3. Логика ветвления
- **❌ Нет дат** → `answerCallbackQuery("Выберите хотя бы одну дату")` **без редактирования UI**
- **✅ Всё ок** → Передача управления в `orders_stats_engine` (коммит №7)

### 4. Блокировка преждевременных вызовов
- Убраны любые авто-вызовы статистики до dates:done
- Расчёты стартуют **только** через этот саб-воркфлоу

## Архитектура

```
callback_data='dates:done'
         ↓
Check dates:done → Подтверждаем событие
         ↓
┌────────┴─────────┐
│ Get Session      │ (ozon:sess:<uid>:csv)
│ Get Selected     │ (ozon:sess:<uid>:dates)
└────────┬─────────┘
         ↓
Validate Session & Selection
  • hasSession: from/to/months присутствуют?
  • hasAtLeastOne: dates.length > 0?
         ↓
Can Proceed? (IF node)
  ├─ FALSE (нет дат или нет сессии)
  │    ↓
  │  AnswerCallback: "Выберите хотя бы одну дату"
  │  (только toast, UI не трогаем)
  │
  └─ TRUE (всё валидно)
       ↓
     Prepare Stats Input
       ↓
     Call Orders Stats Engine
       • Передаём: { user_id, chat_id, selectedDates, session }
       • Workflow: orders_stats_engine (коммит №7)
```

## Детали реализации

### Check dates:done
```javascript
const { callback_data, user_id, chat_id, callback_query_id } = 
  $('Extract User Data').first().json || {};

return [{ 
  json: { 
    isDone: callback_data === 'dates:done', 
    user_id, 
    chat_id, 
    callback_query_id 
  } 
}];
```

### Validate Session & Selection
```javascript
// Парсим сессию
let sess = {};
try {
  const raw = $('Get Session (csv)').first().json.value;
  sess = raw ? JSON.parse(raw) : {};
} catch(e) {
  sess = {};
}

// Парсим выбранные даты
let dates = [];
try {
  const raw = $('Get Selected Dates').first().json.value;
  dates = raw ? JSON.parse(raw) : [];
} catch(e) {
  dates = [];
}

// Валидация
const hasSession = !!(sess && sess.from && sess.to && Array.isArray(sess.months));
const hasAtLeastOne = Array.isArray(dates) && dates.length > 0;

return [{ 
  json: { 
    hasSession, 
    hasAtLeastOne, 
    session: sess, 
    selectedDates: dates 
  } 
}];
```

### Can Proceed? (IF node)
```json
{
  "conditions": {
    "combinator": "and",
    "conditions": [
      { "leftValue": "={{ $json.hasSession }}", "operator": "true" },
      { "leftValue": "={{ $json.hasAtLeastOne }}", "operator": "true" }
    ]
  }
}
```

**FALSE branch** → AnswerCallback (need at least 1):
```json
{
  "callback_query_id": "...",
  "text": "Выберите хотя бы одну дату",
  "show_alert": false
}
```

**TRUE branch** → Prepare Stats Input + Call Orders Stats Engine

### Prepare Stats Input
```javascript
const base = $('Extract User Data').first().json || {};
const { user_id, chat_id } = base;
const { session, selectedDates } = $json;

return [{ 
  json: { 
    user_id, 
    chat_id, 
    selectedDates, 
    session 
  } 
}];
```

### Формат передачи в orders_stats_engine
```json
{
  "user_id": 123456,
  "chat_id": 123456,
  "selectedDates": ["2025-10-02", "2025-10-07", "2025-10-15"],
  "session": {
    "from": "2025-09-01",
    "to": "2025-10-15",
    "months": ["2025-09", "2025-10"],
    "daysByMonth": {
      "2025-09": [1, 2, 3, ...],
      "2025-10": [1, 2, 7, 15, ...]
    },
    "csv_key": "user:123456:uploads:abc123.csv"
  }
}
```

## Интеграция с другими компонентами

### Требуется от вызывающего
- **Extract User Data** → `{ user_id, chat_id, callback_query_id, callback_data }`

### Взаимодействие с саб-воркфлоу
1. **files_session_and_clear** (коммит №2) — сессия файла должна быть создана
2. **dates_toggle_and_limit** (коммит №4) — выбранные даты должны быть в Redis
3. **orders_stats_engine** (коммит №7) — будет вызван при успешной валидации

### Типичный user flow
```
1. Пользователь загружает CSV → files_session_and_clear создаёт сессию
2. Пользователь выбирает даты → dates_toggle_and_limit сохраняет в Redis
3. Пользователь жмёт "✅ Готово" → dates_done_guard_and_handoff (этот workflow)
   ├─ Нет дат → Toast "Выберите хотя бы одну дату"
   └─ Есть даты → orders_stats_engine запускает расчёты
4. orders_stats_engine (коммит №7) считает и выводит результат
```

## Защита от ошибок (guard conditions)

### 1. Нет сессии файла
```javascript
hasSession = false
→ AnswerCallback: "Выберите хотя бы одну дату"
```
*Пользователь должен сначала загрузить CSV*

### 2. Нет выбранных дат (dates.length === 0)
```javascript
hasAtLeastOne = false
→ AnswerCallback: "Выберите хотя бы одну дату"
```
*Пользователь должен выбрать хотя бы 1 дату из календаря*

### 3. Сессия повреждена (невалидный JSON)
```javascript
try { sess = JSON.parse(raw); } catch(e) { sess = {}; }
→ hasSession = false
→ AnswerCallback
```

### 4. Массив дат повреждён
```javascript
try { dates = JSON.parse(raw); } catch(e) { dates = []; }
→ hasAtLeastOne = false
→ AnswerCallback
```

## Почему так (ссылки на спеку)

### Из вашего плана:
> "dates:done активно только при ≥1 дате; иначе answerCallbackQuery"

✅ **Реализовано:** `hasAtLeastOne` проверяет `dates.length > 0`

> "Блок статистики не должен стрелять сам; запуск строго после dates:done"

✅ **Реализовано:** orders_stats_engine вызывается **только** из этого саб-воркфлоу

> "Никаких автозапусков «где-то по пути»"

✅ **Реализовано:** Убраны все прямые вызовы расчётов, единственный entry point — dates:done

### Архитектурная цепочка:
```
Календарь/мультивыбор (коммиты 3–5)
         ↓
dates:done проверка (этот коммит)
         ↓
Расчёты статистики (коммит 7)
```

## Проверка работоспособности

### 1. Нет выбранных дат
```bash
# Redis: нет ключа или пустой массив
redis-cli GET "ozon:sess:123456:dates"
# → (nil) или "[]"

# Результат: Toast "Выберите хотя бы одну дату"
# UI календаря НЕ редактируется
```

### 2. Есть 1 дата
```bash
redis-cli GET "ozon:sess:123456:dates"
# → ["2025-10-07"]

# Результат: orders_stats_engine получает:
{
  "user_id": 123456,
  "chat_id": 123456,
  "selectedDates": ["2025-10-07"],
  "session": { ... }
}
```

### 3. Есть 3 даты (максимум)
```bash
redis-cli GET "ozon:sess:123456:dates"
# → ["2025-10-02","2025-10-07","2025-10-15"]

# Результат: orders_stats_engine получает все 3 даты
```

### 4. Нет сессии файла
```bash
redis-cli GET "ozon:sess:123456:csv"
# → (nil)

# Результат: Toast "Выберите хотя бы одну дату"
# (технически это означает "сначала загрузите файл")
```

## Edge cases

### Сессия есть, но dates = null
```javascript
dates = null
→ Array.isArray(dates) === false
→ hasAtLeastOne = false
→ Toast
```

### Сессия есть, но months = []
```javascript
Array.isArray(sess.months) === true (пустой массив — валиден)
→ hasSession = true
→ Если есть даты → запускаем stats
```

### Пользователь жмёт "Готово" дважды подряд
```
1-й клик → Запуск orders_stats_engine
2-й клик → Повторный запуск (если даты не сброшены)
```
**Решение:** orders_stats_engine должен показывать новое сообщение, а не редактировать календарь.

## Файлы коммита

```
workflows/
  └─ dates_done_guard_and_handoff.n8n.json

docs/
  └─ commit-06-dates-done.md (эта документация)
```

## Обратная совместимость

### Требования к существующим компонентам:
1. **Extract User Data** — должна извлекать `callback_query_id` (для answerCallbackQuery)
2. **files_session_and_clear** — должна создавать `ozon:sess:<uid>:csv`
3. **dates_toggle_and_limit** — должна сохранять `ozon:sess:<uid>:dates`

### Интерфейс для будущего orders_stats_engine:
```json
{
  "user_id": number,
  "chat_id": number,
  "selectedDates": string[],
  "session": {
    "from": string,
    "to": string,
    "months": string[],
    "daysByMonth": { [month: string]: number[] },
    "csv_key": string
  }
}
```

## Следующие шаги

После этого коммита календарь полностью защищён от преждевременных вызовов:
- ✅ Дедупликация UI (коммит №1)
- ✅ Сессии файлов (коммит №2)
- ✅ Рендер календаря (коммит №3)
- ✅ Мультивыбор с лимитом (коммит №4)
- ✅ UX улучшения (коммит №5)
- ✅ **Защита от пустого выбора (коммит №6)**

**Следующий коммит:** orders_stats_engine — движок расчёта статистики по заказам.
