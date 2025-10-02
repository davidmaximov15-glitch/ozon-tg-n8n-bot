#!/usr/bin/env node
/**
 * Apply коммит №5: мини-сводка в шапке + кнопки "Загрузить файл" и "Очистить файл"
 */

const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, '..', 'workflows', 'ozon-telegram-bot.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('📝 Applying коммит №5: мини-сводка в шапке + кнопки файлов...\n');

// 1. Add 2 routes to Route Message
const routeNode = workflow.nodes.find(n => n.name === 'Route Message');
if (routeNode && routeNode.parameters && routeNode.parameters.rules) {
  const values = routeNode.parameters.rules.values || [];
  
  // FileUpload route
  values.push({
    "outputKey": "FileUpload",
    "conditions": {
      "options": { "caseSensitive": true, "typeValidation": "strict", "version": 2 },
      "conditions": [
        { "leftValue": "={{ $('Extract User Data').first().json.callback_data }}", "rightValue": "file:upload", "operator": { "type": "string", "operation": "equals" } }
      ],
      "combinator": "and"
    }
  });
  
  // FileClear route
  values.push({
    "outputKey": "FileClear",
    "conditions": {
      "options": { "caseSensitive": true, "typeValidation": "strict", "version": 2 },
      "conditions": [
        { "leftValue": "={{ $('Extract User Data').first().json.callback_data }}", "rightValue": "file:clear", "operator": { "type": "string", "operation": "equals" } }
      ],
      "combinator": "and"
    }
  });
  
  routeNode.parameters.rules.values = values;
  console.log('✅ Added FileUpload and FileClear routes to Route Message');
}

// 2. Update Render Calendar Grid with summary and file buttons
const renderNode = workflow.nodes.find(n => n.id === 'render-calendar-smart');
if (renderNode) {
  renderNode.parameters.jsCode = `function daysInMonth(ms){ const [y,m]=ms.split('-').map(Number); return new Date(y, m, 0).getDate(); }\nconst {\n  chat_id, month, minMonth, maxMonth,\n  availableDates, selectedDates,\n  selectionSummary = { totalOrders: 0, totalRevenue: 0 }\n} = $json;\nconst [Y,M] = month.split('-').map(Number);\nconst total = daysInMonth(month);\nconst setAvail = new Set((availableDates||[]).filter(d=>d.startsWith(month)));\nconst selected = Array.isArray(selectedDates) ? selectedDates : [];\nconst setSel = new Set(selected);\nconst hasPrev = month > minMonth;\nconst hasNext = month < maxMonth;\nconst navRow = [\n  { text: hasPrev ? '◀' : '▪', callback_data: hasPrev ? \`cal:\${month}:prev\` : 'noop' },\n  { text: month,                 callback_data: 'noop' },\n  { text: hasNext ? '▶' : '▪',   callback_data: hasNext ? \`cal:\${month}:next\` : 'noop' }\n];\nconst rows = [];\nlet day=1;\nwhile(day<=total){\n  const row = [];\n  for(let i=0;i<7 && day<=total;i++){\n    const d = String(day).padStart(2,'0');\n    const full = \`\${month}-\${d}\`;\n    const isAvail = setAvail.has(full);\n    const isSel   = setSel.has(full);\n    if(isAvail){\n      row.push({ text: (isSel?'☑ ':'▫ ')+String(day), callback_data: \`date:\${full}\` });\n    }else{\n      row.push({ text: '· '+String(day), callback_data: 'noop' });\n    }\n    day++;\n  }\n  rows.push(row);\n}\nconst MAX = 3;\nlet selectedLine = 'Выберите до 3 дат:';\nif (setSel.size) {\n  const preview = Array.from(setSel).slice(0, 5).join(', ');\n  selectedLine = \`Выбрано (\${setSel.size}/\${MAX}): \${preview}\`;\n}\nconst mini = \`Итого: заказы \${selectionSummary.totalOrders} • сумма \${selectionSummary.totalRevenue.toFixed(2)} ₽\`;\nconst controls = [];\ncontrols.push({ text: (setSel.size? '✅ Готово':'🔒 Готово'), callback_data: (setSel.size? 'dates:done':'noop') });\ncontrols.push({ text: '🧹 Сброс', callback_data: 'dates:reset' });\nconst fileRow = [\n  { text: '📤 Загрузить файл', callback_data: 'file:upload' },\n  { text: '🧯 Очистить файл',  callback_data: 'file:clear'  }\n];\nconst kb = { inline_keyboard: [navRow, ...rows, controls, fileRow] };\nconst text = \`📅 <b>Мультивыбор дат</b>\\\\n\${selectedLine}\\\\n\${mini}\`;\nreturn [{ json: { chat_id, text, parse_mode: 'HTML', reply_markup: kb } }];`;
  console.log('✅ Updated Render Calendar Grid with summary and file buttons');
}

