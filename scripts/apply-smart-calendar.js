#!/usr/bin/env node
/**
 * Apply smart calendar with:
 * - Month session management (only available months)
 * - Navigation with boundary checks
 * - Available days only (clickable)
 * - editMessageText for same-message updates
 */

const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, '..', 'workflows', 'ozon-telegram-bot.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('📝 Applying smart calendar navigation...');

// Step 1: Update existing Calc Initial Month to be smarter
const calcMonthNode = workflow.nodes.find(n => n.id === 'n-calc-month');
if (calcMonthNode) {
  calcMonthNode.parameters.jsCode = `let meta={};\ntry{ const raw=$('Fetch CSV Meta (calopen)').first()?.json.value || $('Cache CSV Meta').first()?.json.value; meta = raw? JSON.parse(raw):{}; }catch(e){ meta={}; }\nconst dates = Array.isArray(meta.availableDates)? meta.availableDates:[];\nif(!dates.length) return [{ json: { month:null } }];\nconst months = Array.from(new Set(dates.map(d=>d.slice(0,7)))).sort();\nconst month = months[months.length-1]; // показываем последний доступный месяц\nreturn [{ json: { month, months, minMonth: months[0], maxMonth: months[months.length-1], user_id: $('Extract User Data').first().json.user_id, chat_id: $('Extract User Data').first().json.chat_id } }];`;
  console.log('✅ Updated Calc Initial Month with smart month selection');
}

// Step 2: Add month persistence nodes
const newMonthNodes = [
  {
    "parameters": {
      "operation": "set",
      "key": "=ozon:ui:{{ $json.user_id }}:cal_month",
      "value": "={{ $json.month }}",
      "options": { "ttl": 3600 }
    },
    "type": "n8n-nodes-base.redis",
    "typeVersion": 1,
    "position": [3280, 240],
    "id": "persist-cal-month-initial",
    "name": "Persist Cal Month (initial)",
    "credentials": { "redis": { "id": "kaA0Glj8bB5pwqRt", "name": "Redis account" } }
  },
  {
    "parameters": {
      "operation": "get",
      "key": "=ozon:ui:{{ $('Extract User Data').first().json.user_id }}:cal_month",
      "propertyName": "value"
    },
    "type": "n8n-nodes-base.redis",
    "typeVersion": 1,
    "position": [3480, 240],
    "id": "get-month-render",
    "name": "Get Month (Render)",
    "credentials": { "redis": { "id": "kaA0Glj8bB5pwqRt", "name": "Redis account" } }
  }
];

