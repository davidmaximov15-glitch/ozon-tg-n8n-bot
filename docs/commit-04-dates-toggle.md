# Commit 04 — feat(dates): multi-select + limit 3

## Что делает

- Обрабатывает нажатия `date:YYYY-MM-DD`.
- Валидирует, что дата есть в сессии (daysByMonth).
- Тогглит выбранную дату и хранит массив в `ozon:sess:<uid>:dates`.
- Ограничение: максимум 3 даты.
  - При попытке выбрать 4-ю — `answerCallbackQuery('Можно выбрать максимум 3 даты')` без редактирования сообщения.
- После валидного тоггла — перерисовывает календарь (workflow `calendar_render_grid`).

## Подключение

1) **Импортируй** `workflows/dates_toggle_and_limit.n8n.json` в n8n.

2) **В роутере callback'ов** повесь `date:*` → запуск этого саб-воркфлоу.

3) **Убедись, что**:
   - Коммит 2 уже сохраняет `ozon:sess:<uid>:csv` с `daysByMonth`.
   - Коммит 3 уже есть (`calendar_render_grid`): он перерисует UI через `ui_orchestrator`.

## Архитектура

```
callback_data = 'date:YYYY-MM-DD'
         ↓
Parse Callback (date:YYYY-MM-DD)
  - Regex: /^date:(\d{4}-\d{2}-\d{2})$/
  - Извлекает picked дату
         ↓
Get Session (csv) + Get Selected Dates (параллельно)
  - ozon:sess:<uid>:csv → {daysByMonth}
  - ozon:sess:<uid>:dates → [selected dates]
         ↓
Validate Available
  - Проверяет: picked в daysByMonth[YYYY-MM]?
  - isAvailable = true/false
         ↓
Is Available?
  ├─ NO → AnswerCallback (unavailable)
  │       "Эта дата недоступна в отчёте"
  └─ YES → Toggle with Limit (max 3)
            ├─ Уже выбрана? → Удаляем (changed=true, reason='removed')
            ├─ < 3 выбрано? → Добавляем (changed=true, reason='added')
            └─ = 3 выбрано? → Лимит (changed=false, reason='limit')
                  ↓
            Is Limit Hit?
              ├─ YES (changed=false + reason='limit')
              │   → AnswerCallback (limit 3)
              │     "Можно выбрать максимум 3 даты"
              └─ NO (changed=true)
                  → Persist Selected Dates (ozon:sess:<uid>:dates)
                  → Re-render Calendar Grid
                    → calendar_render_grid workflow
                    → UI Orchestrator (editMessageText)
```

## Логика тоггла

### Состояния:

1. **Дата уже выбрана** (`selected.includes(picked)`):
   ```javascript
   selected = selected.filter(d => d !== picked);
   return { changed: true, reason: 'removed', selected };
   ```
   - Удаляем из массива
   - Сохраняем в Redis
   - Перерисовываем календарь (☑ → ▫)

2. **Выбрано < 3, дата не выбрана**:
   ```javascript
   selected.push(picked);
   selected.sort();
   return { changed: true, reason: 'added', selected };
   ```
   - Добавляем в массив
   - Сортируем по датам
   - Сохраняем в Redis
   - Перерисовываем календарь (▫ → ☑)

3. **Выбрано = 3, пытаемся добавить ещё**:
   ```javascript
   if (selected.length >= 3) {
     return { changed: false, reason: 'limit', selected };
   }
   ```
   - Не меняем массив
   - Показываем тост: "Можно выбрать максимум 3 даты"
   - НЕ перерисовываем календарь

4. **Дата недоступна** (не в daysByMonth):
   ```javascript
   isAvailable = false;
   ```
   - Показываем тост: "Эта дата недоступна в отчёте"
   - НЕ меняем массив
   - НЕ перерисовываем календарь

## Формат хранения в Redis

**Ключ:** `ozon:sess:<uid>:dates`

**Значение:** JSON массив отсортированных дат
```json
["2025-09-18", "2025-09-20", "2025-09-25"]
```

