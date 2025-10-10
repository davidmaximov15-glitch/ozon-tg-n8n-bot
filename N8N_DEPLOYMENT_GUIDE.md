# 🚀 N8N Deployment Guide - Ozord Workflows

**Дата**: 10 октября 2025  
**N8N Instance**: https://sirnokoknot.beget.app  
**Статус**: ✅ **ГОТОВ К ИМПОРТУ В N8N**

---

## 📋 Что Готово

### ✅ Обновленные Workflows (с корректными N8N ID)

1. **`workflows/ozord_unified_router_callbacks.n8n.json`**
   - 6 Execute Workflow nodes с корректными ID
   - Роутинг callback queries
   - Вызывает: orders_menu_render, calendar_ui_header, files_session_clear, calendar_nav_guard, dates_toggle_limit, dates_done_guard

2. **`workflows/ozord_unified_router_messages.n8n.json`**
   - 3 Execute Workflow nodes с корректными ID
   - Роутинг сообщений
   - Вызывает: orders_menu_render, calendar_ui_header, files_session_clear

3. **`workflows/ozord_main_telegram_orchestrator.n8n.json`** ⭐ ГЛАВНЫЙ
   - 76 nodes
   - Telegram Trigger (entry point)
   - Полная логика бота

---

## 🔄 Процесс Импорта в N8N

### Шаг 1: Удалить старые версии роутеров

Если в N8N уже есть `ozord_unified_router_callbacks` и `ozord_unified_router_messages` - удалите их или деактивируйте.

### Шаг 2: Импортировать обновленные роутеры

1. Откройте N8N: https://sirnokoknot.beget.app
2. Нажмите "+" → "Import from File"
3. Загрузите `workflows/ozord_unified_router_callbacks.n8n.json`
4. **ВАЖНО**: Выберите "Replace" для существующего workflow (не создавайте дубликат)
5. Повторите для `workflows/ozord_unified_router_messages.n8n.json`

### Шаг 3: Импортировать главный orchestrator

**Опция A (рекомендуется)**: Заменить существующий
1. Найдите существующий "Ozon Telegram Bot - Orders Analytics (patched, calendar)"
2. Откройте его
3. Нажмите "..." → "Import from File" → "Replace current workflow"
4. Выберите `workflows/ozord_main_telegram_orchestrator.n8n.json`

**Опция B**: Создать новый
1. "+" → "Import from File"
2. Загрузите `workflows/ozord_main_telegram_orchestrator.n8n.json`
3. Активируйте workflow
4. Деактивируйте старый workflow

### Шаг 4: Проверить конфигурацию

После импорта проверьте:

1. **Telegram Credentials** корректны во всех Telegram nodes
2. **Redis Credentials** настроены
3. **Environment Variables**:
   - `TELEGRAM_BOT_TOKEN`
   - `REDIS_URL`
   - `SUPER_ADMINS`

### Шаг 5: Активировать workflow

1. Откройте главный workflow
2. Нажмите "Active" toggle
3. Проверьте что нет ошибок

---

## 📊 Mapping N8N Workflow IDs

Текущие ID workflows в N8N (из `.ozord_mapping.json`):

```json
{
  "ozord_calendar_nav_guard": "d8oh1GRJYCfmewOO",
  "ozord_calendar_render_grid": "H6b9gG2LkMW7uamM",
  "ozord_calendar_ui_header_and_counters": "jY98upBVzlyy5IWI",
  "ozord_dates_done_guard_and_handoff": "O4Oo5unMb4J5AKS9",
  "ozord_dates_toggle_and_limit": "WZAncgLUdxNgw1UC",
  "ozord_files_session_and_clear": "yr11w5vNVacmw1JL",
  "ozord_orders_menu_render": "5rr4qcl6EhKmqU2Y",
  "ozord_orders_stats_engine": "SBDRxiJ5zUPizHj2",
  "ozord_redis_keys_migration": "uXn0OfgsXdMR5gRx",
  "ozord_telegram_core_access": "HVBEd9XUO0smqoAH",
  "ozord_ttl_guard_for_user": "tpkFwdFqLt384LJs",
  "ozord_ui_orchestrator (send-or-edit)": "jLupENC6RYaiEU0i",
  "ozord_unified_router_callbacks": "kzVbukSB7Scut6fx",
  "ozord_unified_router_messages": "i59lQQOEM9YMxXGL"
}
```

**Эти ID уже прописаны во всех Execute Workflow nodes в обновленных файлах.**

---

## 🧪 Тестирование После Деплоя

### 1. Базовый тест через Telegram

1. Отправьте боту `/start`
2. Проверьте что появляется главное меню
3. Нажмите "Заказы"

### 2. Тест загрузки CSV (FBO)

1. Отправьте файл `orders-2025-fbo-test.csv` боту
2. Бот должен:
   - Распознать FBO формат
   - Показать 5 дат (01.09, 02.09, 29.09, 30.09, 01.10.2025)
   - Предложить выбрать даты

