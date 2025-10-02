#!/usr/bin/env node
/**
 * fix(menu): avoid duplicate orders menu message
 * 
 * Problem: Route Message → menu:orders sends to both:
 *   1) Handle Menu → Prepare Menu Response → Send Menu Response
 *   2) Handle Menu → Get CSV Meta (Menu) → Render Orders Menu → Prepare Menu Response → Send Menu Response
 * 
 * This causes TWO messages for orders.
 * 
 * Solution: Handle Menu should route orders ONLY through the smart Render Orders Menu path.
 */

const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, '..', 'workflows', 'ozon-telegram-bot.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('📝 Fixing duplicate orders menu message...\n');

// Update Handle Menu node to route orders through Get CSV Meta (Menu) ONLY
const handleMenuNode = workflow.nodes.find(n => n.name === 'Handle Menu');

if (!handleMenuNode) {
  console.error('❌ Handle Menu node not found');
  process.exit(1);
}

console.log('✅ Found Handle Menu node');

// Update Handle Menu jsCode to handle orders differently
// It should detect menu:orders and take the second branch (Get CSV Meta)
// For other menu items (clusters, admin), use first branch (Prepare Menu Response)

handleMenuNode.parameters.jsCode = `const cb=$('Extract User Data').first().json.callback_data;
if(cb==='menu:orders'){
  // Route to Get CSV Meta (Menu) → Render Orders Menu
  return [{ json:{...$json} }];
}
// For other menu items: clusters, admin
const chatId=$('Extract User Data').first().json.chat_id;
let text='';
if(cb==='menu:clusters'){
  text='📊 <b>Раздел: Кластеры</b>\\\\n\\\\nЗдесь будет анализ по кластерам.';
}else if(cb==='menu:admin'){
  text='⚙️ <b>Раздел: Администрирование</b>\\\\n\\\\nЗдесь будут настройки.';
}else{
  text='ℹ️ Неизвестная команда.';
}
return [{ json:{ chat_id:chatId, text, reply_markup:{ inline_keyboard:[[{ text:'« Назад', callback_data:'/start' }]] } } }];`;

console.log('✅ Updated Handle Menu to route orders through second output');

// Check current connections
const handleMenuConn = workflow.connections["Handle Menu"];
console.log(`Current Handle Menu connections: ${JSON.stringify(handleMenuConn, null, 2)}`);

// Update Handle Menu connections
// Output 0 (false/other): → Prepare Menu Response (for clusters/admin)
// Output 1 (true/orders): → Get CSV Meta (Menu) (for orders)
workflow.connections["Handle Menu"] = {
  "main": [
    [{ "node": "Prepare Menu Response", "type": "main", "index": 0 }],
    [{ "node": "Get CSV Meta (Menu)", "type": "main", "index": 0 }]
  ]
};

console.log('✅ Updated Handle Menu connections to split orders vs other menu items');

// Actually, looking at the Handle Menu node, it's a Code node, not an IF node
// So we need to use an IF node or modify the code to return different outputs
// Let's change the approach: modify Handle Menu to be an IF node checking for menu:orders

// Better approach: Replace Handle Menu with an IF node
const handleMenuIdx = workflow.nodes.findIndex(n => n.name === 'Handle Menu');
workflow.nodes[handleMenuIdx] = {
  "parameters": {
    "conditions": {
      "options": {
        "caseSensitive": true,
        "typeValidation": "strict",
        "version": 2
      },
      "conditions": [
        {
          "leftValue": "={{ $('Extract User Data').first().json.callback_data }}",
          "rightValue": "menu:orders",
          "operator": {
            "type": "string",
            "operation": "equals"
          }
        }
      ],
      "combinator": "and"
    }
  },
  "type": "n8n-nodes-base.if",
  "typeVersion": 2.2,
  "position": handleMenuNode.position,
  "id": handleMenuNode.id,
  "name": "Handle Menu"
};

console.log('✅ Converted Handle Menu to IF node checking for menu:orders');

// Write updated workflow
fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 2));

console.log(`\n✅ Successfully fixed duplicate orders menu message`);
console.log(`📊 Total nodes: ${workflow.nodes.length}`);
console.log(`📊 Total connections: ${Object.keys(workflow.connections).length}`);

console.log('\nFlow now:');
console.log('  Route Message → menu:* → Handle Menu (IF)');
console.log('    ├─ true (menu:orders)  → Get CSV Meta (Menu) → Render Orders Menu → Send Menu Response');
console.log('    └─ false (other menu)  → Prepare Menu Response → Send Menu Response');
