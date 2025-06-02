import { WildcardBot, TelegramWildcardBot } from './bot.js';

let bot;

export default {
  async fetch(request, env) {
    // Inisialisasi bot hanya sekali saja
    if (!bot) {
      const TELEGRAM_BOT_TOKEN = env.TELEGRAM_BOT_TOKEN || '';
      const OWNER_ID = Number(env.OWNER_ID || 0);
      bot = new TelegramWildcardBot(TELEGRAM_BOT_TOKEN, undefined, OWNER_ID);
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    try {
      const update = await request.json();
      return await bot.handleUpdate(update);
    } catch (e) {
      return new Response('Bad Request', { status: 400 });
    }
  }
};
