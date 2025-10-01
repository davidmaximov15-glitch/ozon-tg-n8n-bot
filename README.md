# Ozon Telegram Bot - Orders Analytics 📊

> Telegram-бот для анализа CSV-отчётов Ozon с интерактивной статистикой, фильтрацией и управлением доступом

[![n8n](https://img.shields.io/badge/n8n-v1.113.3-FF6D5A?logo=n8n)](https://n8n.io)
[![Telegram Bot API](https://img.shields.io/badge/Telegram%20Bot%20API-v9.2-26A5E4?logo=telegram)](https://core.telegram.org/bots/api)
[![Redis](https://img.shields.io/badge/Redis-6.0+-DC382D?logo=redis)](https://redis.io)

## 🎯 Возможности

- ✅ **Автоматическое распознавание** типов отчётов Ozon (FBO/FBS)
- 📊 **Детальная статистика** по артикулам с расчётом средней цены
- 📅 **Гибкие фильтры** по датам и времени (30-минутный шаг)
- 📈 **Сравнение периодов** с процентами прироста/убыли
- 🔐 **RBAC система** с белым списком и админкой
- ⚡ **Redis-кэширование** для быстрой работы
- 🌍 **MSK timezone** - корректная работа с московским временем

## 🚀 Быстрый старт

```bash
# 1. Клонировать репозиторий
git clone https://github.com/davidmaximov15-glitch/ozon-tg-n8n-bot.git
cd ozon-tg-n8n-bot

# 2. Настроить окружение
cp .env.example .env
# Отредактируйте .env: добавьте TELEGRAM_BOT_TOKEN и SUPER_ADMINS

# 3. Запустить Redis
docker run -d -p 6379:6379 --name redis-ozon redis:alpine

# 4. Инициализировать Redis
chmod +x scripts/redis-init.sh
./scripts/redis-init.sh

# 5. Импортировать workflow в n8n
# Откройте n8n UI → Import → workflows/ozon-telegram-bot.json

# 6. Настроить webhook
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=https://your-n8n-instance.com/webhook/telegram-webhook"
```

## 📚 Документация

- [📖 Полная документация](docs/README.md)
- [🚀 Руководство по развертыванию](docs/DEPLOYMENT.md)
- [🔧 API документация](docs/API.md)

## 📊 Как использовать

1. **Отправьте CSV файл** боту (FBO или FBS формат)
2. **Выберите даты** для анализа (1-3 даты)
3. **Укажите временной интервал** (утро/день/вечер/ночь или произвольный)
4. **Получите детальную статистику**:
   - Количество заказов по артикулам
   - Отмены и возвраты
   - Средняя цена продажи
   - Сравнение между датами

## 🗂️ Структура проекта

```
ozon-tg-n8n-bot/
├── workflows/              # n8n workflow файлы
│   └── ozon-telegram-bot.json
├── src/                    # Модули для n8n Code nodes
│   ├── csv-parser.js       # Парсинг CSV
│   ├── statistics-calculator.js  # Расчёт статистики
│   └── keyboard-generator.js     # Telegram UI
├── scripts/                # Утилиты
│   ├── redis-init.sh       # Инициализация Redis
│   └── test-csv-samples.sh # Тестовые данные
├── docs/                   # Документация
└── test-samples/           # Тестовые CSV файлы
```

## 🛠️ Требования

- **n8n** >= 1.113.3
- **Redis** >= 6.0
- **Node.js** >= 18.x
- **Telegram Bot Token** (получите у @BotFather)

## 🔐 Безопасность

- ✅ Белый список пользователей
- 👑 Супер-админы через env
- 🚫 Rate limiting (защита от флуда)
- 🔒 Ролевая модель доступа (RBAC)

## 📝 Пример статистики

```
📊 Статистика заказов

📅 Дата: 2025-09-18
⏰ Время: 00:00 - 23:59

ABC-001
  • Заказов: 4
  • Отмен: 1
  • Средняя цена: 1190.00 ₽
  • Сумма: 4760.00 ₽
  📈 Изменение: +2 (+50%)

ИТОГО:
  • Всего заказов: 12
  • Всего отмен: 3
  • Общая сумма: 14280.00 ₽
```

## 🧪 Тестирование

```bash
# Сгенерировать тестовые CSV
./scripts/test-csv-samples.sh

# Файлы создаются в test-samples/
# Отправьте их боту для проверки
```

## 🐛 Troubleshooting

**Бот не отвечает?**
```bash
# Проверьте webhook
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
```

**Доступ запрещен?**
```bash
# Добавьте себя в whitelist
redis-cli SADD ozon:acl:whitelist YOUR_TELEGRAM_USER_ID
```

Полный список решений: [docs/README.md#устранение-неполадок](docs/README.md#устранение-неполадок)

## 🤝 Вклад

Pull requests приветствуются! См. [CONTRIBUTING.md](CONTRIBUTING.md)

## 📄 Лицензия

MIT License - см. [LICENSE](LICENSE)

## 👨‍💻 Автор

**Давид Максимов** ([@davidmaximov15-glitch](https://github.com/davidmaximov15-glitch))

---

⭐ Поставьте звезду, если проект был полезен!