// 3. Add Compute Selection Summary node
const computeSummaryNode = {
  "parameters": {
    "jsCode": "const uid = $('Extract User Data').first().json.user_id;\nlet selected = [];\ntry {\n  const rawSel = $('Get Selected Dates').first()?.json?.value;\n  selected = rawSel ? JSON.parse(rawSel) : [];\n} catch(e){ selected = []; }\nlet records = [];\ntry {\n  const rawMeta =\n    $('Fetch Cached Data (for grid)').first()?.json?.value\n    || $('Fetch CSV Meta (calopen)').first()?.json?.value;\n  const meta = rawMeta ? JSON.parse(rawMeta) : {};\n  records = Array.isArray(meta.records) ? meta.records : [];\n} catch(e){ records = []; }\nfunction parseAsMsk(dateStr){\n  if (!dateStr) return null;\n  let d = dateStr;\n  if (/^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}$/.test(d)) d = d.replace(' ', 'T') + 'Z';\n  const base = new Date(d);\n  if (isNaN(base)) return null;\n  return new Date(base.getTime() + 3*60*60*1000);\n}\nconst setSel = new Set(selected);\nlet totalOrders = 0;\nlet totalRevenue = 0;\nconst revenueStatuses = ['доставлен','доставляется','ожидает сборки','ожидает отгрузки'];\nconst cancelStatuses  = ['отменён','отменен','возврат'];\nfor(const r of records){\n  const msk = parseAsMsk(r.created_at);\n  if(!msk) continue;\n  const d = msk.toISOString().split('T')[0];\n  if(!setSel.has(d)) continue;\n  const q = Number(r.quantity||1);\n  const p = Number(r.price||0);\n  totalOrders += q;\n  if (revenueStatuses.some(s => (r.status||'').includes(s))) {\n    totalRevenue += p*q;\n  }\n}\nreturn [{\n  json: {\n    ...$json,\n    selectedDates: selected,\n    selectionSummary: { totalOrders, totalRevenue }\n  }\n}];"
  },
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [3760, 240],
  "id": "compute-selection-summary",
  "name": "Compute Selection Summary"
};

workflow.nodes.push(computeSummaryNode);
console.log('✅ Added Compute Selection Summary node');

