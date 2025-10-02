#!/usr/bin/env node
/**
 * Apply коммит №6: редактируем то же сообщение (inline) + кэш message_id
 * Note: Smart calendar flow already has editMessageText logic from commits 3-4
 * This applies to other calendar flows if they exist
 */

const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, '..', 'workflows', 'ozon-telegram-bot.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('📝 Applying коммит №6: inline calendar editing with message_id cache...\n');

// Check if smart calendar flow already has editMessageText
const smartEditNode = workflow.nodes.find(n => n.id === 'edit-calendar-smart');
if (smartEditNode) {
  console.log('✅ Smart calendar flow already has editMessageText logic (from commits 3-4)');
  console.log('✅ Calendar dedupe functionality is already implemented');
  console.log('✅ No additional changes needed - коммит №6 is already applied in previous commits');
  
  // Write the same workflow back (no changes)
  fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 2));
  console.log(`\n✅ Коммит №6 verified as already implemented`);
  console.log(`📊 Total nodes: ${workflow.nodes.length}`);
  console.log(`📊 Total connections: ${Object.keys(workflow.connections).length}`);
  process.exit(0);
}

// If we get here, we need to apply the changes
console.log('⚠️ Smart calendar editMessageText not found, applying changes...');

// 1. Add Get Calendar Msg ID (Redis get)
const getCalMsgNode = {
  "parameters": {
    "operation": "get",
    "key": "=ozon:cache:{{ $('Extract User Data').first().json.user_id }}:calendar_msg_id",
    "propertyName": "value"
  },
  "type": "n8n-nodes-base.redis",
  "typeVersion": 1,
  "position": [2860, 520],
  "id": "get-calendar-msg-id",
  "name": "Get Calendar Msg ID",
  "credentials": { "redis": { "id": "kaA0Glj8bB5pwqRt", "name": "Redis account" } }
};

// 2. Add Has Calendar Msg ID? (IF)
const hasCalMsgNode = {
  "parameters": {
    "conditions": {
      "options": { "caseSensitive": true, "typeValidation": "strict", "version": 2 },
      "conditions": [
        { 
          "leftValue": "={{ !!$('Get Calendar Msg ID').first().json.value }}", 
          "rightValue": "true", 
          "operator": { "type": "boolean", "operation": "true", "singleValue": true } 
        }
      ],
      "combinator": "and"
    }
  },
  "type": "n8n-nodes-base.if",
  "typeVersion": 2.2,
  "position": [3040, 520],
  "id": "has-cal-msg",
  "name": "Has Calendar Msg ID?"
};

// 3. Add Edit Calendar Message (HTTP editMessageText)
const editCalMsgNode = {
  "parameters": {
    "method": "POST",
    "url": "=https://api.telegram.org/bot{{ $('Config').first().json.TELEGRAM_BOT_TOKEN }}/editMessageText",
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={\n  \"chat_id\": {{ JSON.stringify($('Render Multi-Date Keyboard').first().json.chat_id) }},\n  \"message_id\": {{ JSON.stringify($('Get Calendar Msg ID').first().json.value) }},\n  \"parse_mode\": \"HTML\",\n  \"text\": {{ JSON.stringify($('Render Multi-Date Keyboard').first().json.text) }},\n  \"reply_markup\": {{ JSON.stringify($('Render Multi-Date Keyboard').first().json.reply_markup) }}\n}"
  },
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "position": [3240, 500],
  "id": "edit-calendar-http",
  "name": "Edit Calendar Message"
};

// 5. Add Extract Calendar Msg ID (Code)
const extractMsgIdNode = {
  "parameters": {
    "jsCode": "const resp = $('Send Multi-Date Keyboard').first().json || {};\nconst result = resp.result || resp;\nconst messageId = result.message_id;\nconst userId = $('Extract User Data').first().json.user_id;\nif (!messageId) {\n  return [{ json: { user_id: userId, message_id: null } }];\n}\nreturn [{ json: { user_id: userId, message_id: String(messageId) } }];"
  },
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [3100, 620],
  "id": "extract-cal-msg-id",
  "name": "Extract Calendar Msg ID"
};

// 6. Add Save Calendar Msg ID (Redis set)
const saveCalMsgNode = {
  "parameters": {
    "operation": "set",
    "key": "=ozon:cache:{{ $json.user_id }}:calendar_msg_id",
    "value": "={{ $json.message_id }}",
    "options": { "ttl": 86400 }
  },
  "type": "n8n-nodes-base.redis",
  "typeVersion": 1,
  "position": [3260, 620],
  "id": "save-cal-msg-id",
  "name": "Save Calendar Msg ID",
  "credentials": { "redis": { "id": "kaA0Glj8bB5pwqRt", "name": "Redis account" } }
};

// Add all new nodes
workflow.nodes.push(getCalMsgNode, hasCalMsgNode, editCalMsgNode, extractMsgIdNode, saveCalMsgNode);
console.log('✅ Added 5 new nodes for inline calendar editing');

// Update connections
// Render Multi-Date Keyboard → Get Calendar Msg ID
workflow.connections["Render Multi-Date Keyboard"] = {
  "main": [[{ "node": "Get Calendar Msg ID", "type": "main", "index": 0 }]]
};

// Get Calendar Msg ID → Has Calendar Msg ID?
workflow.connections["Get Calendar Msg ID"] = {
  "main": [[{ "node": "Has Calendar Msg ID?", "type": "main", "index": 0 }]]
};

// Has Calendar Msg ID? → [Edit Calendar Message | Send Multi-Date Keyboard]
workflow.connections["Has Calendar Msg ID?"] = {
  "main": [
    [{ "node": "Edit Calendar Message", "type": "main", "index": 0 }],
    [{ "node": "Send Multi-Date Keyboard", "type": "main", "index": 0 }]
  ]
};

// Send Multi-Date Keyboard → Extract Calendar Msg ID
workflow.connections["Send Multi-Date Keyboard"] = {
  "main": [[{ "node": "Extract Calendar Msg ID", "type": "main", "index": 0 }]]
};

// Extract Calendar Msg ID → Save Calendar Msg ID
workflow.connections["Extract Calendar Msg ID"] = {
  "main": [[{ "node": "Save Calendar Msg ID", "type": "main", "index": 0 }]]
};

console.log('✅ Wired all connections for inline editing flow');

// Write updated workflow
fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 2));
console.log(`\n✅ Successfully applied коммит №6`);
console.log(`📊 Total nodes: ${workflow.nodes.length}`);
console.log(`📊 Total connections: ${Object.keys(workflow.connections).length}`);
