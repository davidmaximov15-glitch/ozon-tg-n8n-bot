#!/usr/bin/env node
/**
 * chore(ttl): align Redis TTLs with spec
 * 
 * Specification:
 * - ozon:sess:*:csv = 259200 (72 hours) - dataset/cache
 * - ozon:sess:*:dates = 86400 (24 hours) - selection/session
 * - ozon:ui:* = 86400 (24 hours) - UI state
 */

const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, '..', 'workflows', 'ozon-telegram-bot.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('📝 Aligning Redis TTLs with specification...\n');

const TTL_72H = 259200; // 72 hours
const TTL_24H = 86400;  // 24 hours

let changedCount = 0;

// Update all Redis SET operations
workflow.nodes.forEach(node => {
  if (node.type === 'n8n-nodes-base.redis' && node.parameters.operation === 'set') {
    const key = node.parameters.key;
    const currentTTL = node.parameters.options?.ttl;
    
    if (!key) return;
    
    let newTTL = null;
    
    // Check if key contains csv
    if (key.includes(':csv')) {
      newTTL = TTL_72H;
    }
    // Check if key contains dates or is UI key
    else if (key.includes(':dates') || key.includes('ozon:ui:') || key.includes(':cal_month') || key.includes(':calendar_msg_id')) {
      newTTL = TTL_24H;
    }
    
    if (newTTL && currentTTL !== newTTL) {
      if (!node.parameters.options) {
        node.parameters.options = {};
      }
      node.parameters.options.ttl = newTTL;
      const ttlHours = (newTTL / 3600).toFixed(0);
      console.log(`✅ ${node.name}: ${currentTTL || 'no TTL'} → ${newTTL} (${ttlHours}h)`);
      console.log(`   Key pattern: ${key.substring(0, 60)}...`);
      changedCount++;
    }
  }
});

// Write updated workflow
fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 2));

console.log(`\n✅ Successfully updated ${changedCount} Redis TTL values`);
console.log(`📊 Total nodes: ${workflow.nodes.length}`);
console.log(`📊 Total connections: ${Object.keys(workflow.connections).length}`);

console.log('\nTTL Summary:');
console.log(`  ozon:sess:*:csv → 259200s (72h) - Dataset cache`);
console.log(`  ozon:sess:*:dates → 86400s (24h) - User selection`);
console.log(`  ozon:ui:*:* → 86400s (24h) - UI state`);
