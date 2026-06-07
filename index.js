/**
 * Нагадування про зарядку в Telegram
 * Розклад: кожні 3 години з 10:00 до 18:00 (10:00, 13:00, 16:00)
 * 
 * Запуск: node index.js
 */

const schedule = require('node-schedule');
const express = require('express');
const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const DATABASE_URL = process.env.DATABASE_URL;

if (!BOT_TOKEN || !CHAT_ID) {
  console.error('❌ Заповніть BOT_TOKEN та CHAT_ID в .env');
  console.error('   Щоб дізнатись CHAT_ID, запустіть: node get-chat-id.js');
  process.exit(1);
}

// PostgreSQL connection
const pool = new Pool({
  connectionString: DATABASE_URL,
});

// Fallback to JSON file if no DATABASE_URL
const REMINDERS_FILE = path.join(__dirname, 'reminders.json');
const useDatabase = !!DATABASE_URL;

// Initialize database
async function initDatabase() {
  if (!useDatabase) return;

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reminders (
        id VARCHAR(255) PRIMARY KEY,
        time VARCHAR(10) NOT NULL,
        message TEXT,
        days INTEGER[] NOT NULL
      )
    `);
    console.log('✅ Таблиця reminders створена або вже існує');

    const result = await pool.query('SELECT COUNT(*) FROM reminders');
    if (parseInt(result.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO reminders (id, time, message, days) VALUES
        ('1', '10:00', '🏋️ Час зарядки! Встань і розімнися 💪', ARRAY[1,2,3,4,5]),
        ('2', '13:00', '🧘 Пора розім''ятись! Зроби кілька вправ 🤸', ARRAY[1,2,3,4,5]),
        ('3', '16:00', '🏃 Перерва на зарядку! Твоє тіло скаже дякую 🙏', ARRAY[1,2,3,4,5])
      `);
      console.log('✅ Дефолтні нагадування додані');
    }
  } catch (error) {
    console.error('❌ Помилка ініціалізації бази даних:', error);
  }
}
const defaultMessages = [
  '🏋️ Час зарядки! Встань і розімнися 💪',
  '🧘 Пора розім\'ятись! Зроби кілька вправ 🤸',
  '🏃 Перерва на зарядку! Твоє тіло скаже дякую 🙏',
  '💪 Час руху! Зроби розминку прямо зараз 🔥',
  '🌟 Нагадування: зарядка! Розімни спину та шию 🧘',
  '⚡ Енергія на нулі? Зарядка допоможе! Вперед! 🚀',
];

async function loadReminders() {
  if (useDatabase) {
    try {
      const result = await pool.query('SELECT * FROM reminders ORDER BY time');
      return result.rows.map(row => ({
        id: row.id,
        time: row.time,
        message: row.message,
        days: row.days
      }));
    } catch (error) {
      console.error('❌ Помилка завантаження з бази:', error);
      return [];
    }
  } else {
    try {
      const data = await fs.readFile(REMINDERS_FILE, 'utf8');
      return JSON.parse(data);
    } catch {
      const defaults = [
        { id: '1', time: '10:00', message: defaultMessages[0], days: [1, 2, 3, 4, 5] },
        { id: '2', time: '13:00', message: defaultMessages[1], days: [1, 2, 3, 4, 5] },
        { id: '3', time: '16:00', message: defaultMessages[2], days: [1, 2, 3, 4, 5] },
      ];
      await saveReminders(defaults);
      return defaults;
    }
  }
}

async function saveReminders(reminders) {
  if (useDatabase) {
    try {
      await pool.query('DELETE FROM reminders');
      for (const reminder of reminders) {
        await pool.query(
          'INSERT INTO reminders (id, time, message, days) VALUES ($1, $2, $3, $4)',
          [reminder.id, reminder.time, reminder.message, reminder.days]
        );
      }
    } catch (error) {
      console.error('❌ Помилка збереження в базу:', error);
    }
  } else {
    await fs.writeFile(REMINDERS_FILE, JSON.stringify(reminders, null, 2));
  }
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
    const days = reminder.days || [1, 2, 3, 4, 5];

    const job = schedule.scheduleJob({
      hour: parseInt(hours),
      minute: parseInt(minutes),
      dayOfWeek: days,
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
  const { time, message, days } = req.body;
  const reminders = await loadReminders();

  const newReminder = {
    id: Date.now().toString(),
    time,
    message: message || defaultMessages[Math.floor(Math.random() * defaultMessages.length)],
    days: days || [1, 2, 3, 4, 5]
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

// API: оновити нагадування
app.put('/api/reminders/:id', async (req, res) => {
  const { id } = req.params;
  const { time, message, days } = req.body;
  const reminders = await loadReminders();

  const index = reminders.findIndex(r => r.id === id);
  if (index === -1) {
    res.status(404).json({ error: 'Reminder not found' });
    return;
  }

  reminders[index] = {
    ...reminders[index],
    time: time || reminders[index].time,
    message: message || reminders[index].message,
    days: days || reminders[index].days
  };

  await saveReminders(reminders);
  await updateCronSchedule();

  res.json(reminders[index]);
});

// Endpoint для cron-job.org
app.get('/send-reminder', async (req, res) => {
  const reminders = await loadReminders();
  const now = new Date();
  const currentDay = now.getDay() || 7; // 1=Пн, 7=Нд
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const matchingReminders = reminders.filter(r =>
    r.time === currentTime && r.days.includes(currentDay)
  );

  if (matchingReminders.length > 0) {
    for (const reminder of matchingReminders) {
      const msg = reminder.message || defaultMessages[Math.floor(Math.random() * defaultMessages.length)];
      console.log(`📨 [Cron trigger] Надсилаю (${reminder.time}): ${msg}`);
      await sendTelegramMessage(msg);
    }
    res.send(`✅ Sent ${matchingReminders.length} reminders`);
  } else {
    res.send('✅ No reminders for this time');
  }
});

// Запуск
app.listen(PORT, async () => {
  console.log('');
  console.log('🔔 Нагадування про зарядку запущено!');
  await initDatabase();
  await updateCronSchedule();
  console.log(`🌐 UI: http://localhost:${PORT}`);
  console.log('⏳ Чекаю на наступний час...');
  console.log('');
});
