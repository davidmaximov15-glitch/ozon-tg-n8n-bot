#!/usr/bin/env node
/**
 * refactor(route): normalize calendar callbacks to cal:<YYYY-MM>:prev|next
 * Remove calnav:, dedupe file:clear rule
 */

const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, '..', 'workflows', 'ozon-telegram-bot.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('📝 Normalizing calendar callback prefixes...\n');

let changesCount = 0;

// 1. Update Route Message
const routeNode = workflow.nodes.find(n => n.name === 'Route Message');
if (routeNode && routeNode.parameters && routeNode.parameters.rules) {
  const rules = routeNode.parameters.rules.values;
  
  // Remove calnav: check from CalNav rule
  const calNavRule = rules.find(r => r.outputKey === 'CalNav');
  if (calNavRule && calNavRule.conditions && calNavRule.conditions.conditions) {
    const oldConditions = calNavRule.conditions.conditions.length;
    // Keep only cal: check, remove calnav:
    calNavRule.conditions.conditions = calNavRule.conditions.conditions.filter(c => 
      !(c.rightValue === 'calnav:')
    );
    if (calNavRule.conditions.conditions.length < oldConditions) {
      console.log('✅ Route Message: Removed calnav: check from CalNav rule');
      changesCount++;
    }
    // Change combinator from 'or' to 'and' since we have only one condition now
    if (calNavRule.conditions.conditions.length === 1) {
      calNavRule.conditions.combinator = 'and';
    }
  }
  
  // Remove duplicate FileClear rule
  const fileClearIndices = [];
  rules.forEach((r, idx) => {
    if (r.outputKey === 'FileClear') {
      fileClearIndices.push(idx);
    }
  });
  
  if (fileClearIndices.length > 1) {
    // Remove all but first
    for (let i = fileClearIndices.length - 1; i > 0; i--) {
      rules.splice(fileClearIndices[i], 1);
    }
    console.log(`✅ Route Message: Removed ${fileClearIndices.length - 1} duplicate FileClear rule(s)`);
    changesCount++;
  }
}

// 2. Update Handle Calendar Nav with unified parser
const handleCalNavNode = workflow.nodes.find(n => n.name === 'Handle Calendar Nav');
if (handleCalNavNode && handleCalNavNode.parameters) {
  handleCalNavNode.parameters.jsCode = `// input: callback_data = "cal:YYYY-MM:prev" | "cal:YYYY-MM:next"\nconst cb = $('Extract User Data').first().json.callback_data || '';\nconst [, ym, dir] = cb.split(':'); // ["cal","YYYY-MM","prev|next"]\n\nfunction shiftMonth(ymStr, step) {\n  const [y, m] = ymStr.split('-').map(Number);\n  const d = new Date(Date.UTC(y, (m - 1) + step, 1));\n  return \`\${d.getUTCFullYear()}-\${String(d.getUTCMonth()+1).padStart(2,'0')}\`;\n}\n\n// навигация\nconst nextMonth = dir === 'prev' ? shiftMonth(ym, -1)\n                 : dir === 'next' ? shiftMonth(ym,  1)\n                 : ym;\n\n// отдаём дальше месяц и контекст\nreturn [{\n  json: {\n    month: nextMonth,\n    chat_id: $('Extract User Data').first().json.chat_id,\n    user_id: $('Extract User Data').first().json.user_id\n  }\n}];`;
  console.log('✅ Handle Calendar Nav: Updated to unified cal:YYYY-MM:prev|next parser');
  changesCount++;
}

// 3. Update old calendar renders - replace calnav: → cal:
const oldCalendarRenders = [
  'Render Calendar Grid',
  'Render Calendar (rebuild)',
  'Render Calendar Grid (rerender)'
];

oldCalendarRenders.forEach(nodeName => {
  const node = workflow.nodes.find(n => n.name === nodeName);
  if (node && node.parameters && node.parameters.jsCode) {
    const oldCode = node.parameters.jsCode;
    // Replace calnav:prev:${month} → cal:${month}:prev
    // Replace calnav:next:${month} → cal:${month}:next
    let newCode = oldCode
      .replace(/calnav:prev:\$\{month\}/g, 'cal:${month}:prev')
      .replace(/calnav:next:\$\{month\}/g, 'cal:${month}:next')
      // Also handle template literal variations
      .replace(/calnav:prev:\${([^}]+)}/g, 'cal:${$1}:prev')
      .replace(/calnav:next:\${([^}]+)}/g, 'cal:${$1}:next');
    
    if (newCode !== oldCode) {
      node.parameters.jsCode = newCode;
      console.log(`✅ ${nodeName}: Replaced calnav: → cal:YYYY-MM:prev|next`);
      changesCount++;
    }
  }
});

// 4. Verify smart calendar already uses cal: format (no changes needed)
const smartCalNode = workflow.nodes.find(n => n.name === 'Render Calendar (smart)');
if (smartCalNode && smartCalNode.parameters && smartCalNode.parameters.jsCode) {
  const hasOldFormat = smartCalNode.parameters.jsCode.includes('calnav:');
  if (hasOldFormat) {
    console.warn('⚠️  Smart calendar still has calnav: references!');
  } else {
    console.log('✅ Render Calendar (smart): Already uses cal:YYYY-MM:prev|next format');
  }
}

// Write updated workflow
fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 2));
console.log(`\n✅ Successfully applied ${changesCount} changes`);

// Verify no calnav: remains
const workflowStr = JSON.stringify(workflow);
const remainingCalnav = (workflowStr.match(/calnav:/g) || []).length;

if (remainingCalnav > 0) {
  console.warn(`⚠️  Warning: ${remainingCalnav} "calnav:" references still remain!`);
} else {
  console.log('✅ All "calnav:" references have been removed');
}

console.log(`📊 Total nodes: ${workflow.nodes.length}`);
console.log(`📊 Total connections: ${Object.keys(workflow.connections).length}`);
