/**
 * Statistics Calculator for Ozon Orders
 * Calculates order statistics with date/time filtering
 */

/**
 * Calculate statistics for orders within a date/time range
 * @param {Array<Object>} records - Normalized order records
 * @param {string} date - Date in YYYY-MM-DD format (MSK timezone)
 * @param {string} startTime - Start time in HH:MM format (MSK timezone)
 * @param {string} endTime - End time in HH:MM format (MSK timezone)
 * @returns {Object} Statistics by SKU and totals
 */
function calculateStatistics(records, date, startTime, endTime) {
  // Filter records by date and time (MSK timezone)
  const filteredRecords = filterRecordsByDateTime(records, date, startTime, endTime);
  
  if (filteredRecords.length === 0) {
    return {
      date,
      startTime,
      endTime,
      totalOrders: 0,
      totalCancellations: 0,
      totalRevenue: 0,
      skuStats: {},
      message: 'Нет данных за указанный период'
    };
  }

  // Calculate statistics by SKU
  const statsBySku = {};
  const revenueStatuses = ['доставлен', 'доставляется', 'ожидает сборки', 'ожидает отгрузки'];
  const cancelStatuses = ['отменён', 'отменен', 'возврат'];

  filteredRecords.forEach(record => {
    const sku = record.sku;
    const status = record.status.toLowerCase();
    const quantity = record.quantity || 1;
    const price = record.price || 0;
    
    if (!statsBySku[sku]) {
      statsBySku[sku] = {
        totalOrders: 0,
        cancellations: 0,
        totalRevenue: 0,
        weightedPriceSum: 0,
        weightedQuantitySum: 0,
        avgPrice: 0
      };
    }
    
    // Count all orders
    statsBySku[sku].totalOrders += quantity;
    
    // Count cancellations (including returns)
    if (cancelStatuses.some(s => status.includes(s))) {
      statsBySku[sku].cancellations += quantity;
    }
    
    // Calculate revenue only for delivered/delivering statuses
    if (revenueStatuses.some(s => status.includes(s))) {
      statsBySku[sku].totalRevenue += price * quantity;
      statsBySku[sku].weightedPriceSum += price * quantity;
      statsBySku[sku].weightedQuantitySum += quantity;
    }
  });

  // Calculate average prices (weighted by quantity)
  Object.keys(statsBySku).forEach(sku => {
    const stats = statsBySku[sku];
    if (stats.weightedQuantitySum > 0) {
      stats.avgPrice = stats.weightedPriceSum / stats.weightedQuantitySum;
    } else {
      stats.avgPrice = 0;
    }
  });

  // Calculate totals
  let totalOrders = 0;
  let totalCancellations = 0;
  let totalRevenue = 0;

  Object.values(statsBySku).forEach(stats => {
    totalOrders += stats.totalOrders;
    totalCancellations += stats.cancellations;
    totalRevenue += stats.totalRevenue;
  });

  return {
    date,
    startTime,
    endTime,
    totalOrders,
    totalCancellations,
    totalRevenue,
    skuStats: statsBySku
  };
}

/**
 * Filter records by date and time range
 * @param {Array<Object>} records - Order records
 * @param {string} date - Date in YYYY-MM-DD (MSK)
 * @param {string} startTime - Start time HH:MM (MSK)
 * @param {string} endTime - End time HH:MM (MSK)
 * @returns {Array<Object>} Filtered records
 */
function filterRecordsByDateTime(records, date, startTime, endTime) {
  return records.filter(record => {
    try {
      const recordDate = new Date(record.created_at);
      // Convert UTC to MSK (+3 hours)
      const mskDate = new Date(recordDate.getTime() + 3 * 60 * 60 * 1000);
      const recordDateStr = mskDate.toISOString().split('T')[0];
      const recordTimeStr = mskDate.toTimeString().split(' ')[0].substring(0, 5);
      
      return recordDateStr === date && recordTimeStr >= startTime && recordTimeStr <= endTime;
    } catch (e) {
      return false;
    }
  });
}

/**
 * Compare statistics between multiple dates
 * @param {Array<Object>} statsArray - Array of statistics objects from different dates
 * @returns {Object} Comparison with growth/decline percentages
 */
