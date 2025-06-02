// worker.js
import { handleTelegramUpdate } from './bot.js';

export default {
  async fetch(request, env) {
    if (request.method === 'POST') {
      let update;
      try {
        update = await request.json();
      } catch {
        return new Response('Invalid JSON', { status: 400 });
      }
      return handleTelegramUpdate(env, update);
    }

    return new Response('Hello from Telegram Wildcard Bot!', { status: 200 });
  }
}
