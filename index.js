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
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const DATABASE_URL = process.env.DATABASE_URL;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!BOT_TOKEN || !CHAT_ID) {
  console.error('❌ Заповніть BOT_TOKEN та CHAT_ID в .env');
  console.error('   Щоб дізнатись CHAT_ID, запустіть: node get-chat-id.js');
  process.exit(1);
}

// PostgreSQL connection
const pool = new Pool({
  connectionString: DATABASE_URL,
});

// Passport configuration
passport.use(new GoogleStrategy({
  clientID: GOOGLE_CLIENT_ID,
  clientSecret: GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.CALLBACK_URL,
  passReqToCallback: true
}, (req, accessToken, refreshToken, profile, done) => {
  return done(null, profile);
}));

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

// Fallback to JSON file if no DATABASE_URL
const REMINDERS_FILE = path.join(__dirname, 'reminders.json');
const useDatabase = !!DATABASE_URL;
console.log(`🗄️ Використовується ${useDatabase ? 'база даних (PostgreSQL)' : 'JSON файл'} для зберігання нагадувань`);

// Initialize database
async function initDatabase() {
  if (!useDatabase) return;

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reminders (
        id VARCHAR(255) PRIMARY KEY,
        times TEXT[] NOT NULL,
        message TEXT,
        days INTEGER[] NOT NULL,
        interval_value INTEGER DEFAULT 0,
        interval_type VARCHAR(20) DEFAULT 'week',
        start_date DATE DEFAULT CURRENT_DATE,
        end_date DATE,
        type VARCHAR(20) DEFAULT 'telegram',
        webhook_url TEXT,
        target_url TEXT,
        mail_count INTEGER DEFAULT 1
      )
    `);
    console.log('✅ Таблиця reminders створена або вже існує');

    // Migration: add missing columns for old database schema
    const migrations = [
      { column: 'times', type: 'TEXT[]' },
      { column: 'interval_value', type: 'INTEGER DEFAULT 0' },
      { column: 'interval_type', type: 'VARCHAR(20) DEFAULT \'week\'' },
      { column: 'start_date', type: 'DATE DEFAULT CURRENT_DATE' },
      { column: 'end_date', type: 'DATE' },
      { column: 'type', type: 'VARCHAR(20) DEFAULT \'telegram\'' },
      { column: 'webhook_url', type: 'TEXT' },
      { column: 'target_url', type: 'TEXT' },
      { column: 'mail_count', type: 'INTEGER DEFAULT 1' }
    ];

    for (const migration of migrations) {
      try {
        await pool.query(`ALTER TABLE reminders ADD COLUMN IF NOT EXISTS ${migration.column} ${migration.type}`);
        console.log(`✅ Колонка ${migration.column} додана або вже існує`);
      } catch (error) {
        console.log(`ℹ️ Колонка ${migration.column} вже існує або інша проблема:`, error.message);
      }
    }

    // Migration: drop old 'time' column if it exists (conflicts with new 'times' column)
    try {
      await pool.query(`ALTER TABLE reminders DROP COLUMN IF EXISTS time`);
      console.log('✅ Стару колонку time видалено');
    } catch (error) {
      console.log('ℹ️ Колонка time не існує або інша проблема:', error.message);
    }

    const result = await pool.query('SELECT COUNT(*) FROM reminders');
    const count = parseInt(result.rows[0].count);
    console.log(`📊 В базі ${count} нагадувань`);

    if (count === 0) {
      await pool.query(`
        INSERT INTO reminders (id, times, message, days, interval_value, interval_type, start_date, end_date) VALUES
        ('1', ARRAY['10:00'], '🏋️ Час зарядки! Встань і розімнися 💪', ARRAY[1,2,3,4,5], 0, 'week', CURRENT_DATE, NULL),
        ('2', ARRAY['13:00'], '🧘 Пора розім''ятись! Зроби кілька вправ 🤸', ARRAY[1,2,3,4,5], 0, 'week', CURRENT_DATE, NULL),
        ('3', ARRAY['16:00'], '🏃 Перерва на зарядку! Твоє тіло скаже дяку 🙏', ARRAY[1,2,3,4,5], 0, 'week', CURRENT_DATE, NULL)
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
      const result = await pool.query('SELECT * FROM reminders ORDER BY id');
      return result.rows.map(row => ({
        id: row.id,
        times: row.times || ['10:00'],
        message: row.message,
        days: row.days,
        interval_value: row.interval_value || 0,
        interval_type: row.interval_type || 'week',
        start_date: row.start_date || new Date().toISOString().split('T')[0],
        end_date: row.end_date,
        type: row.type || 'telegram',
        webhook_url: row.webhook_url,
        target_url: row.target_url,
        mail_count: row.mail_count || 1
      }));
    } catch (error) {
      console.error('❌ Помилка завантаження з бази:', error);
      return [];
    }
  } else {
    try {
      const data = await fs.readFile(REMINDERS_FILE, 'utf8');
      const reminders = JSON.parse(data);
      // Міграція старих даних з time на times
      return reminders.map(r => ({
        ...r,
        times: r.times || (r.time ? [r.time] : ['10:00']),
        type: r.type || 'telegram',
        webhook_url: r.webhook_url,
        target_url: r.target_url,
        mail_count: r.mail_count || 1,
        start_date: r.start_date || new Date().toISOString().split('T')[0]
      }));
    } catch {
      const defaults = [
        { id: '1', times: ['10:00'], message: defaultMessages[0], days: [1, 2, 3, 4, 5], interval_value: 0, interval_type: 'week', start_date: new Date().toISOString().split('T')[0], end_date: null, type: 'telegram' },
        { id: '2', times: ['13:00'], message: defaultMessages[1], days: [1, 2, 3, 4, 5], interval_value: 0, interval_type: 'week', start_date: new Date().toISOString().split('T')[0], end_date: null, type: 'telegram' },
        { id: '3', times: ['16:00'], message: defaultMessages[2], days: [1, 2, 3, 4, 5], interval_value: 0, interval_type: 'week', start_date: new Date().toISOString().split('T')[0], end_date: null, type: 'telegram' },
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
          'INSERT INTO reminders (id, times, message, days, interval_value, interval_type, start_date, end_date, type, webhook_url, target_url, mail_count) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
          [reminder.id, reminder.times || ['10:00'], reminder.message, reminder.days, reminder.interval_value || 0, reminder.interval_type || 'week', reminder.start_date || new Date().toISOString().split('T')[0], reminder.end_date || null, reminder.type || 'telegram', reminder.webhook_url || null, reminder.target_url || null, reminder.mail_count || 1]
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

  // Не створювати локальні jobs якщо використовується cron-job.org
  const useCronJob = process.env.USE_CRON_JOB === 'true' || process.env.RENDER;
  if (useCronJob) {
    console.log('⏰ Використовуємо cron-job.org, локальні jobs не створюються');
    return;
  }

  // Зупинити всі існуючі jobs
  if (currentJobs) {
    currentJobs.forEach(job => {
      if (job) job.cancel();
    });
  }
  currentJobs = [];

  // Створити job для кожного часу в кожному нагадуванні
  reminders.forEach(reminder => {
    const times = reminder.times || ['10:00'];
    const days = reminder.days || [1, 2, 3, 4, 5];

    times.forEach(time => {
      const [hours, minutes] = time.split(':');

      const job = schedule.scheduleJob({
        hour: parseInt(hours),
        minute: parseInt(minutes),
        dayOfWeek: days,
        tz: 'Europe/Kyiv'
      }, async () => {
        if (reminder.type === 'webhook' && reminder.webhook_url) {
          console.log(`📨 Надсилаю webhook (${time}): ${reminder.webhook_url}`);
          try {
            await fetch(reminder.webhook_url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                target_url: reminder.target_url,
                mail_count: reminder.mail_count || 1
              })
            });
            console.log(`✅ Webhook відправлено успішно`);
          } catch (error) {
            console.error(`❌ Помилка відправки webhook:`, error.message);
          }
        } else {
          const msg = reminder.message || defaultMessages[Math.floor(Math.random() * defaultMessages.length)];
          console.log(`📨 Надсилаю (${time}): ${msg}`);
          await sendTelegramMessage(msg);
        }
      });

      currentJobs.push(job);
    });
  });

  console.log(`📅 Оновлено розклад: ${reminders.map(r => (r.times || ['10:00']).join(', ')).join(', ')}`);
}

