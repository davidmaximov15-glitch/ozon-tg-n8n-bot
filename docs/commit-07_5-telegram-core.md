# Commit 07.5 — refactor(core): Telegram Core Access (sub-workflow)

## Цель
Централизовать обработку Telegram апдейтов и ACL-проверки в переиспользуемый саб-воркфлоу без побочных эффектов.

## Зачем этот рефакторинг

### Проблемы до рефакторинга:
- Логика извлечения user_id/chat_id разбросана по workflow
- ACL-проверки дублируются в разных местах
- Трудно переиспользовать в других ботах
- Смешение нормализации данных и бизнес-логики

### После рефакторинга:
✅ **Единая точка нормализации** Telegram апдейтов  
✅ **Централизованный ACL** (superuser/admin/whitelist)  
✅ **Чистая функция** без побочных эффектов  
✅ **Переиспользуемый** компонент для любых Telegram ботов  
✅ **Чёткий контракт** входа/выхода  

## Что делает

### 1. Нормализация апдейтов
Принимает сырой Telegram `update` и извлекает унифицированный контекст:

```javascript
const msg = u.message || u.edited_message || u.channel_post || null;
const cbq = u.callback_query || null;

// Единый контекст для всех типов апдейтов
{
  user_id: number,
  chat_id: number,
  message_text: string | null,
  callback_data: string | null,
  document: object | null,
  callback_query_id: string | null
}
```

### 2. ACL-проверки
Читает списки из Redis и выставляет флаги:

```javascript
const is_superuser = su.includes(ctx.user_id);
const is_admin     = is_superuser || ad.includes(ctx.user_id);
const in_whitelist = is_superuser || is_admin || wl.includes(ctx.user_id);
```

**Иерархия прав:**
```
superuser ⊃ admin ⊃ whitelist
```

### 3. Валидация доступа
Проверяет `requireWhitelist` и возвращает результат:

```javascript
// Доступ разрешён:
{ ok: true, context: { ...ctx, is_superuser, is_admin, in_whitelist } }

// Доступ запрещён:
{ ok: false, reason: 'not_whitelisted', context: { ...ctx, ... } }
```

## Архитектура

```
INPUT: { update, requireWhitelist?: boolean }
         ↓
Extract & Normalize Update
  • message / callback_query / edited_message / channel_post
  • Унификация в единый context
         ↓
┌────────┴─────────┐ (параллельно)
│ Redis: superuser │ (ozon:acl:superuser)
│ Redis: admin     │ (ozon:acl:admin)
│ Redis: whitelist │ (ozon:acl:whitelist)
└────────┬─────────┘
         ↓
Compute ACL Flags
  • is_superuser: user_id in superuser[]
  • is_admin: is_superuser || user_id in admin[]
  • in_whitelist: is_admin || user_id in whitelist[]
         ↓
Allowed? (IF node)
  • Check: in_whitelist || !requireWhitelist
  ├─ FALSE → Return (denied): { ok: false, reason: 'not_whitelisted' }
  └─ TRUE  → Return (allowed): { ok: true, context: {...} }
```

## Контракт

### Вход (INPUT)
```json
{
  "update": {
    "update_id": 123456,
    "message": {
      "message_id": 789,
      "from": { "id": 123456, "first_name": "John" },
      "chat": { "id": 123456 },
      "text": "/start"
    }
  },
  "requireWhitelist": true
}
```

**Параметры:**
- `update` (обязательный) — сырой Telegram update из Telegram Trigger
- `requireWhitelist` (опциональный, default: true) — требовать проверку whitelist

### Выход (OUTPUT)

#### Успех (ok: true):
```json
{
  "ok": true,
  "context": {
    "user_id": 123456,
    "chat_id": 123456,
    "message_text": "/start",
    "callback_data": null,
    "document": null,
    "callback_query_id": null,
    "is_superuser": false,
    "is_admin": false,
    "in_whitelist": true
  }
}
```

#### Отказ (ok: false):
```json
{
  "ok": false,
  "reason": "not_whitelisted",
  "context": {
    "user_id": 999999,
    "chat_id": 999999,
    "message_text": "/start",
    "callback_data": null,
    "document": null,
    "callback_query_id": null,
    "is_superuser": false,
    "is_admin": false,
    "in_whitelist": false
  }
}
```

## Redis ACL Keys

### Формат хранения
Все три ключа хранят JSON-массивы `user_id`:

```bash
# ozon:acl:superuser
redis-cli SET "ozon:acl:superuser" "[123456, 789012]"

# ozon:acl:admin
redis-cli SET "ozon:acl:admin" "[345678, 901234]"

# ozon:acl:whitelist
redis-cli SET "ozon:acl:whitelist" "[567890, 234567, 890123]"
```

