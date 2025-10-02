#!/usr/bin/env node
/**
 * ux(calendar): show loaded range in header
 * 
 * Add "Загружено: minMonth … maxMonth" to calendar header
 * minMonth/maxMonth are already available in Render Calendar (smart) input
 */

const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, '..', 'workflows', 'ozon-telegram-bot.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('📝 Adding loaded range to calendar header...\n');

// Find Render Calendar (smart) node
const renderCalSmartNode = workflow.nodes.find(n => n.name === 'Render Calendar (smart)');

if (!renderCalSmartNode) {
  console.error('❌ Render Calendar (smart) node not found');
  process.exit(1);
}

console.log('✅ Found Render Calendar (smart) node');

// Update jsCode to include loaded range in header
const oldCode = renderCalSmartNode.parameters.jsCode;

// Find the line where text is constructed
// Current: const text = `📅 <b>Мультивыбор дат</b>\\n${selectedLine}\\n${mini}`;
// New: const text = `📅 <b>Мультивыбор дат</b>\\nЗагружено: <b>${minMonth}</b> … <b>${maxMonth}</b>\\n${selectedLine}\\n${mini}`;

const newCode = oldCode.replace(
  /const text = `📅 <b>Мультивыбор дат<\/b>\\\\n\$\{selectedLine\}\\\\n\$\{mini\}`;/,
  'const text = `📅 <b>Мультивыбор дат</b>\\\\nЗагружено: <b>${minMonth}</b> … <b>${maxMonth}</b>\\\\n${selectedLine}\\\\n${mini}`;'
);

if (newCode === oldCode) {
  console.error('❌ Failed to find text construction line in jsCode');
  console.log('Looking for pattern in code...');
  if (oldCode.includes('📅 <b>Мультивыбор дат</b>')) {
    console.log('✓ Found calendar header text');
    // Try alternative replacement
    const altCode = oldCode.replace(
      '📅 <b>Мультивыбор дат</b>\\\\n${selectedLine}\\\\n${mini}',
      '📅 <b>Мультивыбор дат</b>\\\\nЗагружено: <b>${minMonth}</b> … <b>${maxMonth}</b>\\\\n${selectedLine}\\\\n${mini}'
    );
    if (altCode !== oldCode) {
      renderCalSmartNode.parameters.jsCode = altCode;
      console.log('✅ Updated calendar header text (alternative pattern)');
    } else {
      console.error('❌ Could not update text - pattern mismatch');
      process.exit(1);
    }
  } else {
    process.exit(1);
  }
} else {
  renderCalSmartNode.parameters.jsCode = newCode;
  console.log('✅ Updated calendar header to include loaded range');
}

// Write updated workflow
fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 2));

console.log(`\n✅ Successfully added loaded range to calendar header`);
console.log(`📊 Total nodes: ${workflow.nodes.length}`);
console.log(`📊 Total connections: ${Object.keys(workflow.connections).length}`);

console.log('\nCalendar header now shows:');
console.log('  📅 Мультивыбор дат');
console.log('  Загружено: YYYY-MM … YYYY-MM');
console.log('  Выбрано (N/3): date1, date2, ...');
console.log('  Итого: заказы X • сумма Y ₽');
