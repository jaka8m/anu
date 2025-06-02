import { TelegramWildcardBot } from './bot.js';

const TELEGRAM_TOKEN = TELEGRAM_TOKEN; // dari secrets
const OWNER_ID = Number(OWNER_ID);     // dari secrets

const CONFIG = {
  accountID: ACCOUNT_ID,      // dari secrets
  zoneID: ZONE_ID,            // dari secrets
  apiKey: API_KEY,            // dari secrets
  apiEmail: API_EMAIL,        // dari secrets
  serviceName: SERVICE_NAME || 'siren', // dari secrets
};

const bot = new TelegramWildcardBot(
  TELEGRAM_TOKEN,
  'https://api.telegram.org',
  OWNER_ID,
  CONFIG
);

export default {
  async fetch(request) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    let update;
    try {
      update = await request.json();
    } catch {
      return new Response('Bad Request', { status: 400 });
    }

    return bot.handleUpdate(update);
  }
};
