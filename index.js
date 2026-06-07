/**
 * Нагадування про зарядку в Telegram
 * Розклад: кожні 3 години з 10:00 до 18:00 (10:00, 13:00, 16:00)
 * 
 * Запуск: node index.js
 */

const schedule = require('node-schedule');
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

if (!BOT_TOKEN || !CHAT_ID) {
  console.error('❌ Заповніть BOT_TOKEN та CHAT_ID в .env');
  console.error('   Щоб дізнатись CHAT_ID, запустіть: node get-chat-id.js');
  process.exit(1);
}

const REMINDERS_FILE = path.join(__dirname, 'reminders.json');
const defaultMessages = [
  '🏋️ Час зарядки! Встань і розімнися 💪',
  '🧘 Пора розім\'ятись! Зроби кілька вправ 🤸',
  '🏃 Перерва на зарядку! Твоє тіло скаже дякую 🙏',
  '💪 Час руху! Зроби розминку прямо зараз 🔥',
  '🌟 Нагадування: зарядка! Розімни спину та шию 🧘',
  '⚡ Енергія на нулі? Зарядка допоможе! Вперед! 🚀',
];

async function loadReminders() {
  try {
    const data = await fs.readFile(REMINDERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    const defaults = [
      { id: '1', time: '10:00', message: defaultMessages[0] },
      { id: '2', time: '13:00', message: defaultMessages[1] },
      { id: '3', time: '16:00', message: defaultMessages[2] },
    ];
    await saveReminders(defaults);
    return defaults;
  }
}

async function saveReminders(reminders) {
  await fs.writeFile(REMINDERS_FILE, JSON.stringify(reminders, null, 2));
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

// Динамічний розклад з файлу
async function updateCronSchedule() {
  const reminders = await loadReminders();

  // Зупинити всі існуючі jobs
  if (currentJobs) {
    currentJobs.forEach(job => job.cancel());
  }
  currentJobs = [];

  // Створити job для кожного нагадування
  reminders.forEach(reminder => {
    const [hours, minutes] = reminder.time.split(':');

    const job = schedule.scheduleJob({
      hour: parseInt(hours),
      minute: parseInt(minutes),
      tz: 'Europe/Kyiv'
    }, async () => {
      const msg = reminder.message || defaultMessages[Math.floor(Math.random() * defaultMessages.length)];
      console.log(`📨 Надсилаю (${reminder.time}): ${msg}`);
      await sendTelegramMessage(msg);
    });

    currentJobs.push(job);
  });

  console.log(`📅 Оновлено розклад: ${reminders.map(r => r.time).join(', ')}`);
}

let currentJobs = [];

// Express сервер
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API: отримати всі нагадування
app.get('/api/reminders', async (req, res) => {
  const reminders = await loadReminders();
  res.json(reminders);
});

// API: додати нагадування
app.post('/api/reminders', async (req, res) => {
  const { time, message } = req.body;
  const reminders = await loadReminders();

  const newReminder = {
    id: Date.now().toString(),
    time,
    message: message || defaultMessages[Math.floor(Math.random() * defaultMessages.length)]
  };

  reminders.push(newReminder);
  await saveReminders(reminders);
  await updateCronSchedule();

  res.json(newReminder);
});

// API: видалити нагадування
app.delete('/api/reminders/:id', async (req, res) => {
  const { id } = req.params;
  const reminders = await loadReminders();
  const filtered = reminders.filter(r => r.id !== id);

  await saveReminders(filtered);
  await updateCronSchedule();

  res.json({ success: true });
});

// Endpoint для cron-job.org
app.get('/send-reminder', async (req, res) => {
  const reminders = await loadReminders();
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:00`;

  const reminder = reminders.find(r => r.time === currentTime);
  const msg = reminder?.message || defaultMessages[Math.floor(Math.random() * defaultMessages.length)];

  console.log(`📨 [Cron trigger] Надсилаю: ${msg}`);
  await sendTelegramMessage(msg);
  res.send('✅ Reminder sent');
});

// Запуск
app.listen(PORT, async () => {
  console.log('');
  console.log('🔔 Нагадування про зарядку запущено!');
  await updateCronSchedule();
  console.log(`🌐 UI: http://localhost:${PORT}`);
  console.log('⏳ Чекаю на наступний час...');
  console.log('');
});