// 4. Add Send Upload Help node
const uploadHelpNode = {
  "parameters": {
    "method": "POST",
    "url": "=https://api.telegram.org/bot{{ $('Config').first().json.TELEGRAM_BOT_TOKEN }}/sendMessage",
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={\n  \"chat_id\": {{ JSON.stringify($('Extract User Data').first().json.chat_id) }},\n  \"parse_mode\": \"HTML\",\n  \"text\": \"📤 <b>Загрузка файла</b>\\n\\nПришлите отчёт Ozon в ответ на это сообщение. Поддерживаются .csv / .xlsx до 20MB. После загрузки я открою календарь выбора дат.\"\n}"
  },
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "position": [2140, 780],
  "id": "send-upload-help",
  "name": "Send Upload Help"
};

workflow.nodes.push(uploadHelpNode);
console.log('✅ Added Send Upload Help node');

// 5. Add Clear Cache flow (6 nodes)
const clearCacheNodes = [
  {
    "parameters": {
      "jsCode": "const uid=$('Extract User Data').first().json.user_id; const chat=$('Extract User Data').first().json.chat_id;\nreturn [{ json: { user_id: uid, chat_id: chat } }];"
    },
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [2140, 860],
    "id": "clear-cache",
    "name": "Clear Cache"
  },
  {
    "parameters": {
      "operation": "delete",
      "key": "=ozon:cache:{{ $json.user_id }}:csv_data"
    },
    "type": "n8n-nodes-base.redis",
    "typeVersion": 1,
    "position": [2320, 860],
    "id": "del-csv",
    "name": "Del CSV Cache",
    "credentials": { "redis": { "id": "kaA0Glj8bB5pwqRt", "name": "Redis account" } }
  },
  {
    "parameters": {
      "operation": "delete",
      "key": "=ozon:cache:{{ $json.user_id }}:selected_dates"
    },
    "type": "n8n-nodes-base.redis",
    "typeVersion": 1,
    "position": [2480, 860],
    "id": "del-selected",
    "name": "Del Selected Dates",
    "credentials": { "redis": { "id": "kaA0Glj8bB5pwqRt", "name": "Redis account" } }
  },
  {
    "parameters": {
      "operation": "delete",
      "key": "=ozon:cache:{{ $json.user_id }}:calendar_msg_id"
    },
    "type": "n8n-nodes-base.redis",
    "typeVersion": 1,
    "position": [2640, 860],
    "id": "del-cal-msg",
    "name": "Del Calendar Msg ID",
    "credentials": { "redis": { "id": "kaA0Glj8bB5pwqRt", "name": "Redis account" } }
  },
  {
    "parameters": {
      "method": "POST",
      "url": "=https://api.telegram.org/bot{{ $('Config').first().json.TELEGRAM_BOT_TOKEN }}/answerCallbackQuery",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": "={\n  \"callback_query_id\": {{ JSON.stringify($('Extract User Data').first().json.callback_query_id) }},\n  \"text\": \"Кэш очищен\",\n  \"show_alert\": false\n}"
    },
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": [2800, 860],
    "id": "answer-callback-cleared",
    "name": "Answer Callback (cleared)"
  },
  {
    "parameters": {
      "method": "POST",
      "url": "=https://api.telegram.org/bot{{ $('Config').first().json.TELEGRAM_BOT_TOKEN }}/sendMessage",
      "sendBody": true,
      "specifyBody": "json",
      "jsonBody": "={\n  \"chat_id\": {{ JSON.stringify($('Extract User Data').first().json.chat_id) }},\n  \"parse_mode\": \"HTML\",\n  \"text\": \"♻️ <b>Кэш очищен.</b>\\n\\nНажмите <b>Заказы</b> и загрузите новый файл, чтобы начать.\"\n}"
    },
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": [2960, 860],
    "id": "send-start-prompt",
    "name": "Send Start Prompt"
  }
];

workflow.nodes.push(...clearCacheNodes);
console.log(`✅ Added ${clearCacheNodes.length} Clear Cache flow nodes`);

// 6. Wire all connections

// Route Message → FileUpload → Send Upload Help
const routeConnections = workflow.connections["Route Message"];
if (routeConnections && routeConnections.main) {
  // Add FileUpload route (append to end)
  routeConnections.main.push([{ "node": "Send Upload Help", "type": "main", "index": 0 }]);
  // Add FileClear route (append to end)
  routeConnections.main.push([{ "node": "Clear Cache", "type": "main", "index": 0 }]);
  console.log('✅ Wired Route Message → FileUpload/FileClear');
}

// Ensure Month (smart) → Compute Selection Summary → Render Calendar (smart)
workflow.connections["Ensure Month (smart)"] = {
  "main": [[{ "node": "Compute Selection Summary", "type": "main", "index": 0 }]]
};
workflow.connections["Compute Selection Summary"] = {
  "main": [[{ "node": "Render Calendar (smart)", "type": "main", "index": 0 }]]
};
console.log('✅ Wired Ensure Month → Compute Selection Summary → Render Calendar');

// Clear Cache flow: Clear Cache → Del CSV → Del Selected → Del Cal Msg → Answer → Send Start
workflow.connections["Clear Cache"] = {
  "main": [[{ "node": "Del CSV Cache", "type": "main", "index": 0 }]]
};
workflow.connections["Del CSV Cache"] = {
  "main": [[{ "node": "Del Selected Dates", "type": "main", "index": 0 }]]
};
workflow.connections["Del Selected Dates"] = {
  "main": [[{ "node": "Del Calendar Msg ID", "type": "main", "index": 0 }]]
};
workflow.connections["Del Calendar Msg ID"] = {
  "main": [[{ "node": "Answer Callback (cleared)", "type": "main", "index": 0 }]]
};
workflow.connections["Answer Callback (cleared)"] = {
  "main": [[{ "node": "Send Start Prompt", "type": "main", "index": 0 }]]
};
console.log('✅ Wired Clear Cache flow');

// Write updated workflow
fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 2));
console.log(`\n✅ Successfully applied коммит №5`);
console.log(`📊 Total nodes: ${workflow.nodes.length}`);
console.log(`📊 Total connections: ${Object.keys(workflow.connections).length}`);
