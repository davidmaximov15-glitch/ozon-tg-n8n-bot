#!/usr/bin/env node
/**
 * chore(redis): migrate keys from cache/* to sess/* and ui/* namespaces
 */

const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, '..', 'workflows', 'ozon-telegram-bot.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('📝 Migrating Redis keys to sess/ui namespaces...\n');

let migratedCount = 0;

// Migrate all nodes
workflow.nodes.forEach(node => {
  if (node.parameters && node.parameters.key) {
    const oldKey = node.parameters.key;
    let newKey = oldKey;
    let changed = false;
    
    // csv_data → sess:csv
    if (oldKey.includes('ozon:cache:') && oldKey.includes(':csv_data')) {
      newKey = oldKey.replace('ozon:cache:', 'ozon:sess:').replace(':csv_data', ':csv');
      changed = true;
    }
    
    // selected_dates → sess:dates
    if (oldKey.includes('ozon:cache:') && oldKey.includes(':selected_dates')) {
      newKey = oldKey.replace('ozon:cache:', 'ozon:sess:').replace(':selected_dates', ':dates');
      changed = true;
    }
    
    // calendar_msg_id → ui:calendar_msg_id (keep same name, just change namespace)
    if (oldKey.includes('ozon:cache:') && oldKey.includes(':calendar_msg_id')) {
      newKey = oldKey.replace('ozon:cache:', 'ozon:ui:');
      changed = true;
    }
    
    if (changed) {
      node.parameters.key = newKey;
      migratedCount++;
      console.log(`✅ ${node.name} (${node.id})`);
      console.log(`   ${oldKey}`);
      console.log(`   → ${newKey}`);
    }
  }
  
  // Also check jsCode for any hardcoded keys
  if (node.parameters && node.parameters.jsCode) {
    const oldCode = node.parameters.jsCode;
    let newCode = oldCode;
    
    // csv_data migrations
    newCode = newCode.replace(/ozon:cache:([^:]+):csv_data/g, 'ozon:sess:$1:csv');
    
    // selected_dates migrations
    newCode = newCode.replace(/ozon:cache:([^:]+):selected_dates/g, 'ozon:sess:$1:dates');
    
    // calendar_msg_id migrations
    newCode = newCode.replace(/ozon:cache:([^:]+):calendar_msg_id/g, 'ozon:ui:$1:calendar_msg_id');
    
    if (newCode !== oldCode) {
      node.parameters.jsCode = newCode;
      console.log(`✅ ${node.name} (${node.id}) - updated jsCode`);
      migratedCount++;
    }
  }
  
  // Check HTTP request bodies (for answerCallbackQuery, sendMessage, etc.)
  if (node.parameters && node.parameters.jsonBody) {
    const oldBody = node.parameters.jsonBody;
    let newBody = oldBody;
    
    newBody = newBody.replace(/ozon:cache:([^:]+):csv_data/g, 'ozon:sess:$1:csv');
    newBody = newBody.replace(/ozon:cache:([^:]+):selected_dates/g, 'ozon:sess:$1:dates');
    newBody = newBody.replace(/ozon:cache:([^:]+):calendar_msg_id/g, 'ozon:ui:$1:calendar_msg_id');
    
    if (newBody !== oldBody) {
      node.parameters.jsonBody = newBody;
      console.log(`✅ ${node.name} (${node.id}) - updated jsonBody`);
      migratedCount++;
    }
  }
});

// Write updated workflow
fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 2));

console.log(`\n✅ Successfully migrated ${migratedCount} occurrences`);

// Verify no cache keys remain
const workflowStr = JSON.stringify(workflow);
const remainingCache = (workflowStr.match(/ozon:cache:/g) || []).length;

if (remainingCache > 0) {
  console.warn(`⚠️  Warning: ${remainingCache} "ozon:cache:" references still remain!`);
} else {
  console.log('✅ All "ozon:cache:" references have been migrated');
}

console.log(`📊 Total nodes: ${workflow.nodes.length}`);
console.log(`📊 Total connections: ${Object.keys(workflow.connections).length}`);
