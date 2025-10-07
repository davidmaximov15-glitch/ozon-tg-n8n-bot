# Commit 10 — fix(navigation): жёсткая защита навигации по месяцам

## Что делает

Добавляет router-гвард для защиты от ручного вызова `cal:YYYY-MM:prev|next`:

1. Парсит `callback_data` формата `cal:YYYY-MM:prev|next`
2. Вычисляет целевой месяц (с учётом направления prev/next)
3. Сравнивает с `minMonth`/`maxMonth` из сессии (`ozon:sess:<uid>:csv`)
4. **Если вне диапазона** → `answerCallbackQuery("Дальше нет данных")` + ничего не рендерим
5. **Если ок** → обновляет `month` и вызывает рендер календаря

## Файлы

```
workflows/
└── calendar_nav_guard.n8n.json
```

## Подключение

1) Импортируй `calendar_nav_guard.n8n.json` в n8n.

2) В роутере callback'ов направь `cal:*` → `calendar_nav_guard`:
   ```
   callback_data matches "cal:*" → executeWorkflow: calendar_nav_guard
   ```

3) Убедись, что `ozon:sess:<uid>:csv` содержит поле `months[]` (коммит 02).

4) В рендере календаря стрелки уже `noop` на краях (коммиты 3/5); этот коммит — **доп. защита** на уровне роутера.

## Проверки

### На первом/последнем месяце:
- Нажимаем ◀/▶ → видим toast «Дальше нет данных»
- UI **не перерисовывается**

### В середине диапазона:
- Навигация работает как прежде
- Календарь перерисовывается с новым месяцем

### Ручной вызов:
- Попытка отправить `cal:2025-01:prev` (если 2025-01 = minMonth) → блокируется
- Попытка отправить `cal:2025-12:next` (если 2025-12 = maxMonth) → блокируется

## Структура данных

### Входные данные (из роутера):
```json
{
  "userId": "123456789",
  "chatId": "123456789",
  "callbackData": "cal:2025-06:prev",
  "callbackQueryId": "abc123..."
}
```

### Redis session (`ozon:sess:<uid>:csv`):
```json
{
  "from": "2025-01-01",
  "to": "2025-12-31",
  "months": ["2025-01", "2025-02", ..., "2025-12"],
  "availableDates": [...]
}
```

### Логика проверки:
- `minMonth = months[0]` → `"2025-01"`
- `maxMonth = months[months.length - 1]` → `"2025-12"`
- `target >= minMonth && target <= maxMonth` → допустимо

## Зависимости

- **Коммит 02**: `files_session_and_clear.n8n.json` (создаёт `months[]`)
- **Коммит 05**: `calendar_ui_header_and_counters.n8n.json` (рендер календаря)
- **Коммит 08**: стандартизация ключей Redis (`ozon:sess:*`)

## Технические детали

### Parse callback_data:
- Regex: `/^cal:(\d{4}-\d{2}):(prev|next)$/`
- Примеры: `cal:2025-06:prev`, `cal:2025-06:next`

### Shift month logic:
```javascript
function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${yy}-${mm}`;
}
```

### If node branches:
- **False branch** (вне диапазона) → `answerCallbackQuery` + stop
- **True branch** (в диапазоне) → `Set Month Context` → `Call calendar_ui_header`
