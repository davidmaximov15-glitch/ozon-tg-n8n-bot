# Commit 09 — feat(menu): кнопка «🧹 Очистить файл» в «Заказы»

## Что делает

- Рендерит «Заказы»-панель через единый UI (send-or-edit).
- Добавляет кнопку «🧹 Очистить файл» (`callback_data = "file:clear"`) и «📥 Загрузить CSV».
- Делает «📅 Открыть календарь» активной только при наличии сессии файла:
  - если сессии нет — `callback_data = "noop"` и текст с подсказкой.

## Файлы

```
workflows/
└── orders_menu_render.n8n.json
```

## Подключение

1) Импортируй `orders_menu_render.n8n.json` в n8n.

2) В роутере:
   - `menu:orders` → запуск `orders_menu_render`.
   - `file:clear` уже должен вести в саб `files_session_and_clear` (коммит 02). Если нет — добавь ветку:
     ```
     callback_data starts with "file:clear" → workflowExecute: files_session_and_clear
     ```

3) Убедись, что коммит 08 уже применён (новые имена ключей). Этот саб читает `ozon:sess:<uid>:csv`.

## Проверки

### При входе в «Заказы»:
- **Без сессии**: виден текст «Нет загруженного файла…», кнопка календаря неактивна (`noop`).
- **С сессией**: отображается диапазон `<from>` — `<to>`, календарь активен.

### Нажатие «🧹 Очистить файл»:
- Чистит `ozon:sess:<uid>:csv`, `ozon:sess:<uid>:dates`, `ozon:ui:<uid>:calendar:message_id`.
- Показывает тост «Кэш очищен. Загрузите новый отчёт» (логика из коммита 02).

### «📥 Загрузить CSV»:
- Ведёт в ветку загрузки (`menu:upload`).

### Сообщение в чате:
- Остаётся одним — переотрисовывается через `ui_orchestrator`.

## Используемые ключи Redis

- `ozon:sess:<uid>:csv` — сессия файла с полями `from`, `to`, `availableDates`
- `ozon:ui:<uid>:calendar:message_id` — ID сообщения для редактирования

## Зависимости

- **Коммит 01**: `ui_orchestrator.n8n.json` для send-or-edit
- **Коммит 02**: `files_session_and_clear.n8n.json` для обработки `file:clear`
- **Коммит 08**: стандартизация ключей Redis (`ozon:sess:*`)
