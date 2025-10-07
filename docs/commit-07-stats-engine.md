# Commit 07 — feat(stats): Orders Stats Engine (минимальный отчёт)

## Цель
Реализовать минимальный движок расчёта статистики заказов по выбранным датам с агрегацией по SKU и соблюдением всех правил из спецификации.

## Принцип работы
Берём уже нормализованные записи из Redis (сохраняются при парсинге CSV), фильтруем по выбранным датам в MSK, считаем агрегаты по SKU, формируем HTML-отчёт.

## Что сделано

### 1. Чтение нормализованных записей
```javascript
// Читаем из ozon:sess:<uid>:csv → { records, availableDates, ... }
const meta = JSON.parse($('Get CSV Session (records)').first().json.value);
const records = meta.records; // уже нормализованные при парсинге
```

### 2. Конверсия UTC → MSK
```javascript
function parseUtcToMsk(dateStr) {
  const t = Date.parse(dateStr);
  if (Number.isFinite(t)) {
    const d = new Date(t);
    const msk = new Date(d.getTime() + 3*60*60*1000); // UTC+3
    return msk;
  }
  return null;
}
```

**Из спецификации:**
> "Отчёты Ozon: created_at в UTC. Пользователь: Москва (MSK). Конверсия: добавить +3 часа."

### 3. Фильтрация по выбранным датам
```javascript
const selectedSet = new Set(selectedDates); // ["2025-10-02", "2025-10-07"]

const filtered = [];
for(const r of records) {
  const d = parseUtcToMsk(r.created_at);
  if (!d) continue;
  const day = d.toISOString().slice(0,10); // "2025-10-07"
  if (!selectedSet.has(day)) continue;
  filtered.push({ sku, quantity, price, status, date: day });
}
```

### 4. Определение статусов (из спецификации)

**Выручечные статусы:**
```javascript
const STATUS_REVENUE = new Set([
  'доставлен',
  'доставляется',
  'ожидает сборки',
  'ожидает отгрузки'
]);
```

**Статусы отмен (включая возвраты!):**
```javascript
const STATUS_CANCELS = new Set([
  'отменён',
  'возврат'  // ← возвраты входят в отмены!
]);
```

**Из спецификации:**
> "Возвраты включаются в общую сумму отмен (не выделяются отдельно)."

### 5. Агрегация по SKU

```javascript
const bySku = new Map();

for(const row of filtered) {
  if(!bySku.has(row.sku)) {
    bySku.set(row.sku, {
      totalOrders: 0,
      cancellations: 0,
      qtyForAvg: 0,      // для средневзвешенной цены
      sumForAvg: 0,      // для средневзвешенной цены
      totalRevenue: 0
    });
  }
  
  const agg = bySku.get(row.sku);
  
  // Выручечные статусы
  if(STATUS_REVENUE.has(row.status)) {
    agg.totalOrders += row.quantity;
    agg.qtyForAvg   += row.quantity;
    agg.sumForAvg   += row.price * row.quantity;
    agg.totalRevenue += row.price * row.quantity;
  }
  
  // Отмены/возвраты
  if(STATUS_CANCELS.has(row.status)) {
    agg.cancellations += row.quantity;
  }
}
```

### 6. Средневзвешенная цена (из спецификации)

```javascript
const avgPrice = agg.qtyForAvg > 0 
  ? agg.sumForAvg / agg.qtyForAvg 
  : 0;
```

**Из спецификации:**
> "Средняя цена: sum(price * quantity) / sum(quantity) по выручечным статусам."

### 7. Итоговые агрегаты

```javascript
let tOrders = 0, tCanc = 0, tRev = 0;

for(const [sku, a] of bySku.entries()) {
  const avgPrice = a.qtyForAvg > 0 ? a.sumForAvg / a.qtyForAvg : 0;
  skuStats[sku] = {
    totalOrders: a.totalOrders,
    cancellations: a.cancellations,
    avgPrice,
    totalRevenue: a.totalRevenue
  };
  
  tOrders += a.totalOrders;
  tCanc += a.cancellations;
  tRev += a.totalRevenue;
}
```

### 8. Формирование HTML-отчёта