### Пример значений:
```json
// ozon:acl:superuser
[123456, 789012]

// ozon:acl:admin
[345678, 901234]

// ozon:acl:whitelist
[567890, 234567, 890123]
```

### Альтернативное хранение (Redis SET)
Если у вас ACL хранятся через тип SET:

```bash
SADD ozon:acl:superuser 123456 789012
SADD ozon:acl:admin 345678 901234
SADD ozon:acl:whitelist 567890 234567 890123
```

**Замените три ноды Redis Get на:**
- `SMEMBERS ozon:acl:superuser`
- `SMEMBERS ozon:acl:admin`
- `SMEMBERS ozon:acl:whitelist`

И в `Compute ACL Flags` парсите результат как массив чисел.

## Детали реализации

### Extract & Normalize Update
```javascript
const u = $json.update || {};

// Обрабатываем разные типы апдейтов
const msg = u.message || u.edited_message || u.channel_post || null;
const cbq = u.callback_query || null;

// Документ (если есть)
const doc = msg && msg.document ? msg.document : null;

// chat_id из разных источников
const chat_id = cbq ? cbq.message?.chat?.id : msg?.chat?.id;

// user (from) из разных источников
const from = cbq ? cbq.from : (msg ? msg.from : null);
const user_id = from?.id;

// Текст сообщения или caption
const message_text = msg?.text ?? msg?.caption ?? null;

// Данные callback'а
const callback_data = cbq?.data ?? null;
const callback_query_id = cbq?.id ?? null;

return [{ 
  json: { 
    context: { 
      user_id, 
      chat_id, 
      message_text, 
      callback_data, 
      document: doc, 
      callback_query_id 
    }, 
    requireWhitelist: !!$json.requireWhitelist 
  } 
}];
```

### Compute ACL Flags
```javascript
const ctx = $('Extract & Normalize Update').first().json.context || {};

// Парсим списки из Redis
function parseList(nodeName) {
  try {
    const raw = $(nodeName).first().json.value;
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch(e) {
    return [];
  }
}

const su = parseList('Redis Get: superuser[]');
const ad = parseList('Redis Get: admin[]');
const wl = parseList('Redis Get: whitelist[]');

// Иерархия прав
const is_superuser = su.includes(ctx.user_id);
const is_admin     = is_superuser || ad.includes(ctx.user_id);
const in_whitelist = is_superuser || is_admin || wl.includes(ctx.user_id);

return [{ 
  json: { 
    ...ctx, 
    is_superuser, 
    is_admin, 
    in_whitelist 
  } 
}];
```

### Allowed? (IF node)
```javascript
// Условие: в whitelist ИЛИ requireWhitelist=false
$json.in_whitelist || !$('Extract & Normalize Update').first().json.requireWhitelist
```

**Логика:**
- `in_whitelist = true` → разрешён
- `requireWhitelist = false` → разрешён (публичный режим)
- Иначе → запрещён

## Типы Telegram апдейтов

### 1. Обычное сообщение
```json
{
  "update_id": 123,
  "message": {
    "message_id": 456,
    "from": { "id": 789, "first_name": "John" },
    "chat": { "id": 789 },
    "text": "/start"
  }
}
```

**Извлечение:**
```javascript
msg = u.message
user_id = msg.from.id
chat_id = msg.chat.id
message_text = msg.text
```

### 2. Callback query
```json
{
  "update_id": 124,
  "callback_query": {
    "id": "callback123",
    "from": { "id": 789, "first_name": "John" },
    "message": { "chat": { "id": 789 } },
    "data": "menu:orders"
  }
}
```

**Извлечение:**
```javascript
cbq = u.callback_query
user_id = cbq.from.id
chat_id = cbq.message.chat.id
callback_data = cbq.data
callback_query_id = cbq.id
```

### 3. Сообщение с документом
```json
{
  "update_id": 125,
  "message": {
    "message_id": 457,
    "from": { "id": 789 },
    "chat": { "id": 789 },
    "document": {
      "file_id": "BQACAgIAAxkBAAI...",
      "file_name": "orders.csv"
    },
    "caption": "Мой отчёт"
  }
}
```

**Извлечение:**
```javascript
msg = u.message
document = msg.document
message_text = msg.caption // caption как текст!
```

### 4. Edited message
```json
{
  "update_id": 126,
  "edited_message": {
    "message_id": 458,
    "from": { "id": 789 },
    "chat": { "id": 789 },
    "text": "Исправленный текст"
  }
}
```

**Извлечение:**
```javascript
msg = u.edited_message
message_text = msg.text
```

## Иерархия прав