let currentJobs = [];

// Зберігання часу останнього відправлення для запобігання дублюванню та інтервалів
const lastSentTimes = new Map();

// Express сервер
const app = express();
const PORT = process.env.PORT || 3000;

// Session middleware
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: false, // Temporarily disable for debugging
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(express.json());

// Authentication middleware - only allow vitala8896@gmail.com
const requireAuth = (req, res, next) => {
  console.log('Auth check:', req.isAuthenticated(), req.user?.emails?.[0]?.value);
  if (!req.isAuthenticated()) {
    console.log('Redirecting to login page');
    return res.redirect('/login');
  }

  if (req.user.emails && req.user.emails[0] && req.user.emails[0].value === 'vitala8896@gmail.com') {
    console.log('Auth successful for vitala8896@gmail.com');
    return next();
  }

  console.log('Access denied for:', req.user?.emails?.[0]?.value);
  return res.redirect('/access-denied');
};

// Login page (no authentication required)
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Main page with authentication
app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Access denied page
app.get('/access-denied', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'access-denied.html'));
});

// Google OAuth routes
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/access-denied' }),
  (req, res) => {
    console.log('Google OAuth callback successful, user:', req.user?.emails?.[0]?.value);
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
      }
      res.redirect('/');
    });
  }
);

// Logout route
app.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) { return next(err); }
    res.redirect('/auth/google');
  });
});

