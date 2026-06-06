/**
 * Нагадування про зарядку в Telegram
 * Розклад: кожні 3 години з 10:00 до 18:00 (10:00, 13:00, 16:00)
 * 
 * Запуск: node index.js
 */

const cron = require('node-cron');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

if (!BOT_TOKEN || !CHAT_ID) {
  console.error('❌ Заповніть BOT_TOKEN та CHAT_ID в .env');
  console.error('   Щоб дізнатись CHAT_ID, запустіть: node get-chat-id.js');
  process.exit(1);
}

const messages = [
  '🏋️ Час зарядки! Встань і розімнися 💪',
  '🧘 Пора розім\'ятись! Зроби кілька вправ 🤸',
  '🏃 Перерва на зарядку! Твоє тіло скаже дякую 🙏',
  '💪 Час руху! Зроби розминку прямо зараз 🔥',
  '🌟 Нагадування: зарядка! Розімни спину та шию 🧘',
  '⚡ Енергія на нулі? Зарядка допоможе! Вперед! 🚀',
];

function getRandomMessage() {
  return messages[Math.floor(Math.random() * messages.length)];
}

async function sendTelegramMessage(text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: text,
        parse_mode: 'HTML',
      }),
    });

    const data = await response.json();

    if (data.ok) {
      console.log(`✅ [${new Date().toLocaleTimeString('uk-UA')}] Повідомлення надіслано`);
    } else {
      console.error(`❌ Помилка: ${data.description}`);
    }
  } catch (error) {
    console.error(`❌ Помилка з'єднання: ${error.message}`);
  }
}

// Розклад: о 10:00, 13:00, 16:00 (кожні 3 години з 10 до 18, не включаючи 19+)
// Cron: хвилина=0, години=10,13,16, кожен день
cron.schedule('0 10,13,16 * * *', () => {
  const msg = getRandomMessage();
  console.log(`📨 Надсилаю: ${msg}`);
  sendTelegramMessage(msg);
}, {
  timezone: 'Europe/Kyiv',
});

console.log('');
console.log('🔔 Нагадування про зарядку запущено!');
console.log('📅 Розклад: 10:00, 13:00, 16:00 (Europe/Kyiv)');
console.log('⏳ Чекаю на наступний час...');
console.log('');
