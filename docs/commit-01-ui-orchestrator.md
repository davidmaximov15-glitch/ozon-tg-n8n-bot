# Commit 01 — fix(calendar): dedupe calendar messages via editMessageText + store message_id

## Что делает

- Вводит единый UI-оркестратор для Телеграма: send-or-edit.
- Сохраняет/читает message_id панели из Redis ключа `ozon:ui:<uid>:<key>:message_id`.
- Устраняет «простыню» сообщений при работе календаря/меню.

## Как применить

1) **Импортируй** `workflows/ui_orchestrator.n8n.json` в n8n 1.113.3 (Create → Import from file).

2) **Креды Redis** уже подставлены: `kaA0Glj8bB5pwqRt` (взяты из основного workflow).

3) **Убедись**, что нода `Config` в основном проекте содержит `TELEGRAM_BOT_TOKEN`.

4) **В местах, где раньше был sendMessage календаря/меню**:
   - Сформируй JSON:
     ```json
     {
       "chat_id": {{ chatId }},
       "user_id": {{ userId }},
       "key": "calendar",
       "text": "📅 Выберите даты…",
       "reply_markup": { "inline_keyboard": [ [ { "text": "—", "callback_data": "noop" } ] ] },
       "parse_mode": "HTML"
     }
     ```
   - Вызови саб-воркфлоу `ui_orchestrator (send-or-edit)` с этим JSON через Execute Workflow node.

5) **Проверь /menu:orders**:
   - При первом входе — создаётся «живое» сообщение и запоминается id (Redis).
   - При кликах по навигации/датам — сообщения **редактируются** вместо отправки новых.

## Архитектура саб-воркфлоу

```
Input: { chat_id, user_id, key, text, reply_markup, parse_mode? }
  ↓
Compute Redis Keys (формирует uiKey = ozon:ui:<user_id>:<key>:message_id)
  ↓
Redis Get UI Msg Id (читает сохранённый message_id)
  ↓
Has Msg Id? (проверяет наличие)
  ├─ true → Telegram editMessageText (continueOnFail: true)
  │           ↓
  │         Check Edit Result
  │           ├─ ok=true → Redis Set UI Msg Id (обновляем TTL)
  │           └─ error → Edit Failed → Send? → Telegram sendMessage (fallback)
  │                                            ↓
  │                                          Wrap Send Result
  │                                            ↓
  │                                          Redis Set UI Msg Id
  └─ false → Telegram sendMessage (fallback/new)
               ↓
             Wrap Send Result
               ↓
             Redis Set UI Msg Id
```

## Ключевые особенности

1. **continueOnFail: true** на editMessageText — если сообщение удалено пользователем, не ломаем flow.
2. **Check Edit Result** анализирует ответ Telegram:
   - `ok: true` → редактирование прошло, message_id не меняется
   - `ok: false` или error → переходим на sendMessage
3. **Redis key**: `ozon:ui:<user_id>:<key>:message_id` — стандартизированный формат для всех UI-элементов.

## Как тестировать (быстрый чек-лист)

- ✅ Открой «Заказы» → нажми «Календарь» несколько раз
- ✅ **Ожидаемое поведение**: в чате остаётся **одно** сообщение (редактируется), новые не плодятся
- ✅ Если удалишь сообщение календаря вручную → следующий клик создаст новое (fallback работает)

## Связь с планом

- ✅ **Разбивка** Send Date Selection на Ensure Calendar Msg + Send or Edit Calendar
- ✅ **Де-дупликатор** сообщений через editMessageText
- ✅ **Хранение** calendar_msg_id в Redis (теперь универсальный ключ `ozon:ui:*`)
- 🔜 Кнопка очистки будет добавлена в коммите №2

## Следующие шаги

После интеграции этого саб-воркфлоу в основной flow:
- **Коммит №2**: Добавим проверку валидной сессии и подсказки
- **Коммит №3**: Интеграция ui_orchestrator в точки календаря/меню
- **Коммит №4**: Универсальный календарный компонент