function compareStatistics(statsArray) {
  if (statsArray.length < 2) {
    return { comparison: null, message: 'Нужно минимум 2 даты для сравнения' };
  }

  const comparisons = [];

  for (let i = 1; i < statsArray.length; i++) {
    const current = statsArray[i];
    const previous = statsArray[i - 1];
    
    const skuComparison = {};
    const allSkus = new Set([
      ...Object.keys(current.skuStats),
      ...Object.keys(previous.skuStats)
    ]);

    allSkus.forEach(sku => {
      const currentStats = current.skuStats[sku] || { totalOrders: 0, totalRevenue: 0 };
      const previousStats = previous.skuStats[sku] || { totalOrders: 0, totalRevenue: 0 };
      
      const ordersDiff = currentStats.totalOrders - previousStats.totalOrders;
      const ordersPercent = previousStats.totalOrders > 0
        ? ((ordersDiff / previousStats.totalOrders) * 100).toFixed(2)
        : (currentStats.totalOrders > 0 ? 100 : 0);
      
      const revenueDiff = currentStats.totalRevenue - previousStats.totalRevenue;
      const revenuePercent = previousStats.totalRevenue > 0
        ? ((revenueDiff / previousStats.totalRevenue) * 100).toFixed(2)
        : (currentStats.totalRevenue > 0 ? 100 : 0);

      skuComparison[sku] = {
        ordersDiff,
        ordersPercent: parseFloat(ordersPercent),
        revenueDiff,
        revenuePercent: parseFloat(revenuePercent),
        current: currentStats,
        previous: previousStats
      };
    });

    comparisons.push({
      currentDate: current.date,
      previousDate: previous.date,
      skuComparison,
      totalOrdersDiff: current.totalOrders - previous.totalOrders,
      totalOrdersPercent: previous.totalOrders > 0
        ? (((current.totalOrders - previous.totalOrders) / previous.totalOrders) * 100).toFixed(2)
        : 0,
      totalRevenueDiff: current.totalRevenue - previous.totalRevenue,
      totalRevenuePercent: previous.totalRevenue > 0
        ? (((current.totalRevenue - previous.totalRevenue) / previous.totalRevenue) * 100).toFixed(2)
        : 0
    });
  }

  return { comparisons };
}

/**
 * Format statistics as Telegram message
 * @param {Object} stats - Statistics object
 * @param {Object} comparison - Optional comparison data
 * @returns {string} Formatted message in Markdown
 */
function formatStatisticsMessage(stats, comparison = null) {
  let message = `📊 **Статистика заказов**\n\n`;
  message += `📅 Дата: ${stats.date}\n`;
  message += `⏰ Время: ${stats.startTime} - ${stats.endTime}\n\n`;

  if (stats.totalOrders === 0) {
    message += stats.message || 'Нет данных за указанный период';
    return message;
  }

  // SKU statistics
  const sortedSkus = Object.keys(stats.skuStats).sort();
  
  sortedSkus.forEach(sku => {
    const skuStats = stats.skuStats[sku];
    message += `**${sku}**\n`;
    message += `  • Заказов: ${skuStats.totalOrders}\n`;
    message += `  • Отмен: ${skuStats.cancellations}\n`;
    message += `  • Средняя цена: ${skuStats.avgPrice.toFixed(2)} ₽\n`;
    message += `  • Сумма: ${skuStats.totalRevenue.toFixed(2)} ₽\n`;
    
    if (comparison && comparison.skuComparison && comparison.skuComparison[sku]) {
      const comp = comparison.skuComparison[sku];
      const ordersIcon = comp.ordersDiff > 0 ? '📈' : comp.ordersDiff < 0 ? '📉' : '➡️';
      message += `  ${ordersIcon} Изменение: ${comp.ordersDiff > 0 ? '+' : ''}${comp.ordersDiff} (${comp.ordersPercent > 0 ? '+' : ''}${comp.ordersPercent}%)\n`;
    }
    
    message += `\n`;
  });

  // Totals
  message += `**ИТОГО:**\n`;
  message += `  • Всего заказов: ${stats.totalOrders}\n`;
  message += `  • Всего отмен: ${stats.totalCancellations}\n`;
  message += `  • Общая сумма: ${stats.totalRevenue.toFixed(2)} ₽\n`;

  if (comparison) {
    const ordersIcon = comparison.totalOrdersDiff > 0 ? '📈' : comparison.totalOrdersDiff < 0 ? '📉' : '➡️';
    message += `  ${ordersIcon} Изменение заказов: ${comparison.totalOrdersDiff > 0 ? '+' : ''}${comparison.totalOrdersDiff} (${comparison.totalOrdersPercent > 0 ? '+' : ''}${comparison.totalOrdersPercent}%)\n`;
  }

  return message;
}

// Export for n8n Code node
module.exports = {
  calculateStatistics,
  filterRecordsByDateTime,
  compareStatistics,
  formatStatisticsMessage
};

// For direct usage in n8n Code node:
// const records = JSON.parse($json.datasetJson).records;
// const stats = calculateStatistics(records, $json.date, $json.startTime, $json.endTime);
// const message = formatStatisticsMessage(stats);
// return [{ json: { chat_id: $json.chat_id, text: message, parse_mode: 'Markdown' } }];