// Step 3: Add navigation nodes with boundary checks
const newNavNodes = [
  {
    "parameters": {
      "jsCode": "const cb = $('Extract User Data').first().json.callback_data || '';\n// cal:YYYY-MM:prev|next\nconst m = cb.match(/^cal:(\\d{4}-\\d{2}):(prev|next)$/);\nif(!m) return [{ json: { skip:true } }];\nconst cur = m[1]; const dir = m[2];\n// meta\nlet meta={}; try{ const raw=$('Fetch CSV (Render)').first()?.json.value; meta=raw?JSON.parse(raw):{}; }catch(e){ meta={}; }\nconst months = Array.from(new Set((meta.availableDates||[]).map(d=>d.slice(0,7)))).sort();\nconst idx = months.indexOf(cur);\nlet nextIdx = idx + (dir==='next'? 1 : -1);\nif(nextIdx < 0 || nextIdx >= months.length){\n  return [{ json: { outOfRange:true, month:cur } }];\n}\nreturn [{ json: { month: months[nextIdx], minMonth: months[0], maxMonth: months[months.length-1], outOfRange:false, user_id: $('Extract User Data').first().json.user_id, chat_id: $('Extract User Data').first().json.chat_id } }];"
    },
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [2280, 320],
    "id": "handle-cal-nav-smart",
    "name": "Handle Calendar Nav (smart)"
  },
  {
    "parameters": {
      "conditions": {
        "options": { "caseSensitive": true, "typeValidation": "strict", "version": 2 },
        "conditions": [
          { "leftValue": "={{ $json.outOfRange === true }}", "rightValue": "true", "operator": { "type": "boolean", "operation": "true", "singleValue": true } }
        ],
        "combinator": "and"
      }
    },
    "type": "n8n-nodes-base.if",
    "typeVersion": 2.2,
    "position": [2480, 320],
    "id": "if-nav-range",
    "name": "Out of Range?"
  },
  {
    "parameters": {
      "method": "POST",
      "url": "=https://api.telegram.org/bot{{ $('Config').first().json.TELEGRAM_BOT_TOKEN }}/answerCallbackQuery",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": "={\n  \"callback_query_id\": {{ JSON.stringify($('Extract User Data').first().json.callback_query_id) }},\n  \"text\": \"Нет доступных месяцев\",\n  \"show_alert\": false\n}"
    },
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": [2680, 360],
    "id": "answer-no-month",
    "name": "Answer Callback (no month)"
  },
  {
    "parameters": {
      "operation": "set",
      "key": "=ozon:ui:{{ $json.user_id }}:cal_month",
      "value": "={{ $json.month }}",
      "options": { "ttl": 3600 }
    },
    "type": "n8n-nodes-base.redis",
    "typeVersion": 1,
    "position": [2680, 280],
    "id": "persist-cal-month-nav",
    "name": "Persist Cal Month (nav)",
    "credentials": { "redis": { "id": "kaA0Glj8bB5pwqRt", "name": "Redis account" } }
  }
];

// Step 4: Add render preparation node
const renderPrepNode = {
  "parameters": {
    "jsCode": "let month = $('Get Month (Render)').first()?.json.value || $('Calc Initial Month').first()?.json.month || $json.month;\nlet meta={};\ntry{ const raw=$('Fetch CSV Meta (for calendar)').first()?.json.value || $('Fetch CSV (Render)').first()?.json.value; meta = raw? JSON.parse(raw):{}; }catch(e){ meta={}; }\nconst available = Array.isArray(meta.availableDates)? meta.availableDates:[];\nconst months = Array.from(new Set(available.map(d=>d.slice(0,7)))).sort();\nconst minMonth = months[0]; const maxMonth = months[months.length-1];\nlet selected = [];\ntry{ const rawSel = $('Get Selected Dates').first()?.json?.value; selected = rawSel? JSON.parse(rawSel):[]; }catch(e){ selected = []; }\nreturn [{ json: { chat_id: $('Extract User Data').first().json.chat_id, user_id: $('Extract User Data').first().json.user_id, month, minMonth, maxMonth, availableDates: available, selectedDates: selected } }];"
  },
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [3680, 240],
  "id": "ensure-month-for-render-smart",
  "name": "Ensure Month For Render (smart)"
};

// Step 5: Update Render Calendar Grid with smart day filtering
const renderGridNode = {
  "parameters": {
    "jsCode": "function daysInMonth(ms){ const [y,m]=ms.split('-').map(Number); return new Date(y, m, 0).getDate(); }\nconst { chat_id, month, minMonth, maxMonth, availableDates, selectedDates } = $json;\nconst [Y,M] = month.split('-').map(Number);\nconst total = daysInMonth(month);\nconst setAvail = new Set(availableDates.filter(d=>d.startsWith(month)));\nconst setSel = new Set(selectedDates||[]);\n// навигация активна, если есть соседние месяцы в диапазоне\nconst hasPrev = month>minMonth;\nconst hasNext = month<maxMonth;\nconst navRow = [{ text: hasPrev?'◀':'▪', callback_data: hasPrev? `cal:${month}:prev` : 'noop' }, { text: month, callback_data: 'noop' }, { text: hasNext?'▶':'▪', callback_data: hasNext? `cal:${month}:next` : 'noop' }];\n// сетка дней\nconst rows = [];\nlet day=1;\nwhile(day<=total){\n  const row = [];\n  for(let i=0;i<7 && day<=total;i++){\n    const d = String(day).padStart(2,'0');\n    const full = `${month}-${d}`;\n    const isAvail = setAvail.has(full);\n    const isSel = setSel.has(full);\n    if(isAvail){ row.push({ text: (isSel?'☑ ':'▫ ')+String(day), callback_data: `date:${full}` }); }\n    else { row.push({ text: '· '+String(day), callback_data: 'noop' }); }\n    day++;\n  }\n  rows.push(row);\n}\nconst controls = [];\ncontrols.push({ text: (setSel.size? '✅ Готово':'🔒 Готово'), callback_data: (setSel.size? 'dates:done':'noop') });\ncontrols.push({ text: '🧹 Сброс', callback_data: 'dates:reset' });\nconst kb = { inline_keyboard: [navRow, ...rows, controls] };\nconst header = setSel.size? `Выбрано: ${Array.from(setSel).join(', ')}` : 'Выберите до 3 дат:';\nconst text = `📅 <b>Мультивыбор дат</b>\\n\\n${header}`;\nreturn [{ json: { chat_id, text, parse_mode: 'HTML', reply_markup: kb } }];"
  },
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [3880, 240],
  "id": "render-calendar-grid-smart",
  "name": "Render Calendar Grid (smart)"
};

// Step 6: Add editMessageText flow nodes
const editFlowNodes = [
  {
    "parameters": {
      "operation": "get",
      "key": "=ozon:ui:{{ $('Extract User Data').first().json.user_id }}:calendar_msg_id",
      "propertyName": "value"
    },
    "type": "n8n-nodes-base.redis",
    "typeVersion": 1,
    "position": [4080, 240],
    "id": "get-cal-msg-smart",
    "name": "Get Calendar Msg ID (smart)",
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
    "position": [4280, 240],
    "id": "if-has-msg-smart",
    "name": "Has Calendar Msg? (smart)"
  },
  {
    "parameters": {
      "method": "POST",
      "url": "=https://api.telegram.org/bot{{ $('Config').first().json.TELEGRAM_BOT_TOKEN }}/editMessageText",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": "={{ JSON.stringify({ chat_id: $('Ensure Month For Render (smart)').first().json.chat_id, message_id: $('Get Calendar Msg ID (smart)').first().json.value, text: $json.text, parse_mode:'HTML', reply_markup: $json.reply_markup }) }}"
    },
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": [4480, 220],
    "id": "edit-calendar-smart",
    "name": "Edit Calendar (smart)"
  },
  {
    "parameters": {
      "method": "POST",
      "url": "=https://api.telegram.org/bot{{ $('Config').first().json.TELEGRAM_BOT_TOKEN }}/sendMessage",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": "={{ JSON.stringify({ chat_id: $('Ensure Month For Render (smart)').first().json.chat_id, text: $json.text, parse_mode:'HTML', reply_markup: $json.reply_markup }) }}"
    },
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": [4480, 280],
    "id": "send-calendar-smart",
    "name": "Send Calendar (smart)"
  },
  {
    "parameters": {
      "operation": "set",
      "key": "=ozon:ui:{{ $('Extract User Data').first().json.user_id }}:calendar_msg_id",
      "value": "={{ $json.result?.message_id || $json.message_id || $json.result?.message?.message_id }}",
      "options": { "ttl": 3600 }
    },
    "type": "n8n-nodes-base.redis",
    "typeVersion": 1,
    "position": [4680, 280],
    "id": "persist-cal-msg-id-smart",
    "name": "Persist Calendar Msg ID (smart)",
    "credentials": { "redis": { "id": "kaA0Glj8bB5pwqRt", "name": "Redis account" } }
  }
];

// Add all new nodes
workflow.nodes.push(...newMonthNodes, ...newNavNodes, renderPrepNode, renderGridNode, ...editFlowNodes);
console.log(`✅ Added ${newMonthNodes.length + newNavNodes.length + 1 + 1 + editFlowNodes.length} new nodes`);

// Step 7: Update connections for CalOpen flow
// Has File? (calopen) [true] → Calc Initial Month → Persist Cal Month → Get Month → Ensure Month → Render → Get Msg → Has Msg → [Edit | Send → Persist]

// Find "Calc Initial Month" connection in "Has File? (calopen)" true branch
const hasFileCalopen = workflow.connections["Has File? (calopen)"];
if (hasFileCalopen && hasFileCalopen.main && hasFileCalopen.main[0]) {
  hasFileCalopen.main[0] = [{ "node": "Calc Initial Month", "type": "main", "index": 0 }];
  console.log('✅ Updated Has File? (calopen) → Calc Initial Month');
}

// Calc Initial Month → Persist Cal Month (initial)
workflow.connections["Calc Initial Month"] = {
  "main": [[{ "node": "Persist Cal Month (initial)", "type": "main", "index": 0 }]]
};

// Persist Cal Month (initial) → Get Month (Render)
workflow.connections["Persist Cal Month (initial)"] = {
  "main": [[{ "node": "Get Month (Render)", "type": "main", "index": 0 }]]
};

// Get Month (Render) → Ensure Month For Render (smart)
workflow.connections["Get Month (Render)"] = {
  "main": [[{ "node": "Ensure Month For Render (smart)", "type": "main", "index": 0 }]]
};

// Ensure Month For Render (smart) → Render Calendar Grid (smart)
workflow.connections["Ensure Month For Render (smart)"] = {
  "main": [[{ "node": "Render Calendar Grid (smart)", "type": "main", "index": 0 }]]
};

// Render Calendar Grid (smart) → Get Calendar Msg ID (smart)
workflow.connections["Render Calendar Grid (smart)"] = {
  "main": [[{ "node": "Get Calendar Msg ID (smart)", "type": "main", "index": 0 }]]
};

// Get Calendar Msg ID (smart) → Has Calendar Msg? (smart)
workflow.connections["Get Calendar Msg ID (smart)"] = {
  "main": [[{ "node": "Has Calendar Msg? (smart)", "type": "main", "index": 0 }]]
};

// Has Calendar Msg? (smart) → [Edit | Send]
workflow.connections["Has Calendar Msg? (smart)"] = {
  "main": [
    [{ "node": "Edit Calendar (smart)", "type": "main", "index": 0 }],
    [{ "node": "Send Calendar (smart)", "type": "main", "index": 0 }]
  ]
};

// Send Calendar (smart) → Persist Calendar Msg ID (smart)
workflow.connections["Send Calendar (smart)"] = {
  "main": [[{ "node": "Persist Calendar Msg ID (smart)", "type": "main", "index": 0 }]]
};

console.log('✅ Wired CalOpen flow with smart month management');

// Step 8: Update connections for CalNav flow
// Handle Calendar Nav → Out of Range? → [Answer | Persist Month → Get Month → Ensure → Render → ...]

// Update Route Message CalNav output to use new smart handler
const routeMessage = workflow.connections["Route Message"];
if (routeMessage && routeMessage.main && routeMessage.main[5]) {
  routeMessage.main[5] = [{ "node": "Handle Calendar Nav (smart)", "type": "main", "index": 0 }];
  console.log('✅ Updated Route Message CalNav → Handle Calendar Nav (smart)');
}

// Handle Calendar Nav (smart) → Out of Range?
workflow.connections["Handle Calendar Nav (smart)"] = {
  "main": [[{ "node": "Out of Range?", "type": "main", "index": 0 }]]
};

// Out of Range? → [Answer | Persist]
workflow.connections["Out of Range?"] = {
  "main": [
    [{ "node": "Answer Callback (no month)", "type": "main", "index": 0 }],
    [{ "node": "Persist Cal Month (nav)", "type": "main", "index": 0 }]
  ]
};

// Persist Cal Month (nav) → Get Month (Render)
workflow.connections["Persist Cal Month (nav)"] = {
  "main": [[{ "node": "Get Month (Render)", "type": "main", "index": 0 }]]
};

console.log('✅ Wired CalNav flow with boundary checks');

// Step 9: Update date selection flows to use editMessageText
// Persist Selected Dates → Get Month (Render) → Ensure → Render → Get Msg → Has Msg → [Edit | Send]
const persistSelDates = workflow.connections["Persist Selected Dates"];
if (persistSelDates && persistSelDates.main) {
  // Replace old connections with new flow
  persistSelDates.main = [[{ "node": "Get Month (Render)", "type": "main", "index": 0 }]];
  console.log('✅ Updated Persist Selected Dates → Get Month (Render)');
}

// Reset Dates flow: Persist Selected (Reset) → Get Month (Render) → ...
const persistReset = workflow.connections["Persist Selected (Reset)"];
if (persistReset && persistReset.main) {
  persistReset.main = [[{ "node": "Get Month (Render)", "type": "main", "index": 0 }]];
  console.log('✅ Updated Persist Selected (Reset) → Get Month (Render)');
}

// Step 10: Disconnect old duplicate-creating nodes
// Remove connections TO old "Send Calendar" and "Send Calendar (rebuild)"
const oldSendCalNode = workflow.nodes.find(n => n.id === 'n-send-cal');
const oldSendCal2Node = workflow.nodes.find(n => n.id === 'n-send-cal-2');

// Clear old connections that created duplicates
if (workflow.connections["Render Calendar Grid"]) {
  delete workflow.connections["Render Calendar Grid"];
  console.log('✅ Removed old Render Calendar Grid connections');
}

if (workflow.connections["Render Calendar (rebuild)"]) {
  delete workflow.connections["Render Calendar (rebuild)"];
  console.log('✅ Removed old Render Calendar (rebuild) connections');
}

// Write updated workflow
fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 2));
console.log(`\n✅ Successfully applied all changes to ${workflowPath}`);
console.log(`📊 Total nodes: ${workflow.nodes.length}`);
console.log(`📊 Total connections: ${Object.keys(workflow.connections).length}`);