// API: отримати всі нагадування
app.get('/api/reminders', requireAuth, async (req, res) => {
  const reminders = await loadReminders();
  res.json(reminders);
});

// API: додати нагадування
app.post('/api/reminders', requireAuth, async (req, res) => {
  console.log('📝 Створення нового нагадування:', req.body);
  const { times, type, message, webhook_url, target_url, mail_count, days, interval_value, interval_type, start_date, end_date } = req.body;
  const reminders = await loadReminders();

  const newReminder = {
    id: Date.now().toString(),
    times: times && times.length > 0 ? times : ['10:00'],
    type: type || 'telegram',
    message: message || defaultMessages[Math.floor(Math.random() * defaultMessages.length)],
    webhook_url: webhook_url || null,
    target_url: target_url || null,
    mail_count: mail_count || 1,
    days: days || [1, 2, 3, 4, 5],
    interval_value: interval_value || 0,
    interval_type: interval_type || 'week',
    start_date: start_date || new Date().toISOString().split('T')[0],
    end_date: end_date || null
  };

  console.log('📝 Нове нагадування:', newReminder);
  reminders.push(newReminder);
  await saveReminders(reminders);
  await updateCronSchedule();

  console.log('✅ Нагадування створено, загальна кількість:', reminders.length);
  res.json(newReminder);
});

// API: видалити нагадування
app.delete('/api/reminders/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const reminders = await loadReminders();
  const filtered = reminders.filter(r => r.id !== id);

  await saveReminders(filtered);
  await updateCronSchedule();

  res.json({ success: true });
});

// API: оновити нагадування
app.put('/api/reminders/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { times, type, message, webhook_url, target_url, mail_count, days, interval_value, interval_type, start_date, end_date } = req.body;
  const reminders = await loadReminders();

  const index = reminders.findIndex(r => r.id === id);
  if (index === -1) {
    res.status(404).json({ error: 'Reminder not found' });
    return;
  }

  reminders[index] = {
    ...reminders[index],
    times: times && times.length > 0 ? times : reminders[index].times,
    type: type || reminders[index].type,
    message: message || reminders[index].message,
    webhook_url: webhook_url !== undefined ? webhook_url : reminders[index].webhook_url,
    target_url: target_url !== undefined ? target_url : reminders[index].target_url,
    mail_count: mail_count !== undefined ? mail_count : reminders[index].mail_count,
    days: days || reminders[index].days,
    interval_value: interval_value !== undefined ? interval_value : reminders[index].interval_value,
    interval_type: interval_type || reminders[index].interval_type,
    start_date: start_date || reminders[index].start_date,
    end_date: end_date !== undefined ? end_date : reminders[index].end_date
  };

  await saveReminders(reminders);
  await updateCronSchedule();

  res.json(reminders[index]);
});

