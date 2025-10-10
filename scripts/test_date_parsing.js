#!/usr/bin/env node
/**
 * Test the date parsing logic extracted from the workflows
 * Tests both FBO (DD.MM.YYYY H:MM) and FBS (YYYY-MM-DD HH:MM:SS) formats
 */

function parseAsMsk(s){
  if(!s) return null;
  let utcDate;
  const trimmed=s.trim();
  
  // Handle FBO format: DD.MM.YYYY H:MM or DD.MM.YYYY H:MM:SS
  if(/^\d{2}\.\d{2}\.\d{4} \d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)){
    const parts=trimmed.split(' ');
    const [d,m,y]=parts[0].split('.');
    let time=parts[1];
    // Pad single digit hours: "7:26" -> "07:26"
    if(time.length < 5) time = '0' + time;
    const isoStr=`${y}-${m}-${d}T${time.length===5?time+':00':time}Z`;
    utcDate=new Date(isoStr);
  }
  // Handle FBS format: YYYY-MM-DD HH:MM:SS
  else if(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)){
    utcDate=new Date(trimmed.replace(' ','T')+'Z');
  }
  // Fallback
  else {
    utcDate=new Date(s);
  }
  
  if(isNaN(utcDate)) return null;
  
  // Convert UTC to MSK (UTC+3)
  return new Date(utcDate.getTime()+3*3600*1000);
}

// Test cases
const testCases = [
  // FBO format
  { input: '01.10.2025 7:26', expected: '2025-10-01 10:26', type: 'FBO' },
  { input: '01.10.2025 7:25', expected: '2025-10-01 10:25', type: 'FBO' },
  { input: '01.10.2025 17:30', expected: '2025-10-01 20:30', type: 'FBO' },
  
  // FBS format
  { input: '2025-09-27 21:10:51', expected: '2025-09-28 00:10', type: 'FBS' },
  { input: '2025-09-28 10:20:17', expected: '2025-09-28 13:20', type: 'FBS' },
  { input: '2025-09-28 13:06:41', expected: '2025-09-28 16:06', type: 'FBS' },
];

console.log('🧪 Testing Date Parsing Functions\n');
console.log('='.repeat(80));

let passed = 0;
let failed = 0;

for(const test of testCases) {
  const result = parseAsMsk(test.input);
  
  if(!result) {
    console.log(`\n❌ FAILED (${test.type}): '${test.input}'`);
    console.log(`   Result: null`);
    console.log(`   Expected: ${test.expected}`);
    failed++;
    continue;
  }
  
  const resultStr = result.toISOString().slice(0,16).replace('T', ' ');
  const dateOnly = result.toISOString().split('T')[0];
  
  if(resultStr.startsWith(test.expected)) {
    console.log(`\n✅ PASSED (${test.type}): '${test.input}'`);
    console.log(`   → MSK: ${resultStr}`);
    console.log(`   → Date: ${dateOnly}`);
    passed++;
  } else {
    console.log(`\n❌ FAILED (${test.type}): '${test.input}'`);
    console.log(`   Result: ${resultStr}`);
    console.log(`   Expected: ${test.expected}`);
    failed++;
  }
}

console.log('\n' + '='.repeat(80));
console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);

if(failed > 0) {
  process.exit(1);
}

console.log('\n✅ All date parsing tests passed!\n');