**Особенности:**
- Массив всегда отсортирован по возрастанию (`.sort()`)
- Максимум 3 элемента
- Только валидные даты из daysByMonth

## Проверки после вката

- ✅ **Клик по доступному дню**:
  - Дата добавляется/снимается
  - Календарь перерисован (☑ ↔ ▫)
  - В Redis обновлён массив

- ✅ **После 3 выбранных + клик на 4-ю**:
  - Тост: "Можно выбрать максимум 3 даты"
  - Календарь НЕ перерисован
  - Redis НЕ изменён

- ✅ **Клик по недоступному дню** (если как-то прошёл через фронт):
  - Тост: "Эта дата недоступна в отчёте"
  - Календарь НЕ перерисован
  - Redis НЕ изменён

- ✅ **В Redis** по ключу `ozon:sess:<uid>:dates`:
  - Хранится **отсортированный** JSON-массив дат
  - Длина массива ≤ 3
  - Все даты валидные (из daysByMonth)

## Интеграция с другими коммитами

### Зависимости от предыдущих коммитов:

**Коммит 1 (ui_orchestrator):**
- Используется через `calendar_render_grid` → `UI Orchestrator`
- Обеспечивает editMessageText вместо sendMessage

**Коммит 2 (files_session_and_clear):**
- Читает `ozon:sess:<uid>:csv` для валидации (daysByMonth)
- Сохраняет/читает `ozon:sess:<uid>:dates` для выбранных дат

**Коммит 3 (calendar_render_grid):**
- Вызывается через `Re-render Calendar Grid` после каждого валидного тоггла
- Показывает обновлённые ☑/▫ в календаре

### Выходные точки для следующих коммитов:

**Коммит 5:**
- Красивое оформление заголовка с счётчиком
- "Выбрано: 2/3" в хедере календаря

**Коммит 6:**
- Обработка `dates:done` (кнопка "✅ Готово")
- Проверка что выбрано ≥ 1 дата перед подсчётом статистики

## Типичные сценарии

### Сценарий 1: Выбор дат с нуля
```
User → Клик на 18.09
  → Toggle: added → Redis: ["2025-09-18"] → Re-render
User → Клик на 20.09
  → Toggle: added → Redis: ["2025-09-18", "2025-09-20"] → Re-render
User → Клик на 25.09
  → Toggle: added → Redis: ["2025-09-18", "2025-09-20", "2025-09-25"] → Re-render
```

### Сценарий 2: Попытка выбрать 4-ю дату
```
User → Клик на 27.09 (уже выбрано 3)
  → Toggle: limit → Toast: "Можно выбрать максимум 3 даты"
  → Redis не изменён → Календарь НЕ перерисован
```

### Сценарий 3: Снятие выбора
```
User → Клик на 20.09 (была выбрана)
  → Toggle: removed → Redis: ["2025-09-18", "2025-09-25"] → Re-render
  → Теперь можно выбрать ещё одну дату
```

### Сценарий 4: Клик на недоступный день
```
User → Клик на 22.09 (нет в daysByMonth)
  → Validate: isAvailable=false
  → Toast: "Эта дата недоступна в отчёте"
  → Redis не изменён → Календарь НЕ перерисован
```

## Связь с планом

- ✅ **Мультивыбор с лимитом 3** — проверка в узле Toggle with Limit
- ✅ **Хранение в Redis** — `ozon:sess:<uid>:dates` как JSON массив
- ✅ **Валидация доступности** — через daysByMonth из сессии
- ✅ **answerCallbackQuery при лимите** — тост без редактирования
- ✅ **Мгновенная перерисовка** — через calendar_render_grid + ui_orchestrator
- ✅ **Сортированный массив** — `.sort()` после каждого изменения

## Следующие шаги

После интеграции:
- **Коммит №5**: Красивое оформление заголовка + счётчик выбора
- **Коммит №6**: Обработка `dates:done` и проверка минимума
- **Коммит №7**: Навигация между месяцами (`cal:prev/next`)
