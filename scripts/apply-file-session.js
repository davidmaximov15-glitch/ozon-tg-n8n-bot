#!/usr/bin/env node
/**
 * Apply file session management:
 * - Add CalOpen and FileClear routes to Route Message
 * - Add file status display in Orders menu
 * - Add cal:open flow with file check
 * - Add file:clear flow with cleanup
 */

const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, '..', 'workflows', 'ozon-telegram-bot.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('📝 Applying file session management...');

// Step 1: Add CalOpen and FileClear to Route Message switch rules
const routeNode = workflow.nodes.find(n => n.id === 'n-route' && n.name === 'Route Message');
if (!routeNode) {
  console.error('❌ Route Message node not found!');
  process.exit(1);
}

const newRules = [
  {
    "outputKey": "CalOpen",
    "conditions": {
      "options": { "caseSensitive": true, "typeValidation": "strict", "version": 2 },
      "conditions": [
        { "leftValue": "={{ $('Extract User Data').first().json.callback_data }}", "rightValue": "cal:open", "operator": { "type": "string", "operation": "equals" } }
      ],
      "combinator": "and"
    }
  },
  {
    "outputKey": "FileClear",
    "conditions": {
      "options": { "caseSensitive": true, "typeValidation": "strict", "version": 2 },
      "conditions": [
        { "leftValue": "={{ $('Extract User Data').first().json.callback_data }}", "rightValue": "file:clear", "operator": { "type": "string", "operation": "equals" } }
      ],
      "combinator": "and"
    }
  }
];

routeNode.parameters.rules.values.push(...newRules);
console.log(`✅ Added CalOpen and FileClear routes to Route Message`);

// Step 2: Add new nodes for orders menu
const newNodesOrdersMenu = [
  {
    "parameters": {
      "operation": "get",
      "key": "=ozon:cache:{{ $('Extract User Data').first().json.user_id }}:csv_data",
      "propertyName": "value"
    },
    "type": "n8n-nodes-base.redis",
    "typeVersion": 1,
    "position": [2060, 120],
    "id": "get-csv-meta-for-orders",
    "name": "Get CSV Meta (Menu)",
    "credentials": { "redis": { "id": "kaA0Glj8bB5pwqRt", "name": "Redis account" } }
  },
  {
    "parameters": {
      "jsCode": "const chatId=$('Extract User Data').first().json.chat_id;\nlet meta={};\ntry{ const raw=$('Get CSV Meta (Menu)').first().json.value; meta= raw? JSON.parse(raw):{}; }catch(e){ meta={}; }\nconst hasFile = meta && Array.isArray(meta.availableDates) && meta.availableDates.length>0;\nlet text = '📦 <b>Раздел: Заказы</b>\\n\\n';\nif(hasFile){\n  const months = Array.from(new Set((meta.availableDates||[]).map(d=>d.slice(0,7)))).sort();\n  text += `✅ Файл загружен\\nДиапазон: <b>${months[0]}</b>${months.length>1?` … <b>${months[months.length-1]}</b>`:''}\\nВсего записей: <b>${meta.totalRecords||0}</b>\\n\\n`;\n} else {\n  text += 'Загрузите отчёт Ozon (.csv/.xlsx, до 20MB), затем откройте календарь.\\n\\n';\n}\nconst kb = { inline_keyboard: [] };\nkb.inline_keyboard.push([{ text: '📅 Открыть календарь', callback_data: 'cal:open' }]);\nkb.inline_keyboard.push([{ text: '🧹 Очистить файл', callback_data: 'file:clear' }]);\nkb.inline_keyboard.push([{ text: '« Назад', callback_data: '/start' }]);\nreturn [{ json: { chat_id: chatId, text, reply_markup: kb } }];"
    },
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [2260, 160],
    "id": "render-orders-menu",
    "name": "Render Orders Menu"
  }
];

