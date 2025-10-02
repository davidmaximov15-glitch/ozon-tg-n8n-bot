#!/usr/bin/env node
/**
 * Apply коммит №7: считать статистику только после dates:done и только при наличии сессии
 */

const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, '..', 'workflows', 'ozon-telegram-bot.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('📝 Applying коммит №7: statistics only after dates:done with valid session...\n');

// Find required nodes
const handleDoneNode = workflow.nodes.find(n => n.name === 'Handle Done');
const getCachedDataNode = workflow.nodes.find(n => n.name === 'Get Cached Data (for stats)');
const answerNeedSelectNode = workflow.nodes.find(n => n.name === 'Answer Callback (needSelect)');
const calculateStatsNode = workflow.nodes.find(n => n.name === 'Calculate Statistics');

if (!handleDoneNode) {
  console.error('❌ Handle Done node not found');
  process.exit(1);
}
if (!getCachedDataNode) {
  console.error('❌ Get Cached Data (for stats) node not found');
  process.exit(1);
}
if (!calculateStatsNode) {
  console.error('❌ Calculate Statistics node not found');
  process.exit(1);
}

console.log('✅ Found required nodes');

// 1. Remove old connection: Handle Date Callback → Get Cached Data
const handleDateCallback = workflow.connections["Handle Date Callback"];
if (handleDateCallback) {
  delete workflow.connections["Handle Date Callback"];
  console.log('✅ Removed Handle Date Callback → Get Cached Data connection');
}

// 2. Add Has Selection? IF node
const hasSelectionNode = {
  "parameters": {
    "conditions": {
      "options": { "caseSensitive": true, "typeValidation": "strict", "version": 2 },
      "conditions": [
        { 
          "leftValue": "={{ Array.isArray($json.selectedDates) && $json.selectedDates.length > 0 }}", 
          "rightValue": "true", 
          "operator": { "type": "boolean", "operation": "true", "singleValue": true } 
        }
      ],
      "combinator": "and"
    }
  },
  "type": "n8n-nodes-base.if",
  "typeVersion": 2.2,
  "position": [2460, 700],
  "id": "has-selection",
  "name": "Has Selection?"
};

// 3. Add Has CSV? IF node
const hasCsvNode = {
  "parameters": {
    "conditions": {
      "options": { "caseSensitive": true, "typeValidation": "strict", "version": 2 },
      "conditions": [
        { 
          "leftValue": "={{ !!$json.value }}", 
          "rightValue": "true", 
          "operator": { "type": "boolean", "operation": "true", "singleValue": true } 
        }
      ],
      "combinator": "and"
    }
  },
  "type": "n8n-nodes-base.if",
  "typeVersion": 2.2,
  "position": [2280, 760],
  "id": "has-csv",
  "name": "Has CSV?"
};

// 4. Add Answer Callback (no-file) node
const answerNoFileNode = {
  "parameters": {
    "method": "POST",
    "url": "=https://api.telegram.org/bot{{ $('Config').first().json.TELEGRAM_BOT_TOKEN }}/answerCallbackQuery",
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={\n  \"callback_query_id\": {{ JSON.stringify($('Extract User Data').first().json.callback_query_id) }},\n  \"text\": \"Файл не найден. Загрузите отчёт .csv/.xlsx\",\n  \"show_alert\": false\n}"
  },
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "position": [2480, 820],
  "id": "answer-callback-no-file",
  "name": "Answer Callback (no-file)"
};

// Add new nodes
workflow.nodes.push(hasSelectionNode, hasCsvNode, answerNoFileNode);
console.log('✅ Added 3 new validation nodes');

// Update connections

// Handle Done → Has Selection?
workflow.connections["Handle Done"] = {
  "main": [[{ "node": "Has Selection?", "type": "main", "index": 0 }]]
};

// Has Selection? → [Answer Callback (needSelect) | Get Cached Data (for stats)]
const needSelectNodeName = answerNeedSelectNode ? answerNeedSelectNode.name : 'Answer Callback (needSelect)';
workflow.connections["Has Selection?"] = {
  "main": [
    [{ "node": needSelectNodeName, "type": "main", "index": 0 }],
    [{ "node": "Get Cached Data (for stats)", "type": "main", "index": 0 }]
  ]
};

// Get Cached Data (for stats) → Has CSV?
workflow.connections["Get Cached Data (for stats)"] = {
  "main": [[{ "node": "Has CSV?", "type": "main", "index": 0 }]]
};

// Has CSV? → [Answer Callback (no-file) | Calculate Statistics]
workflow.connections["Has CSV?"] = {
  "main": [
    [{ "node": "Answer Callback (no-file)", "type": "main", "index": 0 }],
    [{ "node": "Calculate Statistics", "type": "main", "index": 0 }]
  ]
};

console.log('✅ Wired all connections for gated statistics flow');

// Write updated workflow
fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 2));
console.log(`\n✅ Successfully applied коммит №7`);
console.log(`📊 Total nodes: ${workflow.nodes.length}`);
console.log(`📊 Total connections: ${Object.keys(workflow.connections).length}`);
