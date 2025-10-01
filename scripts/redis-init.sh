#!/bin/bash

# Redis Initialization Script for Ozon Telegram Bot
# This script initializes Redis with required keys and super admins

set -e

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Redis connection info
REDIS_HOST=${REDIS_HOST:-localhost}
REDIS_PORT=${REDIS_PORT:-6379}
REDIS_PASSWORD=${REDIS_PASSWORD:-}

# Redis CLI command
if [ -n "$REDIS_PASSWORD" ]; then
    REDIS_CLI="redis-cli -h $REDIS_HOST -p $REDIS_PORT -a $REDIS_PASSWORD"
else
    REDIS_CLI="redis-cli -h $REDIS_HOST -p $REDIS_PORT"
fi

echo "🔧 Initializing Redis for Ozon Telegram Bot..."
echo "   Redis Host: $REDIS_HOST:$REDIS_PORT"
echo ""

# Initialize super admins from environment variable
if [ -n "$SUPER_ADMINS" ]; then
    echo "👑 Initializing super admins..."
    IFS=',' read -ra ADMINS <<< "$SUPER_ADMINS"
    for admin_id in "${ADMINS[@]}"; do
        admin_id=$(echo $admin_id | xargs) # trim whitespace
        echo "   Adding super admin: $admin_id"
        $REDIS_CLI SADD ozon:acl:superadmins "$admin_id" > /dev/null
        $REDIS_CLI SADD ozon:acl:admins "$admin_id" > /dev/null
        $REDIS_CLI SADD ozon:acl:whitelist "$admin_id" > /dev/null
    done
    echo "   ✅ Super admins initialized"
else
    echo "⚠️  Warning: SUPER_ADMINS not set in environment"
fi

echo ""
echo "📊 Current Redis keys:"
$REDIS_CLI KEYS "ozon:*"

echo ""
echo "👥 Whitelist users:"
$REDIS_CLI SMEMBERS ozon:acl:whitelist

echo ""
echo "👑 Admin users:"
$REDIS_CLI SMEMBERS ozon:acl:admins

echo ""
echo "✅ Redis initialization complete!"
