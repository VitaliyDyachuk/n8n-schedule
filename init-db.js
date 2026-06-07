const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function initDatabase() {
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
    
    // Перевірити чи є дані, якщо ні - додати дефолтні
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
    throw error;
  } finally {
    await pool.end();
  }
}

initDatabase();
