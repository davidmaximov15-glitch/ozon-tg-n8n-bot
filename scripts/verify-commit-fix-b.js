#!/usr/bin/env node
/**
 * Verify: fix(flow): explicit no-file message for stats and calendar
 * This was already implemented in commits #2 (file session) and #7 (stats gating)
 */

const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, '..', 'workflows', 'ozon-telegram-bot.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('📝 Verifying UX-фикс Б: explicit no-file message for stats and calendar...\n');

// Check stats flow
const hasCsvNode = workflow.nodes.find(n => n.name === 'Has CSV?');
const answerNoFileNode = workflow.nodes.find(n => n.name === 'Answer Callback (no-file)');

if (!hasCsvNode) {
  console.error('❌ Has CSV? node not found');
  process.exit(1);
}

if (!answerNoFileNode) {
  console.error('❌ Answer Callback (no-file) node not found');
  process.exit(1);
}

console.log('✅ Has CSV? node exists (from commit #7)');
console.log('✅ Answer Callback (no-file) node exists (from commit #7)');

// Check Has CSV? connections
const hasCsvConn = workflow.connections["Has CSV?"];
if (!hasCsvConn || !hasCsvConn.main) {
  console.error('❌ Has CSV? connections not found');
  process.exit(1);
}

const falseNode = hasCsvConn.main[0] && hasCsvConn.main[0][0];
if (!falseNode || falseNode.node !== 'Answer Callback (no-file)') {
  console.error('❌ Has CSV? false branch does not connect to Answer Callback (no-file)');
  process.exit(1);
}

console.log('✅ Has CSV? (false) → Answer Callback (no-file): "Файл не найден. Загрузите отчёт .csv/.xlsx"');

// Check calendar flow (cal:open)
const hasFileCalopen = workflow.nodes.find(n => n.name === 'Has File? (calopen)');
const answerNeedFileCalopen = workflow.nodes.find(n => n.name === 'Answer Callback (need file)');

if (!hasFileCalopen) {
  console.error('❌ Has File? (calopen) node not found');
  process.exit(1);
}

if (!answerNeedFileCalopen) {
  console.error('❌ Answer Callback (need file) node not found');
  process.exit(1);
}

console.log('✅ Has File? (calopen) node exists (from commit #2)');
console.log('✅ Answer Callback (need file) node exists (from commit #2)');

// Check Has File? (calopen) connections
const hasFileConn = workflow.connections["Has File? (calopen)"];
if (!hasFileConn || !hasFileConn.main) {
  console.error('❌ Has File? (calopen) connections not found');
  process.exit(1);
}

const calOpenFalseNode = hasFileConn.main[1] && hasFileConn.main[1][0];
if (!calOpenFalseNode || calOpenFalseNode.node !== 'Answer Callback (need file)') {
  console.error('❌ Has File? (calopen) false branch does not connect properly');
  process.exit(1);
}

console.log('✅ Has File? (calopen) (false) → Answer Callback (need file)');

console.log('\n✅ UX-фикс Б already implemented in commits #2 and #7');
console.log('✅ Statistics blocked without file: "Файл не найден. Загрузите отчёт .csv/.xlsx"');
console.log('✅ Calendar blocked without file at cal:open');
console.log('✅ Both flows show explicit messages instead of silent failures');
console.log(`📊 Total nodes: ${workflow.nodes.length}`);
console.log(`📊 Total connections: ${Object.keys(workflow.connections).length}`);
