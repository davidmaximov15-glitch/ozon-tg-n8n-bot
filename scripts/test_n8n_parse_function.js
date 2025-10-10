#!/usr/bin/env node
/**
 * Тестирование функции parseAsMsk из N8N workflow
 * Использует реальные данные из orders-2025-fbo-test.csv и orders-2025-fbs-test.csv
 */

const fs = require('fs');
const path = require('path');

// Функция parseAsMsk из обновленного workflow
function parseAsMsk(s) {
  if (!s) return null;
  let utcDate;
  const trimmed = s.trim();
  
  // FBO формат: DD.MM.YYYY H:MM или DD.MM.YYYY HH:MM:SS
  if (/^\d{2}\.\d{2}\.\d{4} \d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    const parts = trimmed.split(' ');
    const [d, m, y] = parts[0].split('.');
    let time = parts[1];
    
    // Hour padding для однозначных часов
    if (time.length < 5) time = '0' + time;
    
    const isoStr = `${y}-${m}-${d}T${time.length === 5 ? time + ':00' : time}Z`;
    utcDate = new Date(isoStr);
  }
  // FBS формат: YYYY-MM-DD HH:MM:SS
  else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    utcDate = new Date(trimmed.replace(' ', 'T') + 'Z');
  }
  // Fallback
  else {
    const t = Date.parse(s);
    if (Number.isFinite(t)) {
      utcDate = new Date(t);
    } else {
      utcDate = new Date(s);
    }
  }
  
  if (isNaN(utcDate)) return null;
  
  // UTC → MSK (+3 часа)
  return new Date(utcDate.getTime() + 3 * 3600 * 1000);
}

// Функция для парсинга CSV
function parseCSV(filePath, delimiter = ';') {
  let content = fs.readFileSync(filePath, 'utf-8');
  // Удаляем BOM если есть
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }
  const lines = content.split('\n').filter(line => line.trim());
  
  if (lines.length === 0) return [];
  
  const headers = lines[0].split(delimiter).map(h => h.trim());
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(delimiter);
    const row = {};
    
    headers.forEach((header, idx) => {
      row[header] = values[idx] ? values[idx].trim() : '';
    });
    
    rows.push(row);
  }
  
  return rows;
}