```
┌─────────────┐
│ superuser   │ ← полный доступ
├─────────────┤
│ admin       │ ← is_superuser || in admin[]
├─────────────┤
│ whitelist   │ ← is_admin || in whitelist[]
└─────────────┘
```

### Примеры:

**Пользователь в superuser:**
```javascript
is_superuser = true
is_admin = true      // автоматически
in_whitelist = true  // автоматически
```

**Пользователь в admin:**
```javascript
is_superuser = false
is_admin = true
in_whitelist = true  // автоматически
```

**Пользователь в whitelist:**
```javascript
is_superuser = false
is_admin = false
in_whitelist = true
```

**Пользователь не в списках:**
```javascript
is_superuser = false
is_admin = false
in_whitelist = false
→ ok = false, reason = 'not_whitelisted'
```

## Интеграция в основной workflow

### Схема интеграции:

```
Telegram Trigger
  • Получает сырой update
         ↓
Execute Workflow: telegram_core_access
  • INPUT: { update: $json, requireWhitelist: true }
         ↓
IF ok?
  ├─ FALSE → Send "Доступ ограничен" → END
  └─ TRUE  → Router (Switch по context)
              ├─ message_text → menu:*, file:*
              ├─ callback_data → cal:*, date:*, dates:*
              └─ document → file upload handler
```

### Пример в n8n:

**1. Telegram Trigger node:**
```json
{
  "name": "Telegram Trigger",
  "type": "n8n-nodes-base.telegramTrigger"
}
```

**2. Execute Workflow node:**
```json
{
  "name": "Core Access Check",
  "type": "n8n-nodes-base.executeWorkflow",
  "parameters": {
    "workflowId": "telegram_core_access",
    "options": {}
  },
  "inputData": {
    "update": "={{ $json }}",
    "requireWhitelist": true
  }
}
```

**3. IF node (ok?):**
```json
{
  "name": "Access Granted?",
  "type": "n8n-nodes-base.if",
  "conditions": {
    "conditions": [
      { "leftValue": "={{ $json.ok }}", "operator": "true" }
    ]
  }
}
```

**4. FALSE branch - Access Denied:**
```javascript
// Node: Send Access Denied
const ctx = $json.context;
const text = "🚫 Доступ ограничен. Обратитесь к администратору.";

// answerCallbackQuery для callback'ов
if (ctx.callback_query_id) {
  // HTTP Request to answerCallbackQuery
  return { callback_query_id: ctx.callback_query_id, text, show_alert: true };
}

// sendMessage для обычных сообщений
return { chat_id: ctx.chat_id, text };
```

**5. TRUE branch - Router:**
```javascript
// Node: Router (Switch)
const ctx = $json.context;

// Роутинг по message_text
if (ctx.message_text) {
  if (ctx.message_text === '/start') return { route: 'start' };
  if (ctx.message_text === '/menu') return { route: 'menu' };
}

// Роутинг по callback_data
if (ctx.callback_data) {
  if (ctx.callback_data.startsWith('menu:')) return { route: 'menu' };
  if (ctx.callback_data.startsWith('file:')) return { route: 'file' };
  if (ctx.callback_data.startsWith('cal:')) return { route: 'calendar' };
  if (ctx.callback_data.startsWith('date:')) return { route: 'date' };
  if (ctx.callback_data === 'dates:done') return { route: 'dates_done' };
}

// Роутинг по document
if (ctx.document) {
  return { route: 'file_upload' };
}

return { route: 'unknown' };
```

## Миграция существующего кода

### До рефакторинга:
```
Telegram Trigger
    ↓
Extract User Data (код дублируется 10+ раз)
    ↓
Check Whitelist (Redis Get, IF, ...)
    ↓
IF not whitelisted → sendMessage "Доступ запрещён"
    ↓
Router по callback_data
    ↓
Business logic...
```

### После рефакторинга:
```
Telegram Trigger
    ↓
telegram_core_access (единый саб-воркфлоу)
    ↓
IF ok=false → politely deny
IF ok=true → Router → Business logic (использует context)
```

### Что удалить из основного workflow:

❌ **Удалить дублированные Extract User Data nodes:**
```javascript
// Старый код (УДАЛИТЬ):
const msg = $json.message || {};
const user_id = msg.from?.id;
const chat_id = msg.chat?.id;
// ...
```

❌ **Удалить дублированные ACL проверки:**
```javascript
// Старый код (УДАЛИТЬ):
const whitelist = JSON.parse($(…).first().json.value);
if (!whitelist.includes(user_id)) { ... }
```

✅ **Использовать context из telegram_core_access:**
```javascript
// Новый код:
const ctx = $json.context; // уже содержит все данные + ACL флаги
const { user_id, chat_id, is_admin, in_whitelist } = ctx;
```

