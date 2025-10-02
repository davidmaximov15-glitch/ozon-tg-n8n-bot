#!/usr/bin/env node
/**
 * Apply коммит №3 (smart calendar) + коммит №4 (limit 3 dates, toasts) to main
 */

const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, '..', 'workflows', 'ozon-telegram-bot.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('📝 Applying smart calendar + 3-date limit...\n');

// КОММИТ №3: Smart Calendar
console.log('=== КОММИТ №3: Smart Calendar ===');

// Update Calc Initial Month
const calcNode = workflow.nodes.find(n => n.id === 'n-calc-month');
if (calcNode) {
  calcNode.parameters.jsCode = `let meta={};\ntry{ const raw=$('Fetch CSV Meta (for calendar)').first()?.json.value || $('Cache CSV Meta').first()?.json.value; meta = raw? JSON.parse(raw):{}; }catch(e){ meta={}; }\nconst dates = Array.isArray(meta.availableDates)? meta.availableDates:[];\nif(!dates.length) return [{ json: { month:null } }];\nconst months = Array.from(new Set(dates.map(d=>d.slice(0,7)))).sort();\nconst month = months[months.length-1];\nreturn [{ json: { month, months, minMonth: months[0], maxMonth: months[months.length-1], user_id: $('Extract User Data').first().json.user_id, chat_id: $('Extract User Data').first().json.chat_id } }];`;
  console.log('✅ Updated Calc Initial Month');
}

// Add smart calendar nodes
const smartNodes = [
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
    "id": "get-month-render-smart",
    "name": "Get Month (Render smart)",
    "credentials": { "redis": { "id": "kaA0Glj8bB5pwqRt", "name": "Redis account" } }
  },
  {
    "parameters": {
      "jsCode": "let month = $('Get Month (Render smart)').first()?.json.value || $('Calc Initial Month').first()?.json.month || $json.month;\nlet meta={};\ntry{ const raw=$('Fetch CSV Meta (for calendar)').first()?.json.value || $('Fetch CSV (Render)').first()?.json.value; meta = raw? JSON.parse(raw):{}; }catch(e){ meta={}; }\nconst available = Array.isArray(meta.availableDates)? meta.availableDates:[];\nconst months = Array.from(new Set(available.map(d=>d.slice(0,7)))).sort();\nconst minMonth = months[0]; const maxMonth = months[months.length-1];\nlet selected = [];\ntry{ const rawSel = $('Get Selected Dates').first()?.json?.value; selected = rawSel? JSON.parse(rawSel):[]; }catch(e){ selected = []; }\nreturn [{ json: { chat_id: $('Extract User Data').first().json.chat_id, user_id: $('Extract User Data').first().json.user_id, month, minMonth, maxMonth, availableDates: available, selectedDates: selected } }];"
    },
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [3680, 240],
    "id": "ensure-month-smart",
    "name": "Ensure Month (smart)"
  },
  {
    "parameters": {
      "jsCode": "function daysInMonth(ms){ const [y,m]=ms.split('-').map(Number); return new Date(y, m, 0).getDate(); }\nconst { chat_id, month, minMonth, maxMonth, availableDates, selectedDates } = $json;\nconst [Y,M] = month.split('-').map(Number);\nconst total = daysInMonth(month);\nconst setAvail = new Set((availableDates||[]).filter(d=>d.startsWith(month)));\nconst selected = Array.isArray(selectedDates) ? selectedDates : [];\nconst setSel = new Set(selected);\nconst hasPrev = month > minMonth;\nconst hasNext = month < maxMonth;\nconst navRow = [{ text: hasPrev?'◀':'▪', callback_data: hasPrev? `cal:${month}:prev` : 'noop' }, { text: month, callback_data: 'noop' }, { text: hasNext?'▶':'▪', callback_data: hasNext? `cal:${month}:next` : 'noop' }];\nconst rows = [];\nlet day=1;\nwhile(day<=total){\n  const row = [];\n  for(let i=0;i<7 && day<=total;i++){\n    const d = String(day).padStart(2,'0');\n    const full = `${month}-${d}`;\n    const isAvail = setAvail.has(full);\n    const isSel = setSel.has(full);\n    if(isAvail){ row.push({ text: (isSel?'☑ ':'▫ ')+String(day), callback_data: `date:${full}` }); }\n    else { row.push({ text: '· '+String(day), callback_data: 'noop' }); }\n    day++;\n  }\n  rows.push(row);\n}\nconst MAX = 3;\nlet selectedLine = 'Выберите до 3 дат:';\nif (setSel.size) {\n  const preview = Array.from(setSel).slice(0, 5).join(', ');\n  selectedLine = `Выбрано (${setSel.size}/${MAX}): ${preview}`;\n  if (setSel.size > 5) selectedLine += ' …';\n}\nconst controls = [];\ncontrols.push({ text: (setSel.size? '✅ Готово':'🔒 Готово'), callback_data: (setSel.size? 'dates:done':'noop') });\ncontrols.push({ text: '🧹 Сброс', callback_data: 'dates:reset' });\nconst kb = { inline_keyboard: [navRow, ...rows, controls] };\nconst text = `📅 <b>Мультивыбор дат</b>\\n${selectedLine}`;\nreturn [{ json: { chat_id, text, parse_mode: 'HTML', reply_markup: kb } }];"
    },
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [3880, 240],
    "id": "render-calendar-smart",
    "name": "Render Calendar (smart)"
  },
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
      "jsonBody": "={{ JSON.stringify({ chat_id: $('Ensure Month (smart)').first().json.chat_id, message_id: $('Get Calendar Msg ID (smart)').first().json.value, text: $json.text, parse_mode:'HTML', reply_markup: $json.reply_markup }) }}"
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
      "jsonBody": "={{ JSON.stringify({ chat_id: $('Ensure Month (smart)').first().json.chat_id, text: $json.text, parse_mode:'HTML', reply_markup: $json.reply_markup }) }}"
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
    "id": "persist-cal-msg-smart",
    "name": "Persist Calendar Msg ID (smart)",
    "credentials": { "redis": { "id": "kaA0Glj8bB5pwqRt", "name": "Redis account" } }
  }
];