// Step 3: Add cal:open branch nodes
const newNodesCalOpen = [
  {
    "parameters": {
      "operation": "get",
      "key": "=ozon:cache:{{ $('Extract User Data').first().json.user_id }}:csv_data",
      "propertyName": "value"
    },
    "type": "n8n-nodes-base.redis",
    "typeVersion": 1,
    "position": [2060, 300],
    "id": "fetch-csv-meta-calopen",
    "name": "Fetch CSV Meta (calopen)",
    "credentials": { "redis": { "id": "kaA0Glj8bB5pwqRt", "name": "Redis account" } }
  },
  {
    "parameters": {
      "conditions": {
        "options": { "caseSensitive": true, "typeValidation": "strict", "version": 2 },
        "conditions": [
          { "leftValue": "={{ !!($json.value) }}", "rightValue": "true", "operator": { "type": "boolean", "operation": "true", "singleValue": true } }
        ],
        "combinator": "and"
      }
    },
    "type": "n8n-nodes-base.if",
    "typeVersion": 2.2,
    "position": [2260, 300],
    "id": "if-has-file-calopen",
    "name": "Has File? (calopen)"
  },
  {
    "parameters": {
      "method": "POST",
      "url": "=https://api.telegram.org/bot{{ $('Config').first().json.TELEGRAM_BOT_TOKEN }}/answerCallbackQuery",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": "={\n  \"callback_query_id\": {{ JSON.stringify($('Extract User Data').first().json.callback_query_id) }},\n  \"text\": \"Сначала загрузите файл отчёта\",\n  \"show_alert\": false\n}"
    },
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": [2460, 340],
    "id": "answer-need-file",
    "name": "Answer Callback (need file)"
  }
];

// Step 4: Add file:clear branch nodes
const newNodesFileClear = [
  {
    "parameters": {
      "operation": "get",
      "key": "=ozon:ui:{{ $('Extract User Data').first().json.user_id }}:calendar_msg_id",
      "propertyName": "value"
    },
    "type": "n8n-nodes-base.redis",
    "typeVersion": 1,
    "position": [2060, 440],
    "id": "get-cal-msg-clear",
    "name": "Get Calendar Msg ID (clear)",
    "credentials": { "redis": { "id": "kaA0Glj8bB5pwqRt", "name": "Redis account" } }
  },
  {
    "parameters": {
      "conditions": {
        "options": { "caseSensitive": true, "typeValidation": "strict", "version": 2 },
        "conditions": [
          { "leftValue": "={{ !!$json.value }}", "rightValue": "true", "operator": { "type": "boolean", "operation": "true", "singleValue": true } }
        ],
        "combinator": "and"
      }
    },
    "type": "n8n-nodes-base.if",
    "typeVersion": 2.2,
    "position": [2260, 440],
    "id": "if-has-cal-msg-clear",
    "name": "Has Calendar Msg? (clear)"
  },
  {
    "parameters": {
      "method": "POST",
      "url": "=https://api.telegram.org/bot{{ $('Config').first().json.TELEGRAM_BOT_TOKEN }}/deleteMessage",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": "={{ JSON.stringify({ chat_id: $('Extract User Data').first().json.chat_id, message_id: $('Get Calendar Msg ID (clear)').first().json.value }) }}"
    },
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": [2460, 420],
    "id": "delete-calendar-msg",
    "name": "Delete Calendar Message"
  },
  {
    "parameters": { "operation": "delete", "key": "=ozon:cache:{{ $('Extract User Data').first().json.user_id }}:csv_data" },
    "type": "n8n-nodes-base.redis",
    "typeVersion": 1,
    "position": [2460, 480],
    "id": "del-csv-data",
    "name": "Del csv_data",
    "credentials": { "redis": { "id": "kaA0Glj8bB5pwqRt", "name": "Redis account" } }
  },
  {
    "parameters": { "operation": "delete", "key": "=ozon:cache:{{ $('Extract User Data').first().json.user_id }}:selected_dates" },
    "type": "n8n-nodes-base.redis",
    "typeVersion": 1,
    "position": [2660, 480],
    "id": "del-selected-dates",
    "name": "Del selected_dates",
    "credentials": { "redis": { "id": "kaA0Glj8bB5pwqRt", "name": "Redis account" } }
  },
  {
    "parameters": { "operation": "delete", "key": "=ozon:ui:{{ $('Extract User Data').first().json.user_id }}:calendar_msg_id" },
    "type": "n8n-nodes-base.redis",
    "typeVersion": 1,
    "position": [2860, 480],
    "id": "del-cal-msg-id",
    "name": "Del calendar_msg_id",
    "credentials": { "redis": { "id": "kaA0Glj8bB5pwqRt", "name": "Redis account" } }
  },
  {
    "parameters": {
      "method": "POST",
      "url": "=https://api.telegram.org/bot{{ $('Config').first().json.TELEGRAM_BOT_TOKEN }}/answerCallbackQuery",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": "={\n  \"callback_query_id\": {{ JSON.stringify($('Extract User Data').first().json.callback_query_id) }},\n  \"text\": \"Файл и выбор дат очищены\",\n  \"show_alert\": false\n}"
    },
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": [3060, 520],
    "id": "answer-cleared",
    "name": "Answer Callback (cleared)"
  }
];

// Add all new nodes
workflow.nodes.push(...newNodesOrdersMenu, ...newNodesCalOpen, ...newNodesFileClear);
console.log(`✅ Added ${newNodesOrdersMenu.length + newNodesCalOpen.length + newNodesFileClear.length} new nodes`);

// Step 5: Update Route Message connections to add CalOpen and FileClear outputs
// Need to rebuild the entire array to match the 11 outputKeys:
// [Start, CSV, XLSX, Menu, DateSelection, CalNav, DatesDone, DatesReset, Noop, CalOpen, FileClear]

workflow.connections["Route Message"].main = [
  [{ "node": "Generate Main Menu", "type": "main", "index": 0 }],  // 0: Start
  [{ "node": "Ensure CSV Document", "type": "main", "index": 0 }], // 1: CSV
  [{ "node": "Ensure XLSX Document", "type": "main", "index": 0 }], // 2: XLSX
  [{ "node": "Handle Menu", "type": "main", "index": 0 }],         // 3: Menu
  [{ "node": "Get Selected Dates (toggle)", "type": "main", "index": 0 }], // 4: DateSelection
  [{ "node": "Handle Calendar Nav", "type": "main", "index": 0 }], // 5: CalNav
  [{ "node": "Get Selected Dates (Done)", "type": "main", "index": 0 }],   // 6: DatesDone
  [{ "node": "Reset Dates", "type": "main", "index": 0 }],         // 7: DatesReset
  [],  // 8: Noop (empty)
  [{ "node": "Fetch CSV Meta (calopen)", "type": "main", "index": 0 }], // 9: CalOpen
  [{ "node": "Get Calendar Msg ID (clear)", "type": "main", "index": 0 }]  // 10: FileClear
];

console.log(`✅ Updated Route Message connections (added CalOpen and FileClear routes)`);

// Step 6: Add orders menu flow connections
// Handle Menu -> Get CSV Meta (Menu)
workflow.connections["Handle Menu"].main.push([{ "node": "Get CSV Meta (Menu)", "type": "main", "index": 0 }]);

workflow.connections["Get CSV Meta (Menu)"] = {
  "main": [[{ "node": "Render Orders Menu", "type": "main", "index": 0 }]]
};

workflow.connections["Render Orders Menu"] = {
  "main": [[{ "node": "Prepare Menu Response", "type": "main", "index": 0 }]]
};

console.log(`✅ Added orders menu flow connections`);

// Step 7: Add cal:open flow connections
workflow.connections["Fetch CSV Meta (calopen)"] = {
  "main": [[{ "node": "Has File? (calopen)", "type": "main", "index": 0 }]]
};

workflow.connections["Has File? (calopen)"] = {
  "main": [
    [{ "node": "Calc Initial Month", "type": "main", "index": 0 }],  // true: use existing calendar flow
    [{ "node": "Answer Callback (need file)", "type": "main", "index": 0 }]  // false: show toast
  ]
};

console.log(`✅ Added cal:open flow connections`);

// Step 8: Add file:clear flow connections
workflow.connections["Get Calendar Msg ID (clear)"] = {
  "main": [[{ "node": "Has Calendar Msg? (clear)", "type": "main", "index": 0 }]]
};

workflow.connections["Has Calendar Msg? (clear)"] = {
  "main": [
    [{ "node": "Delete Calendar Message", "type": "main", "index": 0 }],  // true: delete message
    [{ "node": "Del csv_data", "type": "main", "index": 0 }]  // false: skip to delete keys
  ]
};

workflow.connections["Delete Calendar Message"] = {
  "main": [[{ "node": "Del csv_data", "type": "main", "index": 0 }]]
};

workflow.connections["Del csv_data"] = {
  "main": [[{ "node": "Del selected_dates", "type": "main", "index": 0 }]]
};

workflow.connections["Del selected_dates"] = {
  "main": [[{ "node": "Del calendar_msg_id", "type": "main", "index": 0 }]]
};

workflow.connections["Del calendar_msg_id"] = {
  "main": [[{ "node": "Answer Callback (cleared)", "type": "main", "index": 0 }]]
};

workflow.connections["Answer Callback (cleared)"] = {
  "main": [[{ "node": "Get CSV Meta (Menu)", "type": "main", "index": 0 }]]
};

console.log(`✅ Added file:clear flow connections`);

// Write updated workflow
fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 2));
console.log(`\n✅ Successfully applied all changes to ${workflowPath}`);
console.log(`📊 Total nodes: ${workflow.nodes.length}`);
console.log(`📊 Total connections: ${Object.keys(workflow.connections).length}`);
console.log(`📊 Route Message outputs: ${workflow.connections["Route Message"].main.length}`);
