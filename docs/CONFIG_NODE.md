# 🔧 Config Node - Настройка токена бота

## ✅ Почему Config Node?

**Проблема:** n8n не всегда позволяет настраивать environment variables (особенно в Cloud версии).

**Решение:** Config Node - это Code node в начале workflow, где хранятся все переменные.

---

## 📍 Где находится?

Config node - это **первая нода** в workflow с именем `Config`.

---

## ⚙️ Как настроить?

### 1. Открой workflow в n8n

### 2. Найди Config node (первая нода)

### 3. Открой её и отредактируй:

```javascript
// 🔐 КОНФИГУРАЦИЯ БОТА
// Измени TELEGRAM_BOT_TOKEN на свой токен от @BotFather

const TELEGRAM_BOT_TOKEN = "YOUR_TELEGRAM_BOT_TOKEN_HERE";

// Инструкция:
// 1. Открой Telegram и найди @BotFather
// 2. Отправь /mybots -> выбери бота -> API Token
// 3. Скопируй токен вида: 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
// 4. Замени YOUR_TELEGRAM_BOT_TOKEN_HERE выше на свой токен
// 5. Сохрани workflow

return [{
  json: {
    telegram_bot_token: TELEGRAM_BOT_TOKEN
  }
}];
```

### 4. Замени `YOUR_TELEGRAM_BOT_TOKEN_HERE` на свой токен

**Пример:**
```javascript
const TELEGRAM_BOT_TOKEN = "1234567890:ABCdefGHIjklMNOpqrsTUVwxyz";
```

### 5. Сохрани workflow

---

## 🔍 Где используется?

Config node отдаёт `telegram_bot_token` в `$('Config').item.json.telegram_bot_token`.

**Все HTTP Request nodes используют эту переменную:**

### 1. Send Menu (HTTP Request)
```
URL: https://api.telegram.org/bot{{ $('Config').item.json.telegram_bot_token }}/sendMessage
```

### 2. Send Menu Response (HTTP Request)
```
URL: https://api.telegram.org/bot{{ $('Config').item.json.telegram_bot_token }}/sendMessage
```

### 3. Send Date Selection (HTTP Request)
```
URL: https://api.telegram.org/bot{{ $('Config').item.json.telegram_bot_token }}/sendMessage
```

---

## 💡 Преимущества

✅ **Не нужны environment variables** - всё настраивается в workflow  
✅ **Просто** - один раз настроил и забыл  
✅ **Видно где токен** - легко найти и обновить  
✅ **Работает везде** - n8n Cloud, self-hosted, Docker  
✅ **Единое место** - все переменные в одной ноде  

---

## 🆘 Troubleshooting

### Ошибка: "Cannot read property 'json' of undefined"

**Причина:** Config node не выполнена или нет connection

**Решение:**
1. Убедись что Config node существует
2. Проверь что она называется именно `Config`
3. Execute Config node вручную для теста

### Ошибка: "401 Unauthorized" от Telegram

**Причина:** Неверный токен

**Решение:**
1. Проверь токен в @BotFather
2. Скопируй токен заново (без пробелов)
3. Замени в Config node
4. Сохрани workflow

---

## 🔐 Безопасность

### ⚠️ Важно:

**Config node хранит токен в открытом виде в workflow JSON.**

Это означает:
- ❌ Не экспортируй workflow с токеном на публичные ресурсы
- ❌ Не коммить workflow с токеном в публичный Git
- ✅ Если нужно поделиться - замени токен на `YOUR_TELEGRAM_BOT_TOKEN_HERE`

### Альтернатива (более безопасная):

Если n8n позволяет, используй environment variables (см. `docs/ENV_SETUP.md`).

---

## 📚 См. также

- [ENV_SETUP.md](ENV_SETUP.md) - Настройка через environment variables (более безопасно)
- [Telegram Bot API](https://core.telegram.org/bots/api) - Документация Telegram
- [n8n Code Node](https://docs.n8n.io/code/builtin/code-node/) - Документация по Code node
