#!/usr/bin/env node
/**
 * fix(calendar-nav): route prev/next to smart editMessageText
 * 
 * Problem: Handle Calendar Nav → Ensure Month For Render → Render Calendar (rebuild) → Send Calendar (rebuild)
 * This always uses sendMessage, not editMessageText
 * 
 * Solution: Redirect to smart chain:
 * Handle Calendar Nav → Get Month (Render smart) → Ensure Month (smart) → Render Calendar (smart) → Edit/Send Calendar (smart)
 */

const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, '..', 'workflows', 'ozon-telegram-bot.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('📝 Routing calendar nav to smart editMessageText chain...\n');

// Change Handle Calendar Nav connection
// FROM: Handle Calendar Nav → Ensure Month For Render
// TO:   Handle Calendar Nav → Get Month (Render smart)

workflow.connections["Handle Calendar Nav"] = {
  "main": [[{ "node": "Get Month (Render smart)", "type": "main", "index": 0 }]]
};

console.log('✅ Handle Calendar Nav → Get Month (Render smart)');

// Also update Persist Selected (Reset) to use smart chain
// FROM: Persist Selected (Reset) → Handle Calendar Nav
// TO:   Persist Selected (Reset) → Get Month (Render smart)

workflow.connections["Persist Selected (Reset)"] = {
  "main": [[{ "node": "Get Month (Render smart)", "type": "main", "index": 0 }]]
};

console.log('✅ Persist Selected (Reset) → Get Month (Render smart)');

// Write updated workflow
fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 2));

console.log(`\n✅ Successfully routed calendar nav to smart chain`);
console.log(`📊 Total nodes: ${workflow.nodes.length}`);
console.log(`📊 Total connections: ${Object.keys(workflow.connections).length}`);

console.log('\nNew flow:');
console.log('  Handle Calendar Nav → Get Month (Render smart) → Ensure Month (smart) → Compute Selection Summary → Render Calendar (smart) → Edit/Send Calendar (smart)');
console.log('  Result: Calendar updates in-place with editMessageText ✅');
