/**
 * Утиліта для визначення CHAT_ID.
 * 
 * 1. Напишіть будь-яке повідомлення вашому боту в Telegram
 * 2. Запустіть цей скрипт: node get-chat-id.js
 * 3. Скопіюйте CHAT_ID з виводу і вставте в .env
 */

require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN не знайдено в .env');
  process.exit(1);
}

async function getChatId() {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data.ok) {
      console.error('❌ Помилка API:', data.description);
      return;
    }
    
    if (data.result.length === 0) {
      console.log('⚠️  Немає повідомлень. Напишіть щось боту в Telegram і запустіть скрипт знову.');
      return;
    }
    
    const chats = new Map();
    for (const update of data.result) {
      const msg = update.message || update.channel_post;
      if (msg && msg.chat) {
        chats.set(msg.chat.id, {
          id: msg.chat.id,
          type: msg.chat.type,
          name: msg.chat.first_name || msg.chat.title || msg.chat.username || 'N/A',
        });
      }
    }
    
    if (chats.size === 0) {
      console.log('⚠️  Не вдалося знайти чати. Напишіть щось боту в Telegram і спробуйте знову.');
      return;
    }
    
    console.log('\n✅ Знайдені чати:\n');
    console.log('┌─────────────────┬──────────┬─────────────────┐');
    console.log('│    CHAT_ID      │   Тип    │      Ім\'я       │');
    console.log('├─────────────────┼──────────┼─────────────────┤');
    for (const chat of chats.values()) {
      const id = String(chat.id).padEnd(15);
      const type = chat.type.padEnd(8);
      const name = chat.name.substring(0, 15).padEnd(15);
      console.log(`│ ${id} │ ${type} │ ${name} │`);
    }
    console.log('└─────────────────┴──────────┴─────────────────┘');
    console.log('\n📋 Скопіюйте потрібний CHAT_ID і додайте в .env:');
    console.log(`   CHAT_ID=${[...chats.values()][0].id}\n`);
    
  } catch (error) {
    console.error('❌ Помилка з\'єднання:', error.message);
  }
}

getChatId();
