# n8n Workflow Testing Infrastructure

Автоматическое тестирование n8n workflows через API.

## 📋 Архитектура

### Компоненты
- **`n8n_test_runner.py`** — Python фреймворк для запуска тестов
- **`workflows/tests/`** — Тестовые workflows в формате n8n JSON

### Как это работает
1. Python script импортирует тестовый workflow через n8n API
2. Запускает его через `/workflows/{id}/run`
3. Ждёт завершения execution (polling `/executions/{id}`)
4. Извлекает результаты из последней ноды
5. Выводит красиво форматированный отчёт

## 🚀 Быстрый старт

### 1. Установить зависимости
```bash
pip install requests
```

### 2. Настроить переменные окружения
```bash
export N8N_API_KEY='your-api-key-here'
export N8N_BASE_URL='https://sirnokoknot.beget.app'  # optional
```

### 3. Импортировать тестовый workflow

Через Python:
```python
from tests.n8n_test_runner import N8NTestClient

client = N8NTestClient()
workflow_id = client.import_workflow('workflows/tests/test_orders_menu_render.n8n.json')
print(f"Imported workflow ID: {workflow_id}")
```

Или через curl:
```bash
curl -X POST \
  -H "X-N8N-API-KEY: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d @workflows/tests/test_orders_menu_render.n8n.json \
  "https://sirnokoknot.beget.app/api/v1/workflows"
```

### 3. Запустить тесты

```bash
cd /project/workspace/ozon-tg-n8n-bot
python3 tests/n8n_test_runner.py
```

## 📝 Структура тестового workflow

Каждый тест состоит из:

### 1. **Manual Trigger** → Точка входа

### 2. **Define Test Scenarios** (Code node)
Определяет тестовые сценарии:
```javascript
const scenarios = [
  {
    name: "Test case description",
    input: { userId: "123", chatId: "123" },
    mockRedis: { "key": "value" },
    expectations: {
      textContains: "Expected text",
      calendarButtonCallback: "expected_callback",
      hasUploadButton: true
    }
  }
];
```

### 3. **Setup Mock Redis** (Code node)
Создаёт mock Redis state в `global.testRedisState`

### 4. **Execute: target_workflow** (Execute Workflow node)
Запускает целевой workflow с тестовыми данными

### 5. **Run Assertions** (Code node)
Проверяет выходные данные:
- Проверка текста (`textContains`)
- Проверка кнопок (`calendarButtonCallback`, `hasUploadButton`)
- Проверка структуры keyboard
- Custom assertions

### 6. **Format Results** (Code node)
Агрегирует результаты:
```json
{
  "success": true,
  "total": 2,
  "passed": 2,
  "failed": 0,
  "scenarios": [...]
}
```

## 📊 Пример вывода

```
🚀 Запускаю тест: test_orders_menu_render
📝 Execution ID: 1758
⏳ Жду завершения...

============================================================
📊 РЕЗУЛЬТАТЫ ТЕСТОВ
============================================================
✅ Пройдено: 2/2
❌ Провалено: 0/2

✅ Сценарий 1: Without session - should show 'No file' message
✅ Сценарий 2: With session - should show date range
============================================================
```

## 🛠️ Создание новых тестов

### Шаблон

1. Скопируй `test_orders_menu_render.n8n.json`
2. Переименуй workflow (поле `name`)
3. Обнови:
   - `Define Test Scenarios` — тестовые данные
   - `Execute: target_workflow` — имя целевого workflow
   - `Run Assertions` — ожидаемые результаты
4. Импортируй через API или n8n UI
5. Добавь в `tests/n8n_test_runner.py` → `test_workflows` список

### Примеры assertions

```javascript
// Проверка текста
assert(
  "Text contains 'Нет файла'",
  output.text.includes('Нет файла'),
  'Нет файла',
  output.text
);

// Проверка callback_data
const keyboard = output.reply_markup?.inline_keyboard || [];
const button = keyboard[0]?.[0];
assert(
  "Button callback is 'noop'",
  button?.callback_data === 'noop',
  'noop',
  button?.callback_data
);

// Проверка наличия кнопки
const hasButton = keyboard.flat().some(btn => 
  btn.text && btn.text.includes('Загрузить')
);
assert(
  "Has 'Загрузить' button",
  hasButton,
  true,
  hasButton
);

// Проверка JSON структуры
assert(
  "Has availableDates array",
  Array.isArray(output.availableDates),
  true,
  Array.isArray(output.availableDates)
);
```

## 🔧 API Reference

### N8NTestClient

```python
client = N8NTestClient(config=N8NConfig())

# Список workflows
workflows = client.list_workflows()

# Получить workflow
workflow = client.get_workflow(workflow_id)

# Импортировать workflow
workflow_id = client.import_workflow('path/to/workflow.json')

# Запустить workflow
execution_id = client.execute_workflow(workflow_id, input_data={})

# Получить execution
execution = client.get_execution(execution_id)

# Ждать завершения
execution = client.wait_for_execution(execution_id, timeout=30)

# Найти workflow по имени
workflow_id = client.find_workflow_by_name('test_orders_menu_render')
```

### WorkflowTestRunner

```python
runner = WorkflowTestRunner()

# Запустить тест
results = runner.run_test_workflow('test_orders_menu_render')

# Красивый вывод
runner.print_test_results(results)
```

## 📦 Existing Tests

- ✅ `test_orders_menu_render` — Тест orders menu с/без файла

## TODO

- [ ] `test_calendar_nav_guard` — Тест границ календаря
- [ ] `test_dates_toggle_and_limit` — Тест выбора дат (3 max)
- [ ] `test_calendar_render_grid` — Тест отрисовки сетки 7×5
- [ ] `test_orders_stats_engine` — Тест расчёта статистики
- [ ] Mock Redis интеграция для Execute Workflow nodes
- [ ] CI/CD интеграция (GitHub Actions)

## 🐛 Troubleshooting

### Ошибка "Workflow not found"
```bash
# Проверь список workflows
curl -H "X-N8N-API-KEY: YOUR_KEY" \
  "https://sirnokoknot.beget.app/api/v1/workflows"

# Импортируй заново
python3 -c "from tests.n8n_test_runner import N8NTestClient; print(N8NTestClient().import_workflow('workflows/tests/test_orders_menu_render.n8n.json'))"
```

### Ошибка "Execution timeout"
Увеличь timeout:
```python
execution = client.wait_for_execution(execution_id, timeout=60)
```

### Mock Redis не работает
Убедись что целевой workflow **НЕ использует** реальную Redis connection. Для тестов нужно:
1. Или создать test-версию workflow с mock Redis nodes
2. Или использовать conditional logic `{{ $env.NODE_ENV === 'test' ? global.testRedisState[key] : realRedis }}`

## 📚 Дополнительные ресурсы

- [n8n API Documentation](https://docs.n8n.io/api/)
- [n8n Workflow JSON Structure](https://docs.n8n.io/workflows/export-import/)
