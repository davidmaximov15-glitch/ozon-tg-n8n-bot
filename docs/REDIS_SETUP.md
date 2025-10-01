# Redis Setup для Ozon Telegram Bot

## 🔑 Структура ключей

Так как n8n Redis node не поддерживает операции с Sets (SADD, SISMEMBER), используется структура с отдельными ключами:

### Whitelist
```
ozon:acl:whitelist:{user_id} = "1"
```

### Admins
```
ozon:acl:admins:{user_id} = "1"
```

### Superadmins
```
ozon:acl:superadmins:{user_id} = "1"
```

---

## 🚀 Инициализация Redis

### Вариант 1: Через redis-cli

```bash
# Получить свой Telegram User ID через @userinfobot
USER_ID="123456789"

# Если Redis в Docker
docker exec -it redis-container redis-cli SET "ozon:acl:whitelist:${USER_ID}" "1"
docker exec -it redis-container redis-cli SET "ozon:acl:admins:${USER_ID}" "1"
docker exec -it redis-container redis-cli SET "ozon:acl:superadmins:${USER_ID}" "1"

# Если Redis на localhost
redis-cli SET "ozon:acl:whitelist:${USER_ID}" "1"
redis-cli SET "ozon:acl:admins:${USER_ID}" "1"
redis-cli SET "ozon:acl:superadmins:${USER_ID}" "1"
```

### Вариант 2: Через скрипт

```bash
#!/bin/bash
# add-user-to-whitelist.sh

USER_ID=$1

if [ -z "$USER_ID" ]; then
  echo "Usage: $0 <telegram_user_id>"
  exit 1
fi

# Добавить в whitelist
docker exec -it redis-container redis-cli SET "ozon:acl:whitelist:${USER_ID}" "1"
echo "✅ User ${USER_ID} added to whitelist"

# Опционально: сделать админом
read -p "Make this user admin? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  docker exec -it redis-container redis-cli SET "ozon:acl:admins:${USER_ID}" "1"
  echo "✅ User ${USER_ID} is now admin"
fi
```

Использование:
```bash
chmod +x add-user-to-whitelist.sh
./add-user-to-whitelist.sh 123456789
```

---

## 🔍 Проверка

### Проверить whitelist пользователя
```bash
USER_ID="123456789"
docker exec -it redis-container redis-cli GET "ozon:acl:whitelist:${USER_ID}"
# Должен вернуть: "1"
```

### Проверить всех пользователей в whitelist
```bash
docker exec -it redis-container redis-cli KEYS "ozon:acl:whitelist:*"
# Вернёт список ключей:
# ozon:acl:whitelist:123456789
# ozon:acl:whitelist:987654321
```

### Получить список всех User ID в whitelist
```bash
docker exec -it redis-container redis-cli KEYS "ozon:acl:whitelist:*" | sed 's/ozon:acl:whitelist://'
```

---

## ➕ Управление пользователями

### Добавить пользователя в whitelist
```bash
docker exec -it redis-container redis-cli SET "ozon:acl:whitelist:987654321" "1"
```

### Сделать пользователя админом
```bash
docker exec -it redis-container redis-cli SET "ozon:acl:admins:987654321" "1"
```

### Удалить пользователя из whitelist
```bash
docker exec -it redis-container redis-cli DEL "ozon:acl:whitelist:987654321"
```

### Удалить права админа
```bash
docker exec -it redis-container redis-cli DEL "ozon:acl:admins:987654321"
```

---

## 📊 Массовое управление

### Добавить нескольких пользователей
```bash
#!/bin/bash
# Массовое добавление в whitelist

USERS=(
  "123456789"
  "987654321"
  "555444333"
)

for USER_ID in "${USERS[@]}"; do
  docker exec -it redis-container redis-cli SET "ozon:acl:whitelist:${USER_ID}" "1"
  echo "✅ Added user ${USER_ID}"
done
```

### Экспорт whitelist
```bash
# Сохранить всех пользователей в файл
docker exec -it redis-container redis-cli KEYS "ozon:acl:whitelist:*" \
  | sed 's/ozon:acl:whitelist://' \
  > whitelist_backup.txt

echo "✅ Whitelist saved to whitelist_backup.txt"
```

### Импорт whitelist из файла
```bash
#!/bin/bash
# restore-whitelist.sh

while IFS= read -r USER_ID; do
  docker exec -it redis-container redis-cli SET "ozon:acl:whitelist:${USER_ID}" "1"
  echo "✅ Restored user ${USER_ID}"
done < whitelist_backup.txt
```

---

## 🔧 Миграция со старой структуры (Set)

Если у вас были данные в Redis Sets (`ozon:acl:whitelist` как Set):

```bash
#!/bin/bash
# migrate-sets-to-keys.sh

# Получить всех членов старого Set
MEMBERS=$(docker exec -it redis-container redis-cli SMEMBERS "ozon:acl:whitelist")

# Конвертировать в отдельные ключи
for USER_ID in $MEMBERS; do
  docker exec -it redis-container redis-cli SET "ozon:acl:whitelist:${USER_ID}" "1"
  echo "✅ Migrated user ${USER_ID}"
done

echo "✅ Migration complete"
echo "⚠️  Old Set key still exists. To remove:"
echo "docker exec -it redis-container redis-cli DEL ozon:acl:whitelist"
```

---

## 🐛 Troubleshooting

### "Доступ запрещен" в боте

1. **Проверить User ID:**
   ```bash
   # В Telegram отправить /start боту @userinfobot
   # Скопировать Your ID
   ```

2. **Проверить ключ в Redis:**
   ```bash
   docker exec -it redis-container redis-cli GET "ozon:acl:whitelist:ВАШ_ID"
   ```

3. **Если вернуло `(nil)` - добавить:**
   ```bash
   docker exec -it redis-container redis-cli SET "ozon:acl:whitelist:ВАШ_ID" "1"
   ```

4. **Проверить credential в n8n:**
   - Открыть node "Check Whitelist"
   - Убедиться что Redis credential настроен правильно

### Проверка связи n8n с Redis

```bash
# В n8n создать тестовый workflow:
# 1. Manual Trigger
# 2. Redis node (operation: SET, key: "test:connection", value: "ok")
# 3. Redis node (operation: GET, key: "test:connection")
# Выполнить и проверить результат
```

---

## 📝 Best Practices

1. **Регулярный бэкап whitelist:**
   ```bash
   # Cron job для ежедневного бэкапа
   0 2 * * * /path/to/backup-whitelist.sh
   ```

2. **Логирование изменений:**
   - Добавляйте комментарий при добавлении пользователей
   - Ведите отдельный лог (Google Sheets/файл)

3. **Разделение прав:**
   - Whitelist - базовый доступ
   - Admins - управление пользователями
   - Superadmins - полный доступ + настройки

4. **Мониторинг:**
   ```bash
   # Проверка количества пользователей
   docker exec -it redis-container redis-cli KEYS "ozon:acl:whitelist:*" | wc -l
   ```

---

## 🔒 Security Tips

1. Не храните User ID в открытом виде в коде
2. Используйте Redis password
3. Ограничьте сетевой доступ к Redis (bind 127.0.0.1)
4. Регулярно обновляйте Redis
5. Настройте Redis ACL (Access Control Lists) если используете Redis 6+

---

## 📚 Дополнительные ресурсы

- [Redis Commands Documentation](https://redis.io/commands)
- [n8n Redis Node Documentation](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.redis/)
- [Redis Best Practices](https://redis.io/topics/security)
