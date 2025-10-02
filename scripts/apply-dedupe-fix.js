#!/usr/bin/env node
/**
 * Apply calendar dedupe fix:
 * - Add 11 new nodes for editMessageText + message_id persistence
 * - Update node positions
 * - Rewire connections
 * - Remove duplicate edges
 * - Add parse_mode to Render Multi-Date Keyboard
 */

const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, '..', 'workflows', 'ozon-telegram-bot.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('📝 Applying calendar dedupe fix...');

// Step 1: Add new nodes for multi-calendar branch (6 nodes)
const newNodesMulti = [
  {
    "parameters": {
      "operation": "get",
      "key": "=ozon:ui:{{ $('Extract User Data').first().json.user_id }}:calendar_msg_id",
      "propertyName": "value"
    },
    "type": "n8n-nodes-base.redis",
    "typeVersion": 1,
    "position": [2900, 520],
    "id": "get-calendar-msg-id",
    "name": "Get Calendar Msg ID",
    "credentials": { "redis": { "id": "kaA0Glj8bB5pwqRt", "name": "Redis account" } }
  },
  {
    "parameters": {
      "conditions": {
        "options": { "caseSensitive": true, "typeValidation": "strict", "version": 2 },
        "conditions": [
          {
            "id": "has-msg",
            "leftValue": "={{ $json.value && $json.value !== '' }}",
            "rightValue": "true",
            "operator": { "type": "boolean", "operation": "true", "singleValue": true }
          }
        ],
        "combinator": "and"
      }
    },
    "type": "n8n-nodes-base.if",
    "typeVersion": 2.2,
    "position": [3100, 520],
    "id": "if-has-calendar-msg",
    "name": "Has Calendar Msg?"
  },
  {
    "parameters": {
      "method": "POST",
      "url": "=https://api.telegram.org/bot{{ $('Config').first().json.TELEGRAM_BOT_TOKEN }}/editMessageText",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": "={{ JSON.stringify({ chat_id: $json.chat_id, message_id: $('Get Calendar Msg ID').first().json.value, text: $json.text, parse_mode: 'HTML', reply_markup: $json.reply_markup }) }}"
    },
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": [3300, 500],
    "id": "edit-calendar",
    "name": "Edit Calendar"
  },
  {
    "parameters": {
      "jsCode": "const res = $input.first().json; const id = res?.result?.message_id || res?.message_id || null; return [{ json: { user_id: $('Extract User Data').first().json.user_id, calendar_message_id: String(id || '') } }];"
    },
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [3700, 560],
    "id": "extract-calendar-msg-id",
    "name": "Extract Calendar Msg ID"
  },
  {
    "parameters": {
      "operation": "set",
      "key": "=ozon:ui:{{ $json.user_id }}:calendar_msg_id",
      "value": "={{ $json.calendar_message_id }}",
      "options": { "ttl": 86400 }
    },
    "type": "n8n-nodes-base.redis",
    "typeVersion": 1,
    "position": [3900, 560],
    "id": "persist-calendar-msg-id",
    "name": "Persist Calendar Msg ID",
    "credentials": { "redis": { "id": "kaA0Glj8bB5pwqRt", "name": "Redis account" } }
  }
];

