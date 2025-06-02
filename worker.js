import { TelegramWildcardBot } from './bot.js';

const TELEGRAM_TOKEN = __STATIC_CONTENT.get('TELEGRAM_TOKEN'); // disimpan di secret wrangler
const OWNER_ID = Number(__STATIC_CONTENT.get('OWNER_ID'));
const CONFIG = {
  accountID: __STATIC_CONTENT.get('ACCOUNT_ID'),
  zoneID: __STATIC_CONTENT.get('ZONE_ID'),
  apiKey: __STATIC_CONTENT.get('API_KEY'),
  apiEmail: __STATIC_CONTENT.get('API_EMAIL'),
  serviceName: __STATIC_CONTENT.get('SERVICE_NAME') || 'siren',
};

const bot = new TelegramWildcardBot(TELEGRAM_TOKEN, 'https://api.telegram.org', OWNER_ID, CONFIG);

export default {
  async fetch(request) {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    let update;
    try {
      update = await request.json();
    } catch {
      return new Response('Bad Request', { status: 400 });
    }

    return bot.handleUpdate(update);
  }
};