// API: отримати дані користувача
app.get('/api/user', (req, res) => {
  if (req.isAuthenticated() && req.user) {
    res.json(req.user);
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// Endpoint для cron-job.org
app.get('/send-reminder', async (req, res) => {
  const reminders = await loadReminders();

  // Отримати час в Europe/Kyiv
  const now = new Date();
  const options = { timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit', hour12: false };
  const currentTime = new Intl.DateTimeFormat('en-US', options).format(now);

  // День тижня (1=Пн, 7=Нд)
  const kievDate = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));
  const currentDay = kievDate.getDay() || 7;

  // Поточна дата в форматі YYYY-MM-DD
  const currentDate = kievDate.toISOString().split('T')[0];

  console.log(`🔍 [Cron trigger] Перевірка: час=${currentTime}, день=${currentDay}, дата=${currentDate}, нагадувань=${reminders.length}`);

  const matchingReminders = reminders.filter(r => {
    // Перевірка часу та дня тижня (тепер times - це масив)
    if (!r.times || !r.times.includes(currentTime) || !r.days.includes(currentDay)) {
      return false;
    }

    // Перевірка start_date
    if (r.start_date && currentDate < r.start_date) {
      console.log(`⏭️ [Cron trigger] Пропускаю (${r.times.join(', ')}): ще не настав start_date (${r.start_date})`);
      return false;
    }

    // Перевірка end_date
    if (r.end_date && currentDate > r.end_date) {
      console.log(`⏭️ [Cron trigger] Пропускаю (${r.times.join(', ')}): вже минув end_date (${r.end_date})`);
      return false;
    }

    // Перевірка інтервалу
    if (r.interval_value > 0) {
      const key = `${r.id}-${currentTime}`;
      const lastSent = lastSentTimes.get(key);
      const startDate = new Date(r.start_date + 'T00:00:00');

      // Визначаємо базову дату для розрахунку інтервалу
      const baseDate = lastSent ? new Date(lastSent) : startDate;
      let intervalMs;

      switch (r.interval_type) {
        case 'week':
          intervalMs = r.interval_value * 7 * 24 * 60 * 60 * 1000;
          break;
        case 'month':
          intervalMs = r.interval_value * 30 * 24 * 60 * 60 * 1000;
          break;
        case 'year':
          intervalMs = r.interval_value * 365 * 24 * 60 * 60 * 1000;
          break;
        default:
          intervalMs = r.interval_value * 7 * 24 * 60 * 60 * 1000;
      }

      if (now - baseDate < intervalMs) {
        console.log(`⏭️ [Cron trigger] Пропускаю (${r.times.join(', ')}): інтервал ще не минув (${r.interval_value} ${r.interval_type})`);
        return false;
      }
    }

    return true;
  });

  console.log(`🔍 [Cron trigger] Знайдено співпадінь: ${matchingReminders.length}`);

  if (matchingReminders.length > 0) {
    let sentCount = 0;
    for (const reminder of matchingReminders) {
      const key = `${reminder.id}-${currentTime}`;
      const lastSent = lastSentTimes.get(key);

      // Перевірка: чи минула хоча б хвилина з останнього відправлення (для запобігання дублюванню)
      if (lastSent && (now - lastSent) < 60000) {
        console.log(`⏭️ [Cron trigger] Пропускаю (${reminder.times.join(', ')}): вже відправлено ${(now - lastSent) / 1000}с тому`);
        continue;
      }

      if (reminder.type === 'webhook' && reminder.webhook_url) {
        console.log(`📨 [Cron trigger] Надсилаю webhook (${reminder.times.join(', ')}): ${reminder.webhook_url}`);
        try {
          await fetch(reminder.webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              target_url: reminder.target_url,
              mail_count: reminder.mail_count || 1
            })
          });
          console.log(`✅ [Cron trigger] Webhook відправлено успішно`);
        } catch (error) {
          console.error(`❌ [Cron trigger] Помилка відправки webhook:`, error.message);
        }
      } else {
        const msg = reminder.message || defaultMessages[Math.floor(Math.random() * defaultMessages.length)];
        console.log(`📨 [Cron trigger] Надсилаю (${reminder.times.join(', ')}): ${msg}`);
        await sendTelegramMessage(msg);
      }
      lastSentTimes.set(key, now);
      sentCount++;
    }
    res.send(`✅ Sent ${sentCount} reminders`);
  } else {
    res.send(`✅ No reminders for this time (${currentTime}, day ${currentDay})`);
  }
});

// Запуск
app.listen(PORT, async () => {
  console.log('');
  console.log('🔔 Нагадування про зарядку запущено!');
  await initDatabase();

  // Використовувати node-schedule тільки локально, на Render - cron-job.org
  const useCronJob = process.env.USE_CRON_JOB === 'true' || process.env.RENDER;
  if (!useCronJob) {
    await updateCronSchedule();
  } else {
    console.log('⏰ Використовуємо cron-job.org для нагадувань');
  }

  console.log(`🌐 UI: http://localhost:${PORT}`);
  console.log('⏳ Чекаю на наступний час...');
  console.log('');
});