// Основная логика тестирования
function runTests() {
  console.log('🎯 ТЕСТИРОВАНИЕ ФУНКЦИИ parseAsMsk С РЕАЛЬНЫМИ ДАННЫМИ');
  console.log('='.repeat(80));
  
  const results = {
    fbo: { total: 0, success: 0, errors: [], dates: new Set() },
    fbs: { total: 0, success: 0, errors: [], dates: new Set() }
  };
  
  // Тест FBO данных
  console.log('\n📦 ТЕСТ 1: FBO данные (orders-2025-fbo-test.csv)');
  console.log('-'.repeat(80));
  
  const fboPath = path.join(__dirname, '../orders-2025-fbo-test.csv');
  
  if (fs.existsSync(fboPath)) {
    const fboRows = parseCSV(fboPath, ';');
    console.log(`   Загружено строк: ${fboRows.length}`);
    
    fboRows.forEach((row, idx) => {
      const dateStr = row['Принят в обработку'];
      if (!dateStr) return;
      
      results.fbo.total++;
      
      const parsed = parseAsMsk(dateStr);
      
      if (parsed && !isNaN(parsed.getTime())) {
        results.fbo.success++;
        
        const dateOnly = parsed.toISOString().split('T')[0];
        results.fbo.dates.add(dateOnly);
        
        // Выводим первые 5 примеров
        if (idx < 5) {
          const mskTime = parsed.toISOString().replace('T', ' ').slice(0, 16);
          console.log(`   ✅ "${dateStr}" → ${mskTime} MSK`);
        }
      } else {
        results.fbo.errors.push({ row: idx + 2, date: dateStr });
        if (results.fbo.errors.length <= 3) {
          console.log(`   ❌ Ошибка парсинга: "${dateStr}" (строка ${idx + 2})`);
        }
      }
    });
    
    console.log(`\n   Итого:`);
    console.log(`      Всего дат: ${results.fbo.total}`);
    console.log(`      Успешно: ${results.fbo.success} (${(results.fbo.success / results.fbo.total * 100).toFixed(1)}%)`);
    console.log(`      Ошибок: ${results.fbo.errors.length}`);
    console.log(`      Уникальных дат: ${results.fbo.dates.size}`);
    console.log(`      Даты: ${Array.from(results.fbo.dates).sort().join(', ')}`);
  } else {
    console.log(`   ⚠️ Файл не найден: ${fboPath}`);
  }
  
  // Тест FBS данных
  console.log('\n📦 ТЕСТ 2: FBS данные (orders-2025-fbs-test.csv)');
  console.log('-'.repeat(80));
  
  const fbsPath = path.join(__dirname, '../orders-2025-fbs-test.csv');
  
  if (fs.existsSync(fbsPath)) {
    const fbsRows = parseCSV(fbsPath, ';');
    console.log(`   Загружено строк: ${fbsRows.length}`);
    
    fbsRows.forEach((row, idx) => {
      const dateStr = row['Принят в обработку'];
      if (!dateStr) return;
      
      results.fbs.total++;
      
      const parsed = parseAsMsk(dateStr);
      
      if (parsed && !isNaN(parsed.getTime())) {
        results.fbs.success++;
        
        const dateOnly = parsed.toISOString().split('T')[0];
        results.fbs.dates.add(dateOnly);
        
        // Выводим все примеры (их мало)
        if (idx < 10) {
          const mskTime = parsed.toISOString().replace('T', ' ').slice(0, 16);
          console.log(`   ✅ "${dateStr}" → ${mskTime} MSK`);
        }
      } else {
        results.fbs.errors.push({ row: idx + 2, date: dateStr });
        console.log(`   ❌ Ошибка парсинга: "${dateStr}" (строка ${idx + 2})`);
      }
    });
    
    console.log(`\n   Итого:`);
    console.log(`      Всего дат: ${results.fbs.total}`);
    console.log(`      Успешно: ${results.fbs.success} (${(results.fbs.success / results.fbs.total * 100).toFixed(1)}%)`);
    console.log(`      Ошибок: ${results.fbs.errors.length}`);
    console.log(`      Уникальных дат: ${results.fbs.dates.size}`);
    console.log(`      Даты: ${Array.from(results.fbs.dates).sort().join(', ')}`);
  } else {
    console.log(`   ⚠️ Файл не найден: ${fbsPath}`);
  }
  
  // Юнит-тесты специфичных кейсов
  console.log('\n📦 ТЕСТ 3: Юнит-тесты специфичных кейсов');
  console.log('-'.repeat(80));
  
  const testCases = [
    // FBO даты в UTC, конвертируются в MSK (+3 часа)
    { input: '01.10.2025 7:26', expected: '2025-10-01T10:26', desc: 'FBO: single-digit hour UTC→MSK' },
    { input: '01.10.2025 17:30', expected: '2025-10-01T20:30', desc: 'FBO: double-digit hour UTC→MSK' },
    { input: '02.09.2025 9:15', expected: '2025-09-02T12:15', desc: 'FBO: hour padding UTC→MSK' },
    // FBS даты в UTC, конвертируются в MSK (+3 часа)
    { input: '2025-09-27 21:10:51', expected: '2025-09-28T00:10', desc: 'FBS: UTC to MSK (+3h)' },
    { input: '2025-09-28 10:20:17', expected: '2025-09-28T13:20', desc: 'FBS: mid-day UTC→MSK' },
    { input: '2025-09-28 23:06:41', expected: '2025-09-29T02:06', desc: 'FBS: late evening UTC→MSK' }
  ];
  
  let unitTestsPass = 0;
  let unitTestsFail = 0;
  
  testCases.forEach(test => {
    const parsed = parseAsMsk(test.input);
    
    if (parsed) {
      const result = parsed.toISOString().slice(0, 16);
      const pass = result === test.expected;
      
      if (pass) {
        console.log(`   ✅ ${test.desc}`);
        console.log(`      Input: "${test.input}" → ${result}`);
        unitTestsPass++;
      } else {
        console.log(`   ❌ ${test.desc}`);
        console.log(`      Input: "${test.input}"`);
        console.log(`      Expected: ${test.expected}`);
        console.log(`      Got: ${result}`);
        unitTestsFail++;
      }
    } else {
      console.log(`   ❌ ${test.desc} - парсинг вернул null`);
      unitTestsFail++;
    }
  });
  
  console.log(`\n   Итого:`);
  console.log(`      Passed: ${unitTestsPass}/${testCases.length}`);
  console.log(`      Failed: ${unitTestsFail}/${testCases.length}`);
  
  // Финальный отчет
  console.log('\n' + '='.repeat(80));
  console.log('📊 ИТОГОВЫЙ ОТЧЕТ');
  console.log('='.repeat(80));
  
  const totalTests = results.fbo.total + results.fbs.total;
  const totalSuccess = results.fbo.success + results.fbs.success;
  const totalErrors = results.fbo.errors.length + results.fbs.errors.length;
  
  console.log(`\n✅ FBO: ${results.fbo.success}/${results.fbo.total} (${(results.fbo.success / results.fbo.total * 100).toFixed(1)}%)`);
  console.log(`✅ FBS: ${results.fbs.success}/${results.fbs.total} (${(results.fbs.success / results.fbs.total * 100).toFixed(1)}%)`);
  console.log(`✅ Unit tests: ${unitTestsPass}/${testCases.length} (${(unitTestsPass / testCases.length * 100).toFixed(1)}%)`);
  console.log(`\n📈 Общая статистика:`);
  console.log(`   Всего дат обработано: ${totalTests}`);
  console.log(`   Успешно: ${totalSuccess} (${(totalSuccess / totalTests * 100).toFixed(1)}%)`);
  console.log(`   Ошибок: ${totalErrors}`);
  
  const allDates = new Set([...results.fbo.dates, ...results.fbs.dates]);
  console.log(`   Уникальных дат найдено: ${allDates.size}`);
  
  if (totalErrors === 0 && unitTestsFail === 0) {
    console.log(`\n🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ! Функция parseAsMsk работает корректно.`);
    return 0;
  } else {
    console.log(`\n⚠️ ЕСТЬ ОШИБКИ! Требуется доработка.`);
    return 1;
  }
}

// Запуск
const exitCode = runTests();
process.exit(exitCode);
