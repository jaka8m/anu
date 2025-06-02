// ========================================
// Main Telegram Wildcard Bot class
// ========================================

// Entry point, contoh export (kalau butuh)
export async function WildcardBot(link) {
  console.log("Bot link:", link);
}

// =======================
// Global constants & config
// =======================
const rootDomain = "joss.checker-ip.xyz";
const accountID = typeof ACCOUNT_ID !== "undefined" ? CF_ACCOUNT_ID : "";
const zoneID = typeof ZONE_ID !== "undefined" ? CF_ZONE_ID : "";
const apiKey = typeof API_KEY !== "undefined" ? CF_API_KEY : "";
const apiEmail = typeof API_EMAIL !== "undefined" ? CF_API_EMAIL : "";
const serviceName = "siren";

const headers = {
  'X-Auth-Email': apiEmail,
  'X-Auth-Key': apiKey,
  'Content-Type': 'application/json'
};

// Escape MarkdownV2 untuk Telegram
function escapeMarkdownV2(text) {
  return text.replace(/([_*\[\]()~`>#+=|{}.!\\-])/g, '\\$1');
}

// Ambil list domain dari Cloudflare Workers
async function getDomainList() {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountID}/workers/domains`;
  const res = await fetch(url, { headers });
  if (!res.ok) return [];

  const json = await res.json();
  // Filter berdasarkan serviceName lalu ambil hostname
  return json.result
    .filter(domain => domain.service === serviceName)
    .map(domain => domain.hostname);
}

// Tambah subdomain ke Cloudflare Workers
async function addSubdomain(subdomain) {
  const domain = `${subdomain}.${rootDomain}`.toLowerCase();

  // Validasi domain akhiran
  if (!domain.endsWith(rootDomain)) return 400;

  // Cek sudah terdaftar atau belum
  const registeredDomains = await getDomainList();
  if (registeredDomains.includes(domain)) return 409;

  // Cek apakah domain aktif (status 530 = unavailable)
  try {
    const testUrl = `https://${domain.replace(`.${rootDomain}`, '')}`;
    const testRes = await fetch(testUrl);
    if (testRes.status === 530) return 530;
  } catch {
    return 400;
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountID}/workers/domains`;
  const body = {
    environment: "production",
    hostname: domain,
    service: serviceName,
    zone_id: zoneID
  };

  const res = await fetch(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body)
  });

  return res.status;
}

// Hapus subdomain dari Cloudflare Workers
async function deleteSubdomain(subdomain) {
  const domain = `${subdomain}.${rootDomain}`.toLowerCase();
  const urlList = `https://api.cloudflare.com/client/v4/accounts/${accountID}/workers/domains`;

  const listRes = await fetch(urlList, { headers });
  if (!listRes.ok) return listRes.status;

  const listJson = await listRes.json();
  const domainObj = listJson.result.find(d => d.hostname === domain);
  if (!domainObj) return 404;

  const urlDelete = `${urlList}/${domainObj.id}`;
  const res = await fetch(urlDelete, {
    method: 'DELETE',
    headers
  });

  return res.status;
}

// Ambil semua subdomain terdaftar
async function listSubdomains() {
  return await getDomainList();
}

// ========================================
// Telegram Bot Handler Class
// ========================================

export class TelegramWildcardBot {
  constructor(token, apiUrl = 'https://api.telegram.org', ownerId) {
    this.token = token;
    this.apiUrl = apiUrl;
    this.ownerId = ownerId;
    this.handleUpdate = this.handleUpdate.bind(this);
  }

  // Tangani update webhook Telegram
  async handleUpdate(update) {
    if (!update.message) return new Response('OK', { status: 200 });

    const chatId = update.message.chat.id;
    const text = update.message.text || '';

    // Cek autorisasi untuk command /add dan /del
    if ((text.startsWith('/add ') || text.startsWith('/del ')) && chatId !== this.ownerId) {
      await this.sendMessage(chatId, '⛔ You are not authorized to use this command.');
      return new Response('OK', { status: 200 });
    }

    if (text.startsWith('/add ')) {
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
        status = await addSubdomain(subdomain);
      } catch (err) {
        console.error('addSubdomain() error:', err);
        status = 500;
      }

      const fullDomain = `${subdomain}.${rootDomain}`;

      // Hapus pesan loading
      if (loadingMsgId) {
        try {
          await this.deleteMessage(chatId, loadingMsgId);
        } catch (err) {
          console.error('Failed to delete loading message:', err);
        }
      }

      // Kirim hasil status
      if (status === 200) {
        await this.sendMessage(chatId, `\`\`\`Wildcard\n${escapeMarkdownV2(fullDomain)} added successfully\`\`\``, { parse_mode: 'MarkdownV2' });
      } else if (status === 409) {
        await this.sendMessage(chatId, `⚠️ Subdomain *${escapeMarkdownV2(fullDomain)}* already exists.`, { parse_mode: 'MarkdownV2' });
      } else if (status === 530) {
        await this.sendMessage(chatId, `❌ Subdomain *${escapeMarkdownV2(fullDomain)}* not active (error 530).`, { parse_mode: 'MarkdownV2' });
      } else {
        await this.sendMessage(chatId, `❌ Failed to add *${escapeMarkdownV2(fullDomain)}*, status: \`${status}\``, { parse_mode: 'MarkdownV2' });
      }

      return new Response('OK', { status: 200 });
    }

    if (text.startsWith('/del ')) {
      const subdomain = text.split(' ')[1];
      if (!subdomain) return new Response('OK', { status: 200 });

      const status = await deleteSubdomain(subdomain);
      const fullDomain = `${subdomain}.${rootDomain}`;

      if (status === 200) {
        await this.sendMessage(chatId, `\`\`\`Wildcard\n${escapeMarkdownV2(fullDomain)} deleted successfully.\`\`\``, { parse_mode: 'MarkdownV2' });
      } else if (status === 404) {
        await this.sendMessage(chatId, `⚠️ Subdomain *${escapeMarkdownV2(fullDomain)}* not found.`, { parse_mode: 'MarkdownV2' });
      } else {
        await this.sendMessage(chatId, `❌ Failed to delete *${escapeMarkdownV2(fullDomain)}*, status: \`${status}\``, { parse_mode: 'MarkdownV2' });
      }

      return new Response('OK', { status: 200 });
    }

    if (text.startsWith('/list')) {
      const domains = await listSubdomains();

      if (domains.length === 0) {
        await this.sendMessage(chatId, '*No subdomains registered yet.*', { parse_mode: 'MarkdownV2' });
      } else {
        const formattedList = domains.map((d, i) => `${i + 1}\\. ${escapeMarkdownV2(d)}`).join('\n');
        const totalLine = `\n\nTotal: *${domains.length}* subdomain${domains.length > 1 ? 's' : ''}`;
        const textPreview = `\`\`\`List-Wildcard\n${formattedList}\`\`\`` + totalLine;

        await this.sendMessage(chatId, textPreview, { parse_mode: 'MarkdownV2' });

        const fileContent = domains.map((d, i) => `${i + 1}. ${d}`).join('\n');
        await this.sendDocument(chatId, fileContent, 'wildcard-list.txt', 'text/plain');
      }

      return new Response('OK', { status: 200 });
    }

    return new Response('OK', { status: 200 });
  }

  // Kirim pesan ke Telegram
  async sendMessage(chatId, text, options = {}) {
    const payload = { chat_id: chatId, text, ...options };
    const res = await fetch(`${this.apiUrl}/bot${this.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.json();
  }

  // Hapus pesan Telegram
  async deleteMessage(chatId, messageId) {
    await fetch(`${this.apiUrl}/bot${this.token}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId })
    });
  }

  // Kirim file ke Telegram
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
}