```javascript
function fmt(s) {
  let m = `📊 <b>Статистика заказов</b>\n\n`;
  const dates = Array.isArray(s.date) ? s.date.join(', ') : s.date;
  m += `📅 Даты: ${dates||'—'}\n`;
  m += `⏰ Время: ${s.startTime||'00:00'} - ${s.endTime||'24:00'}\n\n`;
  
  // Если нет данных
  if((s.totalOrders||0) === 0 && (s.totalCancellations||0) === 0) {
    m += 'Нет данных по выбранным датам';
    return m;
  }
  
  // Данные по каждому SKU
  const keys = Object.keys(s.skuStats||{}).sort();
  for(const k of keys) {
    const x = s.skuStats[k];
    m += `<b>${k}</b>\n`;
    m += `  • Заказов: ${x.totalOrders}\n`;
    m += `  • Отмен: ${x.cancellations}\n`;
    m += `  • Средняя цена: ${x.avgPrice.toFixed(2)} ₽\n`;
    m += `  • Сумма: ${x.totalRevenue.toFixed(2)} ₽\n\n`;
  }
  
  // Итоги
  m += `<b>ИТОГО:</b>\n`;
  m += `  • Всего заказов: ${s.totalOrders}\n`;
  m += `  • Всего отмен: ${s.totalCancellations}\n`;
  m += `  • Общая сумма: ${s.totalRevenue.toFixed(2)} ₽`;
  
  return m;
}
```

## Архитектура

```
INPUT от dates_done_guard_and_handoff:
  { user_id, chat_id, selectedDates, session }
         ↓
Get CSV Session (records)
  • Redis: ozon:sess:<uid>:csv
  • Извлекаем { records, availableDates, ... }
         ↓
Calculate Stats
  • Фильтр: records → только selectedDates (MSK)
  • Агрегация по SKU:
    - totalOrders (по STATUS_REVENUE)
    - cancellations (по STATUS_CANCELS)
    - avgPrice (средневзвешенная)
    - totalRevenue (sum price*qty)
  • Итоговые суммы
         ↓
Format Message
  • HTML-форматирование с эмодзи
  • Данные по каждому SKU + итоги
  • Если нет данных → "Нет данных по выбранным датам"
         ↓
Telegram sendMessage (stats)
  • Отдельное сообщение (не редактирует календарь)
  • parse_mode: HTML
```

## Формат входных данных

### От dates_done_guard_and_handoff (commit #6):
```json
{
  "user_id": 123456,
  "chat_id": 123456,
  "selectedDates": ["2025-10-02", "2025-10-07", "2025-10-15"],
  "session": {
    "from": "2025-09-01",
    "to": "2025-10-15",
    "months": ["2025-09", "2025-10"],
    "daysByMonth": { ... },
    "csv_key": "user:123456:uploads:abc123.csv"
  }
}
```

### Из Redis (ozon:sess:<uid>:csv):
```json
{
  "reportType": "FBO",
  "records": [
    {
      "created_at": "2025-10-02T14:30:00",
      "sku": "SKU-12345",
      "quantity": 2,
      "price": 1500,
      "status": "доставлен"
    },
    {
      "created_at": "2025-10-07T09:15:00",
      "sku": "SKU-67890",
      "quantity": 1,
      "price": 2500,
      "status": "отменён"
    }
  ],
  "availableDates": ["2025-10-02", "2025-10-07", ...],
  "totalRecords": 150
}
```

## Формат выходного отчёта

### Пример с данными:
```
📊 Статистика заказов

📅 Даты: 2025-10-02, 2025-10-07, 2025-10-15
⏰ Время: 00:00 - 24:00

SKU-12345
  • Заказов: 15
  • Отмен: 2
  • Средняя цена: 1450.50 ₽
  • Сумма: 21757.50 ₽

SKU-67890
  • Заказов: 8
  • Отмен: 1
  • Средняя цена: 2300.00 ₽
  • Сумма: 18400.00 ₽

ИТОГО:
  • Всего заказов: 23
  • Всего отмен: 3
  • Общая сумма: 40157.50 ₽
```

### Пример без данных:
```
📊 Статистика заказов

📅 Даты: 2025-10-02
⏰ Время: 00:00 - 24:00

Нет данных по выбранным датам
```

## Правила расчёта (из спецификации)

### 1. Конверсия времени
✅ **UTC → MSK:** `created_at` в отчётах UTC, добавляем +3 часа для MSK

### 2. Статусы выручки
✅ **STATUS_REVENUE:**
- доставлен
- доставляется
- ожидает сборки
- ожидает отгрузки

### 3. Статусы отмен
✅ **STATUS_CANCELS (включая возвраты!):**
- отменён
- возврат

### 4. Средневзвешенная цена
✅ **Формула:** `sum(price * quantity) / sum(quantity)`
- Считается **только** по выручечным статусам
- Отмены/возвраты не учитываются в средней цене

### 5. Выручка
✅ **Формула:** `sum(price * quantity)` по выручечным статусам