// Step 2: Add new nodes for init branch (5 nodes)
const newNodesInit = [
  {
    "parameters": {
      "operation": "get",
      "key": "=ozon:ui:{{ $('Extract User Data').first().json.user_id }}:calendar_msg_id",
      "propertyName": "value"
    },
    "type": "n8n-nodes-base.redis",
    "typeVersion": 1,
    "position": [3100, 240],
    "id": "get-calendar-msg-id-init",
    "name": "Get Calendar Msg ID (Init)",
    "credentials": { "redis": { "id": "kaA0Glj8bB5pwqRt", "name": "Redis account" } }
  },
  {
    "parameters": {
      "conditions": {
        "options": { "caseSensitive": true, "typeValidation": "strict", "version": 2 },
        "conditions": [
          {
            "id": "has-msg-init",
            "leftValue": "={{ $json.value && $json.value !== '' }}",
            "rightValue": "true",
            "operator": { "type": "boolean", "operation": "true", "singleValue": true }
          }
        ],
        "combinator": "and"
      }
    },
    "type": "n8n-nodes-base.if",
    "typeVersion": 2.2,
    "position": [3300, 240],
    "id": "if-has-calendar-msg-init",
    "name": "Has Calendar Msg? (Init)"
  },
  {
    "parameters": {
      "method": "POST",
      "url": "=https://api.telegram.org/bot{{ $('Config').first().json.TELEGRAM_BOT_TOKEN }}/editMessageText",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": "={{ JSON.stringify({ chat_id: $json.chat_id, message_id: $('Get Calendar Msg ID (Init)').first().json.value, text: $json.text, parse_mode: 'HTML', reply_markup: $json.reply_markup }) }}"
    },
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": [3500, 220],
    "id": "edit-calendar-init",
    "name": "Edit Calendar (Init)"
  },
  {
    "parameters": {
      "jsCode": "const res = $input.first().json; const id = res?.result?.message_id || res?.message_id || null; return [{ json: { user_id: $('Extract User Data').first().json.user_id, calendar_message_id: String(id || '') } }];"
    },
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [3700, 260],
    "id": "extract-calendar-msg-id-init",
    "name": "Extract Calendar Msg ID (Init)"
  },
  {
    "parameters": {
      "operation": "set",
      "key": "=ozon:ui:{{ $json.user_id }}:calendar_msg_id",
      "value": "={{ $json.calendar_message_id }}",
      "options": { "ttl": 86400 }
    },
    "type": "n8n-nodes-base.redis",
    "typeVersion": 1,
    "position": [3900, 260],
    "id": "persist-calendar-msg-id-init",
    "name": "Persist Calendar Msg ID (Init)",
    "credentials": { "redis": { "id": "kaA0Glj8bB5pwqRt", "name": "Redis account" } }
  }
];

// Add all new nodes
workflow.nodes.push(...newNodesMulti, ...newNodesInit);
console.log(`✅ Added ${newNodesMulti.length + newNodesInit.length} new nodes`);

// Step 3: Update positions of existing nodes
const nodePositionUpdates = {
  "n-send-grid": [3500, 560],  // Was Send Multi-Date Keyboard, renamed
  "n-send-cal": [3500, 260]     // Was Send Date Selection
};

for (const [nodeId, newPos] of Object.entries(nodePositionUpdates)) {
  const node = workflow.nodes.find(n => n.id === nodeId);
  if (node) {
    node.position = newPos;
    console.log(`✅ Updated position for ${node.name}`);
  }
}

// Step 4: Add parse_mode to Render Calendar Grid (rerender)
const renderNode = workflow.nodes.find(n => n.id === 'n-render-grid' && n.name === 'Render Calendar Grid (rerender)');
if (renderNode) {
  // Update the jsCode to include parse_mode: "HTML"
  const oldCode = renderNode.parameters.jsCode;
  const newCode = oldCode.replace(
    /return \[\{ json:\{ chat_id:chatId, text:`📅 Мультивыбор дат\\\\n\\\\n\$\{header\}`, reply_markup:keyboard \} \}\];/,
    'return [{ json:{ chat_id:chatId, text:`📅 Мультивыбор дат\\\\n\\\\n${header}`, parse_mode:"HTML", reply_markup:keyboard } }];'
  );
  renderNode.parameters.jsCode = newCode;
  console.log(`✅ Added parse_mode to Render Calendar Grid (rerender)`);
}

// Step 5: Rewire connections for multi-calendar branch
// Old: Render Calendar Grid (rerender) -> Send Calendar Grid
// New: Render Calendar Grid (rerender) -> Get Calendar Msg ID -> Has Calendar Msg? -> [Edit Calendar | Send Calendar Grid] -> Extract Calendar Msg ID -> Persist Calendar Msg ID

// Remove old direct connection
if (workflow.connections["Render Calendar Grid (rerender)"]) {
  delete workflow.connections["Render Calendar Grid (rerender)"];
}

// Add new connections
workflow.connections["Render Calendar Grid (rerender)"] = {
  "main": [[{ "node": "Get Calendar Msg ID", "type": "main", "index": 0 }]]
};

workflow.connections["Get Calendar Msg ID"] = {
  "main": [[{ "node": "Has Calendar Msg?", "type": "main", "index": 0 }]]
};

workflow.connections["Has Calendar Msg?"] = {
  "main": [
    [{ "node": "Edit Calendar", "type": "main", "index": 0 }],
    [{ "node": "Send Calendar Grid", "type": "main", "index": 0 }]
  ]
};

