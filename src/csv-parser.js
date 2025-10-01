/**
 * CSV Parser for Ozon FBO/FBS Reports
 * Detects report type and normalizes data structure
 */

/**
 * Parse CSV data and detect report type
 * @param {string} csvData - Raw CSV string
 * @returns {Object} Parsed and normalized data
 */
function parseAndNormalizeCSV(csvData) {
  const lines = csvData.trim().split('\n');
  
  if (lines.length < 2) {
    throw new Error('CSV файл пустой или поврежден');
  }

  // Parse headers
  const headers = parseCSVLine(lines[0]);
  
  // Detect report type
  const reportType = detectReportType(headers);
  
  if (reportType === 'UNKNOWN') {
    throw new Error('Не удалось определить тип отчета (FBO/FBS). Проверьте формат файла.');
  }

  // Parse data rows
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    try {
      const values = parseCSVLine(line);
      const record = normalizeRecord(headers, values, reportType);
      if (record) {
        records.push(record);
      }
    } catch (e) {
      console.warn(`Skipping invalid line ${i}: ${e.message}`);
    }
  }

  // Extract unique dates (convert UTC to MSK)
  const dates = new Set();
  records.forEach(record => {
    if (record.created_at) {
      try {
        const date = new Date(record.created_at);
        // Convert UTC to MSK (+3 hours)
        const mskDate = new Date(date.getTime() + 3 * 60 * 60 * 1000);
        const dateStr = mskDate.toISOString().split('T')[0];
        dates.add(dateStr);
      } catch (e) {
        // Skip invalid dates
      }
    }
  });

  const availableDates = Array.from(dates).sort();

  if (availableDates.length === 0) {
    throw new Error('В файле не найдены корректные даты');
  }

  return {
    reportType,
    records,
    availableDates,
    totalRecords: records.length
  };
}

/**
 * Parse a CSV line handling quoted values
 * @param {string} line - CSV line
 * @returns {Array<string>} Parsed values
 */
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  values.push(current.trim());
  return values;
}

/**
 * Detect report type from headers
 * @param {Array<string>} headers - CSV headers
 * @returns {string} Report type (FBO, FBS, or UNKNOWN)
 */
function detectReportType(headers) {
  const headersLower = headers.map(h => h.toLowerCase());
  
  // FBO indicators
  if (headersLower.some(h => h.includes('номер заказа'))) {
    return 'FBO';
  }
  
  // FBS indicators
  if (headersLower.some(h => h.includes('№ заказа') || h === '№ заказа')) {
    return 'FBS';
  }
  
  return 'UNKNOWN';
}

/**
 * Normalize a record to unified structure
 * @param {Array<string>} headers - CSV headers
 * @param {Array<string>} values - Row values
 * @param {string} reportType - FBO or FBS
 * @returns {Object|null} Normalized record
 */
function normalizeRecord(headers, values, reportType) {
  const record = {};
  
  headers.forEach((header, idx) => {
    record[header] = values[idx] || '';
  });

  let orderId, sku, quantity, price, createdAt, status;

  if (reportType === 'FBO') {
    // FBO structure
    // A: Номер заказа (index 0)
    // G: Артикул (index 6)
    // I: Количество (index 8)
    // N: Цена (index 13)
    // R: Кол-во для расчета средней (index 17)
    
    orderId = findValue(record, ['Номер заказа', 'номер заказа'], values[0]);
    sku = findValue(record, ['Артикул', 'артикул'], values[6]);
    quantity = parseInt(findValue(record, ['Количество', 'количество'], values[8]) || '1');
    price = parseFloat(findValue(record, ['Цена', 'цена'], values[13]) || '0');
    createdAt = findValue(record, ['Дата создания', 'дата создания', 'created_at'], values[15]);
    status = findValue(record, ['Статус', 'статус'], values[16]);
  } else {
    // FBS structure
    orderId = findValue(record, ['№ заказа', '№ Заказа'], values[0]);
    sku = findValue(record, ['Артикул продавца', 'артикул продавца', 'Артикул'], values[1]);
    quantity = parseInt(findValue(record, ['Кол-во', 'Количество', 'количество'], values[2]) || '1');
    price = parseFloat(findValue(record, ['Цена', 'цена'], values[3]) || '0');
    createdAt = findValue(record, ['Дата создания', 'дата создания', 'created_at'], values[4]);
    status = findValue(record, ['Статус', 'статус'], values[5]);
  }

  // Validate required fields
  if (!orderId || !sku) {
    return null;
  }

  return {
    order_id: orderId,
    sku: sku,
    quantity: isNaN(quantity) ? 1 : quantity,
    price: isNaN(price) ? 0 : price,
    created_at: createdAt,
    status: status ? status.toLowerCase() : ''
  };
}

/**
 * Find value from record by multiple possible keys
 * @param {Object} record - Record object
 * @param {Array<string>} possibleKeys - Possible key names
 * @param {string} fallback - Fallback value
 * @returns {string} Found value or fallback
 */
function findValue(record, possibleKeys, fallback = '') {
  for (const key of possibleKeys) {
    if (record[key] !== undefined && record[key] !== '') {
      return record[key];
    }
  }
  return fallback;
}

// Export for n8n Code node
module.exports = {
  parseAndNormalizeCSV,
  parseCSVLine,
  detectReportType,
  normalizeRecord
};

// For direct usage in n8n Code node, wrap the main function:
// const csvData = $input.item.json.data;
// const result = parseAndNormalizeCSV(csvData);
// return [{ json: result }];
