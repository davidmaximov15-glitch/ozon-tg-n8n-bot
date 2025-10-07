# Commit 11 — refactor(route): normalize prefixes & unified routers

## Что делает

- **Нормализует все callback-префиксы**: `menu:*`, `file:*`, `cal:*`, `date:*`, `dates:*`, `noop`
- **Вводит два централизованных роутера**:
  - `unified_router_callbacks` — для callback_query
  - `unified_router_messages` — для текстовых команд
- **Роутер только направляет** в соответствующие саб-воркфлоу (не делает бизнес-логику)

## Файлы

```
workflows/
├── unified_router_callbacks.n8n.json
└── unified_router_messages.n8n.json
```

## Нормализованные префиксы callback_data

### Menu (меню):
- `menu:orders` → orders_menu_render
- `menu:calendar` → calendar_ui_header_and_counters
- `menu:upload` → (placeholder, обычно показывает инструкцию)

### File operations:
- `file:clear` → files_session_and_clear

### Calendar navigation:
- `cal:YYYY-MM:prev` → calendar_nav_guard
- `cal:YYYY-MM:next` → calendar_nav_guard

### Date selection:
- `date:YYYY-MM-DD` → dates_toggle_and_limit
- `dates:done` → dates_done_guard_and_handoff
- `dates:reset` → (можно добавить очистку дат)

### Special:
- `noop` → ничего не делает (для disabled кнопок)

## Подключение

### 1) Импорт workflows

Импортируй оба файла в n8n:
- `unified_router_callbacks.n8n.json`
- `unified_router_messages.n8n.json`

### 2) Интеграция в основной workflow

После `telegram_core_access` и `ttl_guard_for_user`:

```
Telegram Update
    ↓
telegram_core_access (нормализация + ACL)
    ↓
ttl_guard_for_user (soft TTL проверка)
    ↓
    ├─ callback_query? → unified_router_callbacks
    └─ message? → unified_router_messages
```

**Пример If node:**
```javascript
// Определяем тип update
const hasCallback = !!$json.context.callback_data;
const hasMessage = !!$json.context.message_text;

// True branch → callback_query
// False branch → message
```

### 3) Обновление кнопок

Убедись, что все места генерации `reply_markup` используют **нормализованные** callback_data:

#### Orders menu (orders_menu_render):
```javascript
{
  inline_keyboard: [
    [{ text: '📅 Открыть календарь', callback_data: 'menu:calendar' }],
    [
      { text: '📥 Загрузить CSV', callback_data: 'menu:upload' },
      { text: '🧹 Очистить файл', callback_data: 'file:clear' }
    ]
  ]
}
```

#### Calendar (calendar_ui_header_and_counters):
```javascript
{
  inline_keyboard: [
    [
      { text: '◀', callback_data: 'cal:2025-06:prev' },
      { text: 'Июнь 2025', callback_data: 'noop' },
      { text: '▶', callback_data: 'cal:2025-06:next' }
    ],
    // Date buttons...
    [{ text: '15', callback_data: 'date:2025-06-15' }],
    // ...
    [{ text: '✅ Готово', callback_data: 'dates:done' }]
  ]
}
```

## Routing Logic

### unified_router_callbacks

**INPUT:**
```json
{
  "context": {
    "user_id": "123456789",
    "chat_id": "123456789",
    "callback_data": "menu:orders",
    "callback_query_id": "abc123..."
  }
}
```

**ROUTING:**
1. Parse `callback_data` с regex/exact match
2. Определяет `route` + `args` (для параметризованных префиксов)
3. Вызывает соответствующий sub-workflow через Execute Workflow node

**OUTPUT (к sub-workflow):**
```json
{
  "route": "menu:orders",
  "args": {},
  "context": { "user_id": "...", "chat_id": "...", "callback_query_id": "..." }
}
```

### unified_router_messages

**INPUT:**
```json
{
  "context": {
    "user_id": "123456789",
    "chat_id": "123456789",
    "message_text": "/start"
  }
}
```

**ROUTING:**
- `/start`, `"заказы"`, `/orders` → `menu:orders`
- `"календарь"`, `/calendar` → `menu:calendar`
- `"очистить"`, `/clear` → `file:clear`
- `"upload"`, `"csv"`, `/upload` → `menu:upload`

## Проверки

### Callback routing:
- ✅ `menu:orders` → отрисовывает Orders панель
- ✅ `menu:calendar` → открывает текущий календарь
- ✅ `file:clear` → очищает сессию
- ✅ `cal:2025-06:prev` → навигация на предыдущий месяц (с guard проверкой)
- ✅ `date:2025-06-15` → toggle выбора даты
- ✅ `dates:done` → запускает статистику
- ✅ `noop` → ничего не делает (тихо)
- ✅ Неизвестная команда → `answerCallbackQuery("Неизвестная команда")`

### Message routing:
- ✅ `/start` → Orders панель
- ✅ `"заказы"` → Orders панель
- ✅ `"календарь"` → календарь
- ✅ `"очистить"` → очистка файла

## Обратная совместимость

**Миграция старых callback'ов:**

Если у тебя остались старые форматы:
- `order:*` → переименуй в `menu:orders`
- `clear_file` → переименуй в `file:clear`
- `calendar:prev` → переименуй в `cal:YYYY-MM:prev`
- `select:2025-06-15` → переименуй в `date:2025-06-15`

Можно добавить fallback-ветку в роутер для плавной миграции.

## Архитектура

```
┌─────────────────────────────────────────────┐
│     Telegram Bot Update (webhook/polling)   │
└─────────────────┬───────────────────────────┘
                  ↓
┌─────────────────────────────────────────────┐
│       telegram_core_access                   │
│  (normalize update + ACL check)             │
└─────────────────┬───────────────────────────┘
                  ↓
┌─────────────────────────────────────────────┐
│       ttl_guard_for_user                     │
│  (soft TTL check, optional cleanup)         │
└─────────────────┬───────────────────────────┘
                  ↓
         ┌────────┴────────┐
         ↓                 ↓
  callback_query?    message?
         │                 │
         ↓                 ↓
┌──────────────────┐ ┌──────────────────┐
│ unified_router_  │ │ unified_router_  │
│   callbacks      │ │   messages       │
└────────┬─────────┘ └────────┬─────────┘
         │                    │
    ┌────┴─────────────────┬──┴──────┬───────────┐
    ↓                      ↓         ↓           ↓
orders_menu        calendar_ui   files_   dates_toggle
  _render           _header     session_     _and_limit
                              and_clear
```

## Зависимости

- **Коммит 02**: `files_session_and_clear.n8n.json`
- **Коммит 04**: `dates_toggle_and_limit.n8n.json`
- **Коммит 05**: `calendar_ui_header_and_counters.n8n.json`
- **Коммит 06**: `dates_done_guard_and_handoff.n8n.json`
- **Коммит 07.5**: `telegram_core_access.n8n.json`
- **Коммит 09**: `orders_menu_render.n8n.json`
- **Коммит 10**: `calendar_nav_guard.n8n.json`

## Преимущества централизованного роутинга

✅ **Единая точка входа** для всех callback/message → легко логировать, отладить  
✅ **Нормализованные префиксы** → меньше багов, легче поддержка  
✅ **Separation of concerns** → роутер не знает бизнес-логику, только направляет  
✅ **Легко добавлять новые routes** → один If node + один Execute Workflow  
✅ **Тестируемость** → можно протестировать роутинг отдельно от бизнес-логики