workflow.nodes.push(...smartNodes);
console.log(`✅ Added ${smartNodes.length} smart calendar nodes`);

// Wire CalOpen flow
workflow.connections["Calc Initial Month"] = {
  "main": [[{ "node": "Persist Cal Month (initial)", "type": "main", "index": 0 }]]
};
workflow.connections["Persist Cal Month (initial)"] = {
  "main": [[{ "node": "Get Month (Render smart)", "type": "main", "index": 0 }]]
};
workflow.connections["Get Month (Render smart)"] = {
  "main": [[{ "node": "Ensure Month (smart)", "type": "main", "index": 0 }]]
};
workflow.connections["Ensure Month (smart)"] = {
  "main": [[{ "node": "Render Calendar (smart)", "type": "main", "index": 0 }]]
};
workflow.connections["Render Calendar (smart)"] = {
  "main": [[{ "node": "Get Calendar Msg ID (smart)", "type": "main", "index": 0 }]]
};
workflow.connections["Get Calendar Msg ID (smart)"] = {
  "main": [[{ "node": "Has Calendar Msg? (smart)", "type": "main", "index": 0 }]]
};
workflow.connections["Has Calendar Msg? (smart)"] = {
  "main": [
    [{ "node": "Edit Calendar (smart)", "type": "main", "index": 0 }],
    [{ "node": "Send Calendar (smart)", "type": "main", "index": 0 }]
  ]
};
workflow.connections["Send Calendar (smart)"] = {
  "main": [[{ "node": "Persist Calendar Msg ID (smart)", "type": "main", "index": 0 }]]
};

// Wire Persist Selected Dates to smart flow
workflow.connections["Persist Selected Dates"] = {
  "main": [[{ "node": "Fetch Cached Data (for grid)", "type": "main", "index": 0 }]]
};
workflow.connections["Fetch Cached Data (for grid)"] = {
  "main": [[{ "node": "Get Month (Render smart)", "type": "main", "index": 0 }]]
};

// Wire Reset to smart flow
workflow.connections["Persist Selected (Reset)"] = {
  "main": [[{ "node": "Get Month (Render smart)", "type": "main", "index": 0 }]]
};

console.log('✅ Wired smart calendar connections');

// КОММИТ №4: Limit 3 dates + toasts
console.log('\n=== КОММИТ №4: Limit 3 dates + toasts ===');