workflow.connections["Edit Calendar"] = {
  "main": [[{ "node": "Extract Calendar Msg ID", "type": "main", "index": 0 }]]
};

workflow.connections["Send Calendar Grid"] = {
  "main": [[{ "node": "Extract Calendar Msg ID", "type": "main", "index": 0 }]]
};

workflow.connections["Extract Calendar Msg ID"] = {
  "main": [[{ "node": "Persist Calendar Msg ID", "type": "main", "index": 0 }]]
};

console.log(`✅ Rewired multi-calendar connections`);

// Step 6: Rewire connections for init branch
// Old: Render Calendar Grid -> Send Calendar
// New: Render Calendar Grid -> Get Calendar Msg ID (Init) -> Has Calendar Msg? (Init) -> [Edit Calendar (Init) | Send Calendar] -> Extract Calendar Msg ID (Init) -> Persist Calendar Msg ID (Init)

workflow.connections["Render Calendar Grid"] = {
  "main": [[{ "node": "Get Calendar Msg ID (Init)", "type": "main", "index": 0 }]]
};

workflow.connections["Get Calendar Msg ID (Init)"] = {
  "main": [[{ "node": "Has Calendar Msg? (Init)", "type": "main", "index": 0 }]]
};

workflow.connections["Has Calendar Msg? (Init)"] = {
  "main": [
    [{ "node": "Edit Calendar (Init)", "type": "main", "index": 0 }],
    [{ "node": "Send Calendar", "type": "main", "index": 0 }]
  ]
};

workflow.connections["Edit Calendar (Init)"] = {
  "main": [[{ "node": "Extract Calendar Msg ID (Init)", "type": "main", "index": 0 }]]
};

workflow.connections["Send Calendar"] = {
  "main": [[{ "node": "Extract Calendar Msg ID (Init)", "type": "main", "index": 0 }]]
};

workflow.connections["Extract Calendar Msg ID (Init)"] = {
  "main": [[{ "node": "Persist Calendar Msg ID (Init)", "type": "main", "index": 0 }]]
};

console.log(`✅ Rewired init connections`);

// Step 7: Fix Route Message connections - add missing DateSelection connection and remove duplicate
// The Route Message has outputs: Start, CSV, XLSX, Menu, DateSelection, CalNav, DatesDone, DatesReset, Noop
// But connections only has 7 entries instead of 9

const routeConnections = workflow.connections["Route Message"].main;

// Current state has 7 connections, should map to these outputs in order:
// 0: Start -> Generate Main Menu ✓
// 1: CSV -> Ensure CSV Document ✓
// 2: XLSX -> Ensure XLSX Document (was at index 4) - MISSING
// 3: Menu -> Handle Menu ✓
// 4: DateSelection -> Get Selected Dates (toggle) - MISSING
// 5: CalNav -> Handle Calendar Nav ✓
// 6: DatesDone -> Get Selected Dates (Done) ✓
// 7: DatesReset -> Reset Dates ✓
// 8: Noop -> (empty)

// Fix: Insert the missing connections at correct indices
workflow.connections["Route Message"] = {
  "main": [
    [{ "node": "Generate Main Menu", "type": "main", "index": 0 }],  // 0: Start
    [{ "node": "Ensure CSV Document", "type": "main", "index": 0 }], // 1: CSV
    [{ "node": "Ensure XLSX Document", "type": "main", "index": 0 }], // 2: XLSX
    [{ "node": "Handle Menu", "type": "main", "index": 0 }],         // 3: Menu
    [{ "node": "Get Selected Dates (toggle)", "type": "main", "index": 0 }], // 4: DateSelection
    [{ "node": "Handle Calendar Nav", "type": "main", "index": 0 }], // 5: CalNav
    [{ "node": "Get Selected Dates (Done)", "type": "main", "index": 0 }],   // 6: DatesDone
    [{ "node": "Reset Dates", "type": "main", "index": 0 }],         // 7: DatesReset
    []  // 8: Noop (empty)
  ]
};

console.log(`✅ Fixed Route Message connections (added DateSelection route)`);

// Write updated workflow
fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 2));
console.log(`\n✅ Successfully applied all changes to ${workflowPath}`);
console.log(`📊 Total nodes: ${workflow.nodes.length}`);
console.log(`📊 Total connections: ${Object.keys(workflow.connections).length}`);
