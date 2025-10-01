# 🔧 Environment Variables Setup для n8n

## 📋 Необходимые переменные

Для работы workflow требуется настроить environment variable в n8n:

### `TELEGRAM_BOT_TOKEN`

**Описание:** Токен Telegram бота для отправки сообщений и скачивания файлов.

**Где используется:**
- HTTP Request nodes для отправки сообщений с inline keyboards
- HTTP Request nodes для скачивания CSV файлов

**Где взять токен:**
1. Открой Telegram и найди бота `@BotFather`
2. Отправь команду `/mybots`
3. Выбери своего бота
4. Нажми "API Token"
5. Скопируй токен вида: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`

---

## ⚙️ Как настроить в n8n

### Вариант 1: Environment Variables (рекомендуется)

#### В n8n Cloud:

1. Зайди в **Settings** → **Environment**
2. Добавь переменную:
   ```
   Имя: TELEGRAM_BOT_TOKEN
   Значение: 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
   ```
3. Сохрани

#### В self-hosted n8n:

1. **Через .env файл:**
   ```bash
   # В файле .env n8n
   TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
   ```

2. **Через Docker:**
   ```bash
   docker run -e TELEGRAM_BOT_TOKEN="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz" n8nio/n8n
   ```

3. **Через docker-compose.yml:**
   ```yaml
   version: '3.8'
   services:
     n8n:
       image: n8nio/n8n
       environment:
         - TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
   ```

4. **Через системные переменные:**
   ```bash
   export TELEGRAM_BOT_TOKEN="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
   ```

---

### Вариант 2: Замена в workflow (менее безопасно)

Если не можешь настроить env variables, можно заменить в workflow:

**В каждом HTTP Request node замени:**

```javascript
// Было:
"url": "=https://api.telegram.org/bot{{ $env.TELEGRAM_BOT_TOKEN }}/sendMessage"

// Стало:
"url": "=https://api.telegram.org/bot1234567890:ABCdefGHIjklMNOpqrsTUVwxyz/sendMessage"
```

**⚠️ Недостатки этого подхода:**
- Токен виден в workflow файле
- При утечке workflow токен компрометирован
- Нужно менять в 5 местах (3 Send + 2 Download)

---

## 🔍 Где используется `$env.TELEGRAM_BOT_TOKEN`

### 1. Send Menu (HTTP Request)
```
URL: https://api.telegram.org/bot{{ $env.TELEGRAM_BOT_TOKEN }}/sendMessage
```

### 2. Send Menu Response (HTTP Request)
```
URL: https://api.telegram.org/bot{{ $env.TELEGRAM_BOT_TOKEN }}/sendMessage
```

### 3. Send Date Selection (HTTP Request)
```
URL: https://api.telegram.org/bot{{ $env.TELEGRAM_BOT_TOKEN }}/sendMessage
```

### 4. Get File Path (HTTP Request)
```
URL: https://api.telegram.org/bot{{ $env.TELEGRAM_BOT_TOKEN }}/getFile?file_id=...
```

### 5. Download CSV (HTTP Request)
```
URL: https://api.telegram.org/file/bot{{ $env.TELEGRAM_BOT_TOKEN }}/{{ $json.result.file_path }}
```

---

## ✅ Проверка настройки

После настройки переменной:

1. Перезапусти n8n (если self-hosted)
2. Открой workflow
3. В любом HTTP Request node с `$env.TELEGRAM_BOT_TOKEN` нажми "Execute Node"
4. Если токен настроен правильно - увидишь URL с подставленным токеном в логах

### Как проверить что токен работает:

```bash
# Замени YOUR_TOKEN на свой токен
curl https://api.telegram.org/botYOUR_TOKEN/getMe
```

**Должен вернуть:**
```json
{
  "ok": true,
  "result": {
    "id": 1234567890,
    "is_bot": true,
    "first_name": "Your Bot Name",
    "username": "your_bot_username"
  }
}
```

---

## 🔐 Безопасность

### ✅ Правильно:
- Хранить токен в environment variables
- Не коммитить токен в Git
- Использовать `.env` файл (добавлен в `.gitignore`)

### ❌ Неправильно:
- Хардкодить токен в workflow
- Коммитить токен в репозиторий
- Показывать токен в скриншотах/логах

---

## 🆘 Troubleshooting

### Ошибка: "Cannot read property 'TELEGRAM_BOT_TOKEN' of undefined"

**Причина:** n8n не видит environment variable

**Решение:**
1. Убедись что переменная добавлена в n8n
2. Перезапусти n8n
3. Проверь правильность имени: `TELEGRAM_BOT_TOKEN` (без лишних пробелов)

### Ошибка: "401 Unauthorized" от Telegram

**Причина:** Неверный токен

**Решение:**
1. Проверь токен в @BotFather
2. Скопируй токен заново
3. Убедись что нет лишних символов/пробелов

### Ошибка: "404 Not Found" от Telegram

**Причина:** Неверный формат URL или токена

**Решение:**
1. Убедись что токен в формате: `NUMBER:ALPHANUMERIC`
2. Проверь что в URL нет опечаток

---

## 📚 Дополнительные ссылки

- [n8n Environment Variables Documentation](https://docs.n8n.io/hosting/environment-variables/)
- [Telegram Bot API Documentation](https://core.telegram.org/bots/api)
- [How to get Telegram Bot Token](https://core.telegram.org/bots#6-botfather)
