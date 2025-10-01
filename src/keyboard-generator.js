/**
 * Telegram Keyboard Generator
 * Creates inline keyboards for bot menus
 */

/**
 * Generate main menu keyboard
 * @param {boolean} isAdmin - Whether user is admin
 * @returns {Object} Inline keyboard markup
 */
function generateMainMenuKeyboard(isAdmin = false) {
  const keyboard = {
    inline_keyboard: [
      [{ text: '📦 Заказы', callback_data: 'menu:orders' }],
      [{ text: '🎯 Кластеры', callback_data: 'menu:clusters' }]
    ]
  };

  // Add admin button if user is admin
  if (isAdmin) {
    keyboard.inline_keyboard.push([{ text: '⚙️ Админка', callback_data: 'menu:admin' }]);
  }

  return keyboard;
}

/**
 * Generate date selection keyboard
 * @param {Array<string>} availableDates - Array of dates in YYYY-MM-DD format
 * @param {Array<string>} selectedDates - Already selected dates
 * @returns {Object} Inline keyboard markup
 */
function generateDateSelectionKeyboard(availableDates, selectedDates = []) {
  const keyboard = { inline_keyboard: [] };
  let row = [];

  availableDates.forEach((date, idx) => {
    const isSelected = selectedDates.includes(date);
    const prefix = isSelected ? '✅ ' : '';
    
    row.push({ 
      text: `${prefix}${date}`, 
      callback_data: `date:${isSelected ? 'unselect' : 'select'}:${date}` 
    });
    
    // 3 dates per row
    if ((idx + 1) % 3 === 0 || idx === availableDates.length - 1) {
      keyboard.inline_keyboard.push(row);
      row = [];
    }
  });

  // Add action buttons
  if (selectedDates.length > 0) {
    keyboard.inline_keyboard.push([
      { text: '✅ Продолжить', callback_data: 'date:confirm' }
    ]);
  }

  keyboard.inline_keyboard.push([
    { text: '« Назад в меню', callback_data: 'back_to_menu' }
  ]);

  return keyboard;
}

/**
 * Generate time selection keyboard (30-min intervals)
 * @param {string} selectedDate - Selected date
 * @returns {Object} Inline keyboard markup
 */
function generateTimeSelectionKeyboard(selectedDate) {
  const keyboard = { inline_keyboard: [] };

  // Generate time buttons (every 2 hours for compact layout)
  const timeSlots = [
    '00:00', '02:00', '04:00', '06:00',
    '08:00', '10:00', '12:00', '14:00',
    '16:00', '18:00', '20:00', '22:00'
  ];

  let row = [];
  timeSlots.forEach((time, idx) => {
    row.push({ 
      text: time, 
      callback_data: `time:start:${selectedDate}:${time}` 
    });
    
    // 4 times per row
    if ((idx + 1) % 4 === 0) {
      keyboard.inline_keyboard.push(row);
      row = [];
    }
  });

  if (row.length > 0) {
    keyboard.inline_keyboard.push(row);
  }

  // Add preset options
  keyboard.inline_keyboard.push([
    { text: '🌅 Весь день (00:00-23:59)', callback_data: `time:preset:${selectedDate}:00:00:23:59` }
  ]);
  
  keyboard.inline_keyboard.push([
    { text: '🌄 Утро (06:00-12:00)', callback_data: `time:preset:${selectedDate}:06:00:12:00` },
    { text: '🌆 День (12:00-18:00)', callback_data: `time:preset:${selectedDate}:12:00:18:00` }
  ]);
  
  keyboard.inline_keyboard.push([
    { text: '🌃 Вечер (18:00-23:59)', callback_data: `time:preset:${selectedDate}:18:00:23:59` },
    { text: '🌙 Ночь (00:00-06:00)', callback_data: `time:preset:${selectedDate}:00:00:06:00` }
  ]);

  keyboard.inline_keyboard.push([
    { text: '« Назад к датам', callback_data: 'back_to_dates' },
    { text: '« Меню', callback_data: 'back_to_menu' }
  ]);

  return keyboard;
}