### 3. Тест выбора дат и статистики

1. Выберите 2 даты (например, 01.09 и 01.10)
2. Выберите временной интервал
3. Получите статистику
4. Проверьте:
   - Количество заказов корректное
   - Средняя цена рассчитана
   - Сравнение между датами работает

### 4. Проверка логов N8N

1. Откройте https://sirnokoknot.beget.app/home/executions
2. Фильтр по главному workflow
3. Проверьте что executions успешны
4. Проверьте что Execute Workflow nodes вызывают правильные дочерние workflows

---

## 🐛 Troubleshooting

### Проблема: Execute Workflow node вызывает неправильный workflow

**Решение**:
1. Откройте node в редакторе
2. В параметре "Workflow" выберите правильный ozord_ workflow из списка
3. Сохраните workflow

### Проблема: Telegram Trigger не работает

**Решение**:
1. Проверьте что Telegram credentials настроены
2. Проверьте webhook URL в Telegram API
3. Деактивируйте/активируйте workflow

### Проблема: Redis ошибки

**Решение**:
1. Проверьте `REDIS_URL` в environment variables
2. Проверьте что Redis сервис запущен
3. Проверьте Redis credentials в N8N

### Проблема: Парсинг дат не работает

**Решение**:
1. Проверьте что `ozord_orders_stats_engine` обновлен (с hour padding)
2. Запустите тестовый скрипт: `node scripts/test_n8n_parse_function.js`
3. Проверьте логи в N8N executions

---

## 📁 Структура Проекта

```
workflows/
├── ozord_main_telegram_orchestrator.n8n.json  ⭐ ГЛАВНЫЙ (76 nodes, Telegram Trigger)
├── ozord_unified_router_callbacks.n8n.json    📍 Роутер callbacks (6 Execute Workflow)
├── ozord_unified_router_messages.n8n.json     📍 Роутер messages (3 Execute Workflow)
├── ozord_calendar_nav_guard.n8n.json          🔧 Модуль: навигация календаря
├── ozord_calendar_render_grid.n8n.json        🔧 Модуль: отрисовка сетки
├── ozord_calendar_ui_header_and_counters.n8n.json 🔧 Модуль: заголовок
├── ozord_dates_done_guard_and_handoff.n8n.json    🔧 Модуль: завершение выбора дат
├── ozord_dates_toggle_and_limit.n8n.json      🔧 Модуль: переключение дат
├── ozord_files_session_and_clear.n8n.json     🔧 Модуль: управление файлами
├── ozord_orders_menu_render.n8n.json          🔧 Модуль: меню заказов
├── ozord_orders_stats_engine.n8n.json         🔧 Модуль: расчет статистики (ОБНОВЛЕН)
├── ozord_redis_keys_migration.n8n.json        🔧 Модуль: миграция ключей
├── ozord_telegram_core_access.n8n.json        🔧 Модуль: проверка доступа
├── ozord_ttl_guard_for_user.n8n.json          🔧 Модуль: TTL guard
└── ozord_ui_orchestrator.n8n.json             🔧 Модуль: UI оркестратор
```

---

## ✅ Checklist Деплоя

- [x] Роутеры обновлены с корректными N8N ID
- [x] Главный orchestrator создан (ozord_main_telegram_orchestrator)
- [x] Все файлы залиты на main
- [ ] **Роутеры импортированы в N8N (через UI)**
- [ ] **Главный orchestrator импортирован в N8N**
- [ ] **Workflow активирован**
- [ ] **Базовое тестирование пройдено**
- [ ] **CSV FBO/FBS тестирование пройдено**

---

## 📝 Следующие Шаги

1. **Импортировать workflows в N8N** через UI (см. Шаг 1-3 выше)
2. **Активировать главный workflow**
3. **Протестировать через Telegram бота**
4. **Проверить executions в N8N**
5. **При необходимости - обновить credentials/environment variables**

---

## 🔗 Полезные Ссылки

- **N8N Instance**: https://sirnokoknot.beget.app
- **N8N Workflows**: https://sirnokoknot.beget.app/home/workflows
- **N8N Executions**: https://sirnokoknot.beget.app/home/executions
- **GitHub Repository**: https://github.com/davidmaximov15-glitch/ozon-tg-n8n-bot

---

## 💡 Примечания

- **N8N API**: Попытки обновить workflows через API дали ошибку "must NOT have additional properties". Рекомендуется импорт через UI.
- **Workflow IDs**: Не являются секретными данными, можно коммитить в git.
- **FBO/FBS**: Логика определения типа файла и парсинг обоих форматов реализована в `ozord_orders_stats_engine`.
- **Date Parsing**: Hour padding (`7:26` → `07:26`) и UTC→MSK конвертация работают корректно (100% тестов пройдено).

---

*Создано: 2025-10-10 06:00 UTC*  
*Последнее обновление: commit 3359c65*
