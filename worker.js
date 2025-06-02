import { TelegramWildcardBot } from './bot.js';

export default {
  async fetch(request, env, ctx) {
    // Hanya izinkan metode POST (Telegram webhook)
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // Ambil update JSON dari request body
    let update;
    try {
      update = await request.json();
    } catch {
      return new Response('Bad Request', { status: 400 });
    }

    // Ambil environment variables dari Cloudflare Worker env
    const TELEGRAM_TOKEN = env.TELEGRAM_TOKEN;
    const OWNER_ID = Number(env.OWNER_ID);

    const CONFIG = {
      accountID: env.ACCOUNT_ID,
      zoneID: env.ZONE_ID,
      apiKey: env.API_KEY,
      apiEmail: env.API_EMAIL,
      serviceName: env.SERVICE_NAME || 'siren',
    };

    // Buat instance bot
    const bot = new TelegramWildcardBot(
      TELEGRAM_TOKEN,
      'https://api.telegram.org',  // Pastikan tanpa /bot di sini
      OWNER_ID,
      CONFIG
    );

    // Tangani update webhook
    return bot.handleUpdate(update);
  }
};