## Примеры использования

### Пример 1: Обычное сообщение
```javascript
// INPUT:
{
  "update": {
    "message": { 
      "from": { "id": 123456 }, 
      "chat": { "id": 123456 }, 
      "text": "/start" 
    }
  },
  "requireWhitelist": true
}

// OUTPUT (user in whitelist):
{
  "ok": true,
  "context": {
    "user_id": 123456,
    "chat_id": 123456,
    "message_text": "/start",
    "callback_data": null,
    "document": null,
    "callback_query_id": null,
    "is_superuser": false,
    "is_admin": false,
    "in_whitelist": true
  }
}
```

### Пример 2: Callback query
```javascript
// INPUT:
{
  "update": {
    "callback_query": {
      "id": "cb123",
      "from": { "id": 789012 },
      "message": { "chat": { "id": 789012 } },
      "data": "menu:orders"
    }
  },
  "requireWhitelist": true
}

// OUTPUT (user is admin):
{
  "ok": true,
  "context": {
    "user_id": 789012,
    "chat_id": 789012,
    "message_text": null,
    "callback_data": "menu:orders",
    "document": null,
    "callback_query_id": "cb123",
    "is_superuser": false,
    "is_admin": true,
    "in_whitelist": true
  }
}
```

### Пример 3: Доступ запрещён
```javascript
// INPUT:
{
  "update": {
    "message": {
      "from": { "id": 999999 },
      "chat": { "id": 999999 },
      "text": "/start"
    }
  },
  "requireWhitelist": true
}

// OUTPUT (user not in whitelist):
{
  "ok": false,
  "reason": "not_whitelisted",
  "context": {
    "user_id": 999999,
    "chat_id": 999999,
    "message_text": "/start",
    "callback_data": null,
    "document": null,
    "callback_query_id": null,
    "is_superuser": false,
    "is_admin": false,
    "in_whitelist": false
  }
}
```

### Пример 4: Публичный режим (requireWhitelist: false)
```javascript
// INPUT:
{
  "update": { "message": { "from": { "id": 999999 }, ... } },
  "requireWhitelist": false  // ← публичный режим
}

// OUTPUT (доступ всем):
{
  "ok": true,  // ← разрешён даже если не в whitelist
  "context": {
    "user_id": 999999,
    ...
    "in_whitelist": false  // флаг всё равно false, но ok=true
  }
}
```

## Edge cases

### 1. Update без message и callback_query
```javascript
u = { "update_id": 123 }
→ user_id = undefined, chat_id = undefined
→ контекст создаётся с null значениями
```

### 2. Redis ключи отсутствуют
```javascript
GET ozon:acl:superuser → (nil)
→ parseList возвращает []
→ все флаги = false
→ ok = false (если requireWhitelist=true)
```

### 3. Redis значение невалидный JSON
```javascript
GET ozon:acl:admin → "not-a-json"
→ try/catch → parseList возвращает []
→ безопасно игнорируется
```

### 4. user_id не число
```javascript
user_id = "string" (теоретически невозможно от Telegram)
→ includes(user_id) всё равно работает
```

### 5. Пустой whitelist
```javascript
ozon:acl:whitelist → "[]"
→ in_whitelist = false для всех обычных пользователей
→ ok = false
```

## Преимущества подхода

### ✅ Чистая функция
- Нет побочных эффектов (sendMessage/answerCallbackQuery)
- Только чтение Redis и возврат данных
- Легко тестировать

### ✅ Единая точка входа
- Все апдейты проходят через один workflow
- Единая нормализация контекста
- Централизованный ACL

### ✅ Переиспользование
- Можно использовать в других ботах
- Независимый от бизнес-логики
- Чёткий контракт входа/выхода

### ✅ Расширяемость
- Легко добавить новые ACL уровни
- Можно добавить rate limiting
- Можно добавить логирование

### ✅ Отладка
- Один workflow для отладки ACL
- context всегда имеет одинаковую структуру
- Легко проверить флаги прав

## Файлы коммита

```
workflows/
  └─ telegram_core_access.n8n.json

docs/
  └─ commit-07_5-telegram-core.md (эта документация)
```

## Следующие шаги

После этого коммита:
- ✅ Централизована обработка апдейтов
- ✅ Централизован ACL
- ✅ Готов к интеграции в основной workflow

**Следующее действие:**
Интегрировать `telegram_core_access` в основной workflow и удалить дублированный код Extract/ACL.

**Рекомендуется:**
- Переписать основной workflow на использование `context` из telegram_core_access
- Удалить старые Extract User Data nodes
- Добавить IF ok? после telegram_core_access
- Показывать вежливый отказ при ok=false
