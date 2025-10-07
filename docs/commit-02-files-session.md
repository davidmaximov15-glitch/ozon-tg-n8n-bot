# Commit 02 — feat(files): per-user file session + clear-file

## Что делает

1) **После `Parse Report File`** строит и сохраняет сессию:
   - `from`, `to` — первая/последняя дата в данных;
   - `months[]` — список месяцев вида YYYY-MM;
   - `daysByMonth{YYYY-MM: [d,…]}` — только доступные дни;
   - `csv_key` — идентификатор набора.
   → кладём в `ozon:sess:<uid>:csv`.

2) **При новом аплоаде**:
   - чистим `ozon:sess:<uid>:dates` и `ozon:ui:<uid>:calendar_msg_id`, чтобы календарь перерисовывался корректно.

3) **Обработчик `file:clear`**:
   - удаляет `ozon:sess:<uid>:csv`, `ozon:sess:<uid>:dates`, `ozon:ui:<uid>:calendar_msg_id`;
   - отвечает `answerCallbackQuery('Кэш очищен. Загрузите новый отчёт')`.

## Подключение

1. **Импортируй** `workflows/files_session_and_clear.n8n.json` в n8n.

2. **В основном workflow** после узла **Parse Report File** добавь вызов саб-воркфлоу **files_session_and_clear**:
   - Используй Execute Workflow node
   - Входные данные берутся из `Extract User Data` + `Parse Report File`

3. **В роутинге callback'ов** добавь ветку на `file:clear`:
   - Вызывай этот же саб-воркфлоу
   - Он сам распознаёт `file:clear` через узел `Is file:clear?` и выполнит очистку

4. **Проверь меню «Заказы»**:
   - Кнопка «🗑 Очистить файл» уже есть в текущем workflow
   - Проверка наличия файла перед открытием календаря работает:
     - если файла нет → тост «Сначала загрузите файл отчёта»
     - если есть → вычисляется `initial month` и рисуется календарь

## Архитектура саб-воркфлоу

### Часть 1: Build File Session (при загрузке CSV)

```
Parse Report File (availableDates[])
  ↓
Build File Session (from meta)
  - Строит: from, to, months[], daysByMonth{}
  - Генерирует csv_key
  ↓
Has Session? (проверка что dates не пустой)
  ├─ YES → Persist Session (ozon:sess:<uid>:csv)
  │           ↓
  │         Del Selected Dates (reset) — очищаем старые выбранные даты
  │           ↓
  │         Del calendar_msg_id (reset) — сбрасываем старое сообщение
  └─ NO → END (ничего не сохраняем)
```

### Часть 2: Handle file:clear (при нажатии кнопки)

```
Route Message → callback_data = 'file:clear'
  ↓
Is file:clear? (проверка)
  ├─ YES → Del csv (session) — удаляем ozon:sess:<uid>:csv
  │           ↓
  │         Del selected_dates — удаляем ozon:sess:<uid>:dates
  │           ↓
  │         Del calendar_msg_id — удаляем ozon:ui:<uid>:calendar_msg_id
  │           ↓
  │         AnswerCallback (cleared) — тост: "Кэш очищен. Загрузите новый отчёт"
  └─ NO → END
```

## Структура файловой сессии

```json
{
  "csv_key": "csv:123456:1704067200000",
  "from": "2025-09-18",
  "to": "2025-10-31",
  "months": ["2025-09", "2025-10"],
  "daysByMonth": {
    "2025-09": [18, 19, 20, 21, 25, 26, 27, 28],
    "2025-10": [1, 2, 3, 8, 9, 10, 15, 16, 17, 22, 23, 24, 29, 30, 31]
  }
}
```

## Redis ключи

| Ключ | Содержимое | Назначение |
|------|-----------|-----------|
| `ozon:sess:<uid>:csv` | JSON сессии файла | Хранит метаданные загруженного CSV |
| `ozon:sess:<uid>:dates` | JSON массив выбранных дат | Выбор пользователя в календаре |
| `ozon:ui:<uid>:calendar_msg_id` | message_id | ID "живого" сообщения календаря |

## Что проверить после вката

- ✅ **Загрузка нового CSV**:
  - В Redis появляется `ozon:sess:<uid>:csv` с `{from, to, months, daysByMonth, csv_key}`
  - Выбранные даты (`ozon:sess:<uid>:dates`) — очищены
  - `calendar_msg_id` — очищен

- ✅ **menu:orders без файла**:
  - Бот отвечает: «Сначала загрузите файл отчёта»

- ✅ **Нажатие «🗑 Очистить файл»**:
  - Все три ключа удалены из Redis
  - Приходит тост: «Кэш очищен. Загрузите новый отчёт»

## Связь с планом

- ✅ **Сессия файла** `{csv_key, from, to, months[], daysByMonth{}}` в `ozon:sess:<uid>:csv`
- ✅ **Календарь только при валидной сессии** — проверка через `Has Session?`
- ✅ **Кнопка очистки** удаляет `csv`, `dates`, `calendar_msg_id` и показывает сообщение
- ✅ **Меню «Заказы»** выводит «Открыть календарь» и «Очистить файл», диапазон месяцев по `availableDates`

## Следующие шаги

После интеграции:
- **Коммит №3**: Интеграция `ui_orchestrator` в точки календаря/меню
- **Коммит №4**: Универсальный календарный компонент
- **Коммит №5**: Рефакторинг статистики и вычислений