### 6. Агрегация
✅ **По SKU:** Каждый SKU получает свои метрики
✅ **Общие итоги:** Суммы по всем SKU

## Интеграция с другими компонентами

### Требуется от предыдущих коммитов:

1. **files_session_and_clear** (коммит №2)
   - Должна сохранять `records` в `ozon:sess:<uid>:csv`
   - Формат: `{ reportType, records[], availableDates[], totalRecords }`

2. **dates_done_guard_and_handoff** (коммит №6)
   - Вызывает этот workflow с валидным входом
   - Передаёт: `{ user_id, chat_id, selectedDates, session }`

### Связь с будущими расширениями:

**Сравнение 2+ дат (из спецификации):**
> "При выборе 2+ дат показывать дельту и % изменения"

В текущей версии: базовый отчёт по выбранному набору дат.
Расширение на дельты: следующий коммит (опционально).

## Проверка работоспособности

### 1. Нет данных по выбранным датам
```bash
# Redis: пустые records или нет попаданий
redis-cli GET "ozon:sess:123456:csv"
# → {"records":[],...}

# Результат: "Нет данных по выбранным датам"
```

### 2. Есть данные на 1 дату
```bash
# selectedDates: ["2025-10-07"]
# records: 5 записей с created_at в этот день (MSK)

# Результат: Отчёт с агрегатами по SKU + итоги
```

### 3. Есть данные на 3 даты
```bash
# selectedDates: ["2025-10-02", "2025-10-07", "2025-10-15"]
# records: 50 записей по этим датам

# Результат: Полный отчёт с разбивкой по SKU
```

### 4. Проверка средневзвешенной цены
```
Записи по SKU-12345:
  - 5 шт × 1000₽ = 5000₽ (доставлен)
  - 3 шт × 1500₽ = 4500₽ (доставлен)

Средняя цена:
  (5000 + 4500) / (5 + 3) = 9500 / 8 = 1187.50₽
```

### 5. Проверка возвратов в отменах
```
Записи по SKU-67890:
  - 10 шт (доставлен) → totalOrders += 10
  - 2 шт (отменён) → cancellations += 2
  - 1 шт (возврат) → cancellations += 1
  
Итог: totalOrders=10, cancellations=3
```

## Edge cases

### Нет records в Redis
```javascript
meta = {}; records = [];
→ filtered = [];
→ skuStats = {};
→ totalOrders = 0, totalCancellations = 0
→ "Нет данных по выбранным датам"
```

### Невалидный created_at
```javascript
parseUtcToMsk("invalid") → null
→ запись пропускается (continue)
```

### SKU пустой
```javascript
if(!row.sku) continue;
→ записи без SKU игнорируются
```

### quantity или price = 0
```javascript
quantity: Number(r.quantity||0) → 0
price: Number(r.price||0) → 0
→ не влияет на суммы (0 * price = 0)
```

### Статус не в STATUS_REVENUE и не в STATUS_CANCELS
```javascript
status: "в обработке"
→ игнорируется (не попадает ни в выручку, ни в отмены)
```

## Файлы коммита

```
workflows/
  └─ orders_stats_engine.n8n.json

docs/
  └─ commit-07-stats-engine.md (эта документация)
```

## Обратная совместимость

### Требования к files_session_and_clear:
При сохранении в Redis `ozon:sess:<uid>:csv` **обязательно** включать:
```json
{
  "records": [
    {
      "created_at": "ISO timestamp (UTC)",
      "sku": "string",
      "quantity": number,
      "price": number,
      "status": "string (lowercase)"
    }
  ],
  "availableDates": [...],
  "totalRecords": number
}
```

### Интерфейс от dates_done_guard_and_handoff:
```json
{
  "user_id": number,
  "chat_id": number,
  "selectedDates": string[],
  "session": { ... }
}
```

## Следующие шаги

После этого коммита базовая функциональность статистики работает:
- ✅ Дедупликация UI (коммит №1)
- ✅ Сессии файлов (коммит №2)
- ✅ Рендер календаря (коммит №3)
- ✅ Мультивыбор с лимитом (коммит №4)
- ✅ UX улучшения (коммит №5)
- ✅ Защита от пустого выбора (коммит №6)
- ✅ **Расчёт статистики по выбранным датам (коммит №7)**

**Возможные расширения:**
- Сравнение 2+ дат (дельты и %)
- Экспорт отчёта в CSV
- Графики через Chart.js
- Фильтр по типу отчёта (FBO/FBS)

**Базовый MVP готов к интеграции в основной workflow!** 🎉