// Update Toggle Date with limit logic
const toggleNode = workflow.nodes.find(n => n.id === 'n-toggle');
if (toggleNode) {
  toggleNode.parameters.jsCode = `const dateStr = $('Extract User Data').first().json.callback_data.replace('date:', '');\nconst userId  = $('Extract User Data').first().json.user_id;\nlet available = [];\ntry {\n  const raw = $('Fetch Cached Data (for grid)').first()?.json?.value || $('Fetch CSV Meta (calopen)').first()?.json?.value;\n  const obj = raw ? JSON.parse(raw) : {};\n  available = Array.isArray(obj.availableDates) ? obj.availableDates : [];\n} catch(e){ available = []; }\nconst isAvailable = available.includes(dateStr);\nif (!isAvailable) {\n  return [{ json: { user_id: userId, selectedDates: [], hitLimit: false, unavailable: true } }];\n}\nlet selected = [];\ntry {\n  const rawSel = $('Get Selected Dates (toggle)').first()?.json?.value;\n  selected = rawSel ? JSON.parse(rawSel) : [];\n} catch(e){ selected = []; }\nconst MAX = 3;\nif (selected.includes(dateStr)) {\n  selected = selected.filter(d => d !== dateStr);\n  return [{ json: { user_id: userId, selectedDates: selected, hitLimit: false, unavailable: false, toggled: 'removed', dateStr } }];\n}\nif (selected.length >= MAX) {\n  return [{ json: { user_id: userId, selectedDates: selected, hitLimit: true, unavailable: false, toggled: 'blocked', dateStr } }];\n}\nselected.push(dateStr);\nreturn [{ json: { user_id: userId, selectedDates: selected, hitLimit: false, unavailable: false, toggled: 'added', dateStr } }];`;
  console.log('✅ Updated Toggle Date with limit logic');
}

// Add IF nodes and toasts
const limitNodes = [
  {
    "parameters": {
      "conditions": {
        "options": { "caseSensitive": true, "typeValidation": "strict", "version": 2 },
        "conditions": [
          { "leftValue": "={{ $json.hitLimit === true }}", "rightValue": "true", "operator": { "type": "boolean", "operation": "true", "singleValue": true } }
        ],
        "combinator": "and"
      }
    },
    "type": "n8n-nodes-base.if",
    "typeVersion": 2.2,
    "position": [2420, 560],
    "id": "if-hit-limit",
    "name": "Hit Limit?"
  },
  {
    "parameters": {
      "conditions": {
        "options": { "caseSensitive": true, "typeValidation": "strict", "version": 2 },
        "conditions": [
          { "leftValue": "={{ $json.unavailable === true }}", "rightValue": "true", "operator": { "type": "boolean", "operation": "true", "singleValue": true } }
        ],
        "combinator": "and"
      }
    },
    "type": "n8n-nodes-base.if",
    "typeVersion": 2.2,
    "position": [2420, 640],
    "id": "if-unavailable",
    "name": "Unavailable?"
  },
  {
    "parameters": {
      "method": "POST",
      "url": "=https://api.telegram.org/bot{{ $('Config').first().json.TELEGRAM_BOT_TOKEN }}/answerCallbackQuery",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": "={\n  \"callback_query_id\": {{ JSON.stringify($('Extract User Data').first().json.callback_query_id) }},\n  \"text\": \"В этот день нет данных\",\n  \"show_alert\": false\n}"
    },
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": [2620, 680],
    "id": "answer-callback-unavailable",
    "name": "Answer Callback (unavailable)"
  }
];

workflow.nodes.push(...limitNodes);
console.log(`✅ Added ${limitNodes.length} limit check nodes`);

// Wire Toggle Date branches
workflow.connections["Toggle Date"] = {
  "main": [
    [{ "node": "Hit Limit?", "type": "main", "index": 0 }],
    [{ "node": "Unavailable?", "type": "main", "index": 0 }]
  ]
};
workflow.connections["Hit Limit?"] = {
  "main": [
    [{ "node": "Answer Callback (limit)", "type": "main", "index": 0 }],
    [{ "node": "Persist Selected Dates", "type": "main", "index": 0 }]
  ]
};
workflow.connections["Unavailable?"] = {
  "main": [
    [{ "node": "Answer Callback (unavailable)", "type": "main", "index": 0 }],
    []
  ]
};

console.log('✅ Wired Toggle Date branches with toasts');

// Write updated workflow
fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 2));
console.log(`\n✅ Successfully applied коммиты №3 and №4`);
console.log(`📊 Total nodes: ${workflow.nodes.length}`);
console.log(`📊 Total connections: ${Object.keys(workflow.connections).length}`);
