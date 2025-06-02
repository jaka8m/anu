// bot.js
// Telegram Wildcard Bot main class & Cloudflare Workers API interaction

const rootDomain = "joss.checker-ip.xyz";

export class TelegramWildcardBot {
  constructor(token, apiUrl, ownerId, cloudflareConfig) {
    this.token = token;
    // Pastikan apiUrl hanya https://api.telegram.org tanpa tambahan /bot
    this.apiUrl = apiUrl || 'https://api.telegram.org';
    this.ownerId = ownerId;

    this.accountID = cloudflareConfig.accountID;
    this.zoneID = cloudflareConfig.zoneID;
    this.apiKey = cloudflareConfig.apiKey;
    this.apiEmail = cloudflareConfig.apiEmail;
    this.serviceName = cloudflareConfig.serviceName;

    this.headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'X-Auth-Email': this.apiEmail,
      'X-Auth-Key': this.apiKey,
      'Content-Type': 'application/json'
    };

    this.handleUpdate = this.handleUpdate.bind(this);
  }

  static escapeMarkdownV2(text) {
    return text.replace(/([_*\[\]()~`>#+=|{}.!\\-])/g, '\\$1');
  }

  async getDomainList() {
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountID}/workers/domains`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) return [];
    const json = await res.json();
    return json.result
      .filter(d => d.service === this.serviceName)
      .map(d => d.hostname);
  }

  async addSubdomain(subdomain) {
    const domain = `${subdomain}.${rootDomain}`.toLowerCase();
    if (!domain.endsWith(rootDomain)) return 400;

    const registeredDomains = await this.getDomainList();
    if (registeredDomains.includes(domain)) return 409;

    try {
      const testUrl = `https://${domain.replace(`.${rootDomain}`, '')}`;
      const domainTest = await fetch(testUrl);
      if (domainTest.status === 530) return 530;
    } catch {
      return 400;
    }

    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountID}/workers/domains`;
    const body = {
      environment: "production",
      hostname: domain,
      service: this.serviceName,
      zone_id: this.zoneID
    };

    const res = await fetch(url, {
      method: 'PUT',
      headers: this.headers,
      body: JSON.stringify(body)
    });

    return res.status;
  }

  async deleteSubdomain(subdomain) {
    const domain = `${subdomain}.${rootDomain}`.toLowerCase();
    const urlList = `https://api.cloudflare.com/client/v4/accounts/${this.accountID}/workers/domains`;

    const listRes = await fetch(urlList, { headers: this.headers });
    if (!listRes.ok) return listRes.status;

    const listJson = await listRes.json();
    const domainObj = listJson.result.find(d => d.hostname === domain);
    if (!domainObj) return 404;

    const urlDelete = `${urlList}/${domainObj.id}`;
    const res = await fetch(urlDelete, {
      method: 'DELETE',
      headers: this.headers
    });

    return res.status;
  }

  async listSubdomains() {
    return this.getDomainList();
  }

  async sendMessage(chatId, text, options = {}) {
    const payload = { chat_id: chatId, text, ...options };
    // Pastikan hanya 1 kali /bot sebelum token
    const response = await fetch(`${this.apiUrl}/bot${this.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    console.log('sendMessage response:', data);
    return data;
  }

  async deleteMessage(chatId, messageId) {
    await fetch(`${this.apiUrl}/bot${this.token}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId })
    });
  }

  async sendDocument(chatId, content, filename, mimeType) {
    const formData = new FormData();
    const blob = new Blob([content], { type: mimeType });
    formData.append('document', blob, filename);
    formData.append('chat_id', chatId.toString());

    const res = await fetch(`${this.apiUrl}/bot${this.token}/sendDocument`, {
      method: 'POST',
      body: formData
    });
    return res.json();
  }

  // Webhook update handler
  async handleUpdate(update) {
    try {
      if (!update.message) return new Response('OK', { status: 200 });

      const chatId = update.message.chat.id;
      const text = update.message.text || '';

      // Unauthorized commands check must be before handling commands
      if ((text.startsWith('/add ') || text.startsWith('/del ')) && chatId !== this.ownerId) {
        await this.sendMessage(chatId, '⛔ You are not authorized to use this command.');
        return new Response('OK', { status: 200 });
      }

      if (text === '/start') {
        const welcomeMessage = `👋 *Welcome to Wildcard Bot*\n\nAvailable commands:\n` +
          `• /add [subdomain]\n• /del [subdomain]\n• /list\n\n` +
          `Example: \`/add mysubdomain\``;
        await this.sendMessage(chatId, welcomeMessage, { parse_mode: 'MarkdownV2' });
      }

      // Handle /add
      else if (text.startsWith('/add ')) {
        const subdomain = text.split(' ')[1]?.trim();
        if (!subdomain) return new Response('OK', { status: 200 });

        let loadingMsgId;
        try {
          const loadingMsg = await this.sendMessage(chatId, '⏳ Adding subdomain, please wait...');
          loadingMsgId = loadingMsg.result?.message_id;
        } catch (err) {
          console.error('Failed to send loading message:', err);
        }

        let status;
        try {
          status = await this.addSubdomain(subdomain);
        } catch (err) {
          console.error('addSubdomain error:', err);
          status = 500;
        }

        const fullDomain = `${subdomain}.${rootDomain}`;

        if (loadingMsgId) {
          try {
            await this.deleteMessage(chatId, loadingMsgId);
          } catch (err) {
            console.error('Failed to delete loading message:', err);
          }
        }

        if (status === 200) {
          await this.sendMessage(chatId, `\`\`\`Wildcard\n${TelegramWildcardBot.escapeMarkdownV2(fullDomain)} added successfully\`\`\``, { parse_mode: 'MarkdownV2' });
        } else if (status === 409) {
          await this.sendMessage(chatId, `⚠️ Subdomain *${TelegramWildcardBot.escapeMarkdownV2(fullDomain)}* already exists.`, { parse_mode: 'MarkdownV2' });
        } else if (status === 530) {
          await this.sendMessage(chatId, `❌ Subdomain *${TelegramWildcardBot.escapeMarkdownV2(fullDomain)}* not active (error 530).`, { parse_mode: 'MarkdownV2' });
        } else {
          await this.sendMessage(chatId, `❌ Failed to add *${TelegramWildcardBot.escapeMarkdownV2(fullDomain)}*, status: \`${status}\``, { parse_mode: 'MarkdownV2' });
        }

      }

      // Handle /del
      else if (text.startsWith('/del ')) {
        const subdomain = text.split(' ')[1];
        if (!subdomain) return new Response('OK', { status: 200 });

        const status = await this.deleteSubdomain(subdomain);
        const fullDomain = `${subdomain}.${rootDomain}`;

        if (status === 200) {
          await this.sendMessage(chatId, `\`\`\`Wildcard\n${TelegramWildcardBot.escapeMarkdownV2(fullDomain)} deleted successfully.\`\`\``, { parse_mode: 'MarkdownV2' });
        } else if (status === 404) {
          await this.sendMessage(chatId, `⚠️ Subdomain *${TelegramWildcardBot.escapeMarkdownV2(fullDomain)}* not found.`, { parse_mode: 'MarkdownV2' });
        } else {
          await this.sendMessage(chatId, `❌ Failed to delete *${TelegramWildcardBot.escapeMarkdownV2(fullDomain)}*, status: \`${status}\``, { parse_mode: 'MarkdownV2' });
        }
      }

      // Handle /list
      else if (text.startsWith('/list')) {
        const domains = await this.listSubdomains();

        if (domains.length === 0) {
          await this.sendMessage(chatId, '*No subdomains registered yet.*', { parse_mode: 'MarkdownV2' });
        } else {
          const formattedList = domains.map((d, i) => `${i + 1}\\. ${TelegramWildcardBot.escapeMarkdownV2(d)}`).join('\n');
          const totalLine = `\n\nTotal: *${domains.length}* subdomain${domains.length > 1 ? 's' : ''}`;
          const textPreview = `\`\`\`List-Wildcard\n${formattedList}\`\`\`` + totalLine;

          await this.sendMessage(chatId, textPreview, { parse_mode: 'MarkdownV2' });

          const fileContent = domains.map((d, i) => `${i + 1}. ${d}`).join('\n');
          await this.sendDocument(chatId, fileContent, 'wildcard-list.txt', 'text/plain');
        }
      }

      return new Response('OK', { status: 200 });
    } catch (err) {
      console.error('Error in handleUpdate:', err);
      return new Response('Internal Server Error', { status: 500 });
    }
  }
}
