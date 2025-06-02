import { TelegramWildcardBot } from './bot.js';

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    let update;
    try {
      update = await request.json();
    } catch {
      return new Response('Bad Request', { status: 400 });
    }

    const TELEGRAM_TOKEN = env.TELEGRAM_TOKEN;
    const OWNER_ID = Number(env.OWNER_ID);
    const CONFIG = {
      accountID: env.ACCOUNT_ID,
      zoneID: env.ZONE_ID,
      apiKey: env.API_KEY,
      apiEmail: env.API_EMAIL,
      serviceName: env.SERVICE_NAME || 'siren',
    };

    const bot = new TelegramWildcardBot(
      TELEGRAM_TOKEN,
      'https://api.telegram.org',
      OWNER_ID,
      CONFIG
    );

    return bot.handleUpdate(update);
  }
};