/**
 * Generate end time selection keyboard
 * @param {string} selectedDate - Selected date
 * @param {string} startTime - Start time HH:MM
 * @returns {Object} Inline keyboard markup
 */
function generateEndTimeKeyboard(selectedDate, startTime) {
  const keyboard = { inline_keyboard: [] };
  
  // Parse start time
  const [startHour, startMin] = startTime.split(':').map(Number);
  
  // Generate end time options (after start time)
  const endTimeSlots = [];
  for (let hour = startHour; hour < 24; hour++) {
    for (let min = 0; min < 60; min += 30) {
      if (hour === startHour && min <= startMin) continue;
      const timeStr = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
      endTimeSlots.push(timeStr);
    }
  }

  // Show only first 12 options + end of day
  const displaySlots = endTimeSlots.slice(0, 12);
  if (!displaySlots.includes('23:59')) {
    displaySlots.push('23:59');
  }

  let row = [];
  displaySlots.forEach((time, idx) => {
    row.push({ 
      text: time, 
      callback_data: `time:end:${selectedDate}:${startTime}:${time}` 
    });
    
    // 4 times per row
    if ((idx + 1) % 4 === 0) {
      keyboard.inline_keyboard.push(row);
      row = [];
    }
  });

  if (row.length > 0) {
    keyboard.inline_keyboard.push(row);
  }

  keyboard.inline_keyboard.push([
    { text: '« Назад', callback_data: `back_to_time_start:${selectedDate}` }
  ]);

  return keyboard;
}

/**
 * Generate admin menu keyboard
 * @returns {Object} Inline keyboard markup
 */
function generateAdminMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '👥 Управление пользователями', callback_data: 'admin:users' }],
      [{ text: '👑 Управление админами', callback_data: 'admin:admins' }],
      [{ text: '📊 Статистика использования', callback_data: 'admin:stats' }],
      [{ text: '« Назад в меню', callback_data: 'back_to_menu' }]
    ]
  };
}

/**
 * Generate user management keyboard
 * @param {Array<Object>} users - Array of user objects
 * @param {number} page - Current page number
 * @returns {Object} Inline keyboard markup
 */
function generateUserManagementKeyboard(users, page = 0) {
  const keyboard = { inline_keyboard: [] };
  const pageSize = 5;
  const start = page * pageSize;
  const end = start + pageSize;
  const pageUsers = users.slice(start, end);

  pageUsers.forEach(user => {
    keyboard.inline_keyboard.push([
      { 
        text: `${user.username || user.user_id} - 🗑️ Удалить`, 
        callback_data: `admin:remove_user:${user.user_id}` 
      }
    ]);
  });

  // Pagination
  const navRow = [];
  if (page > 0) {
    navRow.push({ text: '◀️ Назад', callback_data: `admin:users:page:${page - 1}` });
  }
  if (end < users.length) {
    navRow.push({ text: 'Вперед ▶️', callback_data: `admin:users:page:${page + 1}` });
  }
  if (navRow.length > 0) {
    keyboard.inline_keyboard.push(navRow);
  }

  keyboard.inline_keyboard.push([
    { text: '➕ Добавить пользователя', callback_data: 'admin:add_user' }
  ]);

  keyboard.inline_keyboard.push([
    { text: '« Назад в админку', callback_data: 'menu:admin' }
  ]);

  return keyboard;
}

/**
 * Generate back to menu button
 * @returns {Object} Inline keyboard markup
 */
function generateBackToMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '« Назад в меню', callback_data: 'back_to_menu' }]
    ]
  };
}

// Export for n8n Code node
module.exports = {
  generateMainMenuKeyboard,
  generateDateSelectionKeyboard,
  generateTimeSelectionKeyboard,
  generateEndTimeKeyboard,
  generateAdminMenuKeyboard,
  generateUserManagementKeyboard,
  generateBackToMenuKeyboard
};

// For direct usage in n8n Code node:
// const keyboard = generateMainMenuKeyboard($json.is_admin);
// return [{ json: { 
//   chat_id: $json.chat_id, 
//   text: 'Welcome!', 
//   reply_markup: keyboard 
// } }];
