import { TelegramWildcardBot } from './bot.js';

export default {
  async fetch(request, env, ctx) {
    // Hanya izinkan POST
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // Ambil update dari request body
    let update;
    try {
      update = await request.json();
    } catch {
      return new Response('Bad Request', { status: 400 });
    }

    // Ambil semua environment variables
    const TELEGRAM_TOKEN = env.TELEGRAM_TOKEN;
    const OWNER_ID = Number(env.OWNER_ID);

    const CONFIG = {
      accountID: env.ACCOUNT_ID,
      zoneID: env.ZONE_ID,
      apiKey: env.API_KEY,
      apiEmail: env.API_EMAIL,
      serviceName: env.SERVICE_NAME || 'siren',
    };

    // Inisialisasi bot dengan token, endpoint, owner, dan konfigurasi cloudflare
    const bot = new TelegramWildcardBot(
      TELEGRAM_TOKEN,
      'https://api.telegram.org',
      OWNER_ID,
      CONFIG
    );

    // Tangani update dari webhook
    return bot.handleUpdate(update);
  }
};
