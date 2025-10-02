#!/usr/bin/env node
/**
 * chore(calendar): remove legacy sendMessage-based nodes
 * 
 * These nodes are no longer used after routing to smart chain:
 * - Render Calendar Grid
 * - Send Calendar
 * - Render Calendar (rebuild)
 * - Send Calendar (rebuild)
 * - Render Calendar Grid (rerender)
 * - Send Calendar Grid
 * - Pick Month For Re-render
 * - Ensure Month For Render
 * - Fetch CSV (Render)
 * - Get Month (Render)
 */

const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, '..', 'workflows', 'ozon-telegram-bot.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('📝 Removing legacy calendar nodes...\n');

const legacyNodeNames = [
  'Render Calendar Grid',
  'Send Calendar',
  'Render Calendar (rebuild)',
  'Send Calendar (rebuild)',
  'Render Calendar Grid (rerender)',
  'Send Calendar Grid',
  'Pick Month For Re-render',
  'Ensure Month For Render',
  'Fetch CSV (Render)',
  'Get Month (Render)',
  'Fetch CSV (Render again)'
];

let removedCount = 0;

// Remove nodes
legacyNodeNames.forEach(nodeName => {
  const nodeIdx = workflow.nodes.findIndex(n => n.name === nodeName);
  if (nodeIdx !== -1) {
    workflow.nodes.splice(nodeIdx, 1);
    console.log(`✅ Removed: ${nodeName}`);
    removedCount++;
    
    // Remove connections
    if (workflow.connections[nodeName]) {
      delete workflow.connections[nodeName];
      console.log(`   └─ Deleted outgoing connections from ${nodeName}`);
    }
  }
});

// Remove incoming connections to deleted nodes
Object.keys(workflow.connections).forEach(sourceNode => {
  const conns = workflow.connections[sourceNode];
  if (conns.main) {
    conns.main = conns.main.map(outputArray => {
      if (!Array.isArray(outputArray)) return outputArray;
      return outputArray.filter(conn => {
        const isLegacy = legacyNodeNames.includes(conn.node);
        if (isLegacy) {
          console.log(`   └─ Removed connection: ${sourceNode} → ${conn.node}`);
        }
        return !isLegacy;
      });
    });
  }
});

// Write updated workflow
fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 2));

console.log(`\n✅ Successfully removed ${removedCount} legacy calendar nodes`);
console.log(`📊 Total nodes: ${workflow.nodes.length}`);
console.log(`📊 Total connections: ${Object.keys(workflow.connections).length}`);

console.log('\nRemaining calendar system:');
console.log('  Smart chain: Calc Initial Month → Persist Cal Month (initial) → Get Month (Render smart) → Ensure Month (smart) → Compute Selection Summary → Render Calendar (smart) → Edit/Send Calendar (smart)');
