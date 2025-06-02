import { TelegramWildcardBot } from './bot.js';

const TELEGRAM_BOT_TOKEN = TWIG_ENV.TELEGRAM_BOT_TOKEN || '';
const OWNER_ID = Number(TWIG_ENV.OWNER_ID || 0);

const bot = new TelegramWildcardBot(TELEGRAM_BOT_TOKEN, undefined, OWNER_ID);

export default {
  async fetch(request) {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    try {
      const update = await request.json();
      return await bot.handleUpdate(update);
    } catch (e) {
      return new Response('Bad Request', { status: 400 });
    }
  }
};
