# Commit 03 — feat(calendar): 7×5 grid + month bounds

## Что делает

- Заменяет «Generate Date Keyboard» на **Render Calendar Grid** (7×5).
- Делает кликабельными только доступные даты (из `daysByMonth[month]`).
- Стрелки ◀/▶ отключаются на краях диапазона (меняются на `noop`).
- Выводит клавиши «✅ Готово» и «↺ Сброс».
- Все отрисовки идут через **UI Orchestrator (send-or-edit)** из коммита №1.

## Подключение

1. **Импортируй** `workflows/calendar_render_grid.n8n.json` в n8n.

2. **Соедини после блока**:
   - `Ensure Month (smart)` / `Calc Initial Month`
   - `Fetch Session (csv)` и `Get Selected Dates`

3. **Удали/отключи** старый «Generate Date Keyboard».

4. **Убедись, что по нажатию**:
   - `cal:YYYY-MM:prev|next` → роутер меняет `month`, затем снова запускает `Render Calendar Grid`
   - `date:YYYY-MM-DD` → обрабатывает тоггл и **после валидной операции** заново вызывает `Render Calendar Grid` (без `sendMessage`)
   - `dates:done` / `dates:reset` → остаются как в плане; «done» будет включён в коммитах 4–6

5. **Все отрисовки** идут через **UI Orchestrator (send-or-edit)** (коммит 1).

## Архитектура

```
Fetch Session (csv) → ozon:sess:<uid>:csv
         +
Get Selected Dates → ozon:sess:<uid>:dates
         ↓
Prepare Calendar Model
  - Собирает: chat_id, user_id, from, to, month, minMonth, maxMonth
  - Выбранные даты: selectedDates[]
  - Доступные дни месяца: availDays[] (из daysByMonth[month])
         ↓
Render Calendar Grid
  - Заголовок: "📅 Даты по отчёту\nЗагружено: from — to\nМесяц: month"
  - Навигация: [◀/▪] [month] [▶/▪]
    - hasPrev/hasNext проверяют month vs minMonth/maxMonth
    - Если на краю → ▪ с callback_data='noop'
  - Сетка 7×5:
    - Идём по дням 1..total (daysInMonth)
    - Для каждого дня проверяем:
      - Есть в availDays → кликабельный (☑ если выбран, ▫ если нет)
      - Нет в availDays → приглушённый • с noop
      - day > total → пустая ячейка ▫ с noop
  - Кнопки: [✅ Готово] [↺ Сброс]
         ↓
UI Orchestrator (send-or-edit)
  - Вызывает саб-воркфлоу из коммита 1
  - Делает editMessageText для существующего сообщения
  - Или sendMessage если сообщения нет
```

## Формат сетки 7×5

Пример для сентября 2025 (30 дней):

```
[◀] [2025-09] [▶]

[▫ 01] [▫ 02] [▫ 03] [▫ 04] [▫ 05] [▫ 06] [▫ 07]
[▫ 08] [▫ 09] [▫ 10] [▫ 11] [▫ 12] [▫ 13] [▫ 14]
[▫ 15] [▫ 16] [▫ 17] [☑ 18] [☑ 19] [☑ 20] [☑ 21]
[• 22] [• 23] [• 24] [☑ 25] [☑ 26] [☑ 27] [☑ 28]
[• 29] [• 30] [  ▫] [  ▫] [  ▫] [  ▫] [  ▫]

[✅ Готово] [↺ Сброс]
```

**Легенда:**
- `▫ DD` — доступный день, не выбран (кликабельный: `date:YYYY-MM-DD`)
- `☑ DD` — доступный день, выбран (кликабельный: `date:YYYY-MM-DD`)
- `• DD` — день вне данных (нет в availableDates) → `noop`
- `▫` (пустая ячейка) — заполнение сетки до 7×5 → `noop`
- `▪` — заблокированная стрелка на краю диапазона → `noop`

## Логика callback_data

| Действие | callback_data | Обработка |
|----------|--------------|-----------|
| Клик по доступному дню | `date:YYYY-MM-DD` | Toggle + сохранение + re-render |
| Клик по недоступному дню | `noop` | Игнорируется |
| Стрелка влево (есть prev) | `cal:YYYY-MM:prev` | Вычислить предыдущий месяц + re-render |
| Стрелка влево (на краю) | `noop` | Игнорируется |
| Стрелка вправо (есть next) | `cal:YYYY-MM:next` | Вычислить следующий месяц + re-render |
| Стрелка вправо (на краю) | `noop` | Игнорируется |
| Готово | `dates:done` | Обработка выбора (коммит 4-6) |
| Сброс | `dates:reset` | Очистка выбранных дат + re-render |

## Проверки после вката

- ✅ **На первом месяце** (month === minMonth):
  - Стрелка влево: `▪` с `callback_data='noop'`
  
- ✅ **На последнем месяце** (month === maxMonth):
  - Стрелка вправо: `▪` с `callback_data='noop'`

- ✅ **Дни без данных** (не в availableDates):
  - Показываются как `• DD` с `callback_data='noop'`
  - Клик не работает

- ✅ **Пустые ячейки** в конце месяца:
  - Заполнение до 7×5: `▫` с `callback_data='noop'`

- ✅ **Сообщение в чате** остаётся **одним**:
  - Грид перерисовывается через `editMessageText`
  - UI Orchestrator из коммита 1 управляет send-or-edit логикой

## Интеграция с существующими узлами

### Входные зависимости:
- `Extract User Data` → chat_id, user_id
- `Ensure Month (smart)` / `Calc Initial Month` → month, minMonth, maxMonth
- `Fetch Session (csv)` → {from, to, months[], daysByMonth{}}
- `Get Selected Dates` → selectedDates[]

### Выходные данные:
- `Render Calendar Grid` → {chat_id, text, reply_markup}
- `UI Orchestrator` → отправка/редактирование сообщения

### Замена старых узлов:
- ❌ Удалить: `Generate Date Keyboard` (старая логика)
- ❌ Удалить: Прямые `sendMessage` для календаря
- ✅ Использовать: `Render Calendar Grid` + `UI Orchestrator`

## Связь с планом

- ✅ **Замена** `Generate Date Keyboard` → `Render Calendar Grid`
- ✅ **Навигация** и `noop` на краях (minMonth/maxMonth)
- ✅ **Модель** `{from, to, months, daysByMonth}` из сессии
- ✅ **Только валидные даты** кликабельны (из daysByMonth[month])
- ✅ **7×5 сетка** с заполнением пустых ячеек
- ✅ **Приглушённые дни** (•) для дат вне данных

## Следующие шаги

После интеграции:
- **Коммит №4**: Обработка навигации (`cal:prev/next`) и тоггла дат
- **Коммит №5**: Красивое оформление заголовка + счётчик выбора
- **Коммит №6**: Валидация лимитов и обработка «Готово»
