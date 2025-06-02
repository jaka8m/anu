// bot.js

const rootDomain = "joss.checker-ip.xyz";
const serviceName = "siren";

// Escape MarkdownV2 untuk Telegram
function escapeMarkdownV2(text) {
  return text.replace(/([_*\[\]()~`>#+=|{}.!\\-])/g, '\\$1');
}

// Ambil list domain dari Cloudflare Workers
async function getDomainList(env) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/workers/domains`;
  const headers = {
    'Authorization': `Bearer ${env.API_KEY}`,
    'X-Auth-Email': env.API_EMAIL,
    'X-Auth-Key': env.API_KEY,
    'Content-Type': 'application/json'
  };

  const res = await fetch(url, { headers });
  if (res.ok) {
    const json = await res.json();
    return json.result.filter(d => d.service === serviceName).map(d => d.hostname);
  }
  return [];
}

// Tambah subdomain ke Cloudflare Workers
async function addSubdomain(env, subdomain) {
  const domain = `${subdomain}.${rootDomain}`.toLowerCase();
  if (!domain.endsWith(rootDomain)) return 400;

  const registeredDomains = await getDomainList(env);
  if (registeredDomains.includes(domain)) return 409;

  try {
    const testUrl = `https://${domain.replace(`.${rootDomain}`, '')}`;
    const domainTest = await fetch(testUrl);
    if (domainTest.status === 530) return 530;
  } catch {
    return 400;
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/workers/domains`;
  const body = {
    environment: "production",
    hostname: domain,
    service: serviceName,
    zone_id: env.ZONE_ID
  };

  const headers = {
    'Authorization': `Bearer ${env.API_KEY}`,
    'X-Auth-Email': env.API_EMAIL,
    'X-Auth-Key': env.API_KEY,
    'Content-Type': 'application/json'
  };

  const res = await fetch(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body)
  });

  return res.status;
}

// Hapus subdomain dari Cloudflare Workers
async function deleteSubdomain(env, subdomain) {
  const domain = `${subdomain}.${rootDomain}`.toLowerCase();
  const urlList = `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/workers/domains`;
  const headers = {
    'Authorization': `Bearer ${env.API_KEY}`,
    'X-Auth-Email': env.API_EMAIL,
    'X-Auth-Key': env.API_KEY,
    'Content-Type': 'application/json'
  };

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

// Kirim pesan ke Telegram
async function sendMessage(token, chatId, text, options = {}) {
  const payload = { chat_id: chatId, text, ...options };
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return response.json();
}

// Hapus pesan Telegram
async function deleteMessage(token, chatId, messageId) {
  await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId })
  });
}

// Kirim file ke Telegram
async function sendDocument(token, chatId, content, filename, mimeType) {
  const formData = new FormData();
  const blob = new Blob([content], { type: mimeType });
  formData.append('document', blob, filename);
  formData.append('chat_id', chatId.toString());

  const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: 'POST',
    body: formData
  });

  return response.json();
}

// Handler utama yang dipanggil worker.js
export async function handleTelegramUpdate(env, update) {
  if (!update.message) return new Response('OK', { status: 200 });

  const chatId = update.message.chat.id;
  const text = update.message.text || '';

  // Owner ID harus dari env
  if ((text.startsWith('/add ') || text.startsWith('/del ')) && chatId !== Number(env.OWNER_ID)) {
    await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, '⛔ You are not authorized to use this command.');
    return new Response('OK', { status: 200 });
  }

  if (text.startsWith('/add ')) {
    const subdomain = text.split(' ')[1]?.trim();
    if (!subdomain) return new Response('OK', { status: 200 });

    let loadingMsgId;
    try {
      const loadingMsg = await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, '⏳ Adding subdomain, please wait...');
      loadingMsgId = loadingMsg.result?.message_id;
    } catch (err) {
      console.error('Failed to send loading message:', err);
    }

    let status;
    try {
      status = await addSubdomain(env, subdomain);
    } catch (err) {
      console.error('addSubdomain error:', err);
      status = 500;
    }

    const fullDomain = `${subdomain}.${rootDomain}`;

    if (loadingMsgId) {
      try {
        await deleteMessage(env.TELEGRAM_BOT_TOKEN, chatId, loadingMsgId);
      } catch (err) {
        console.error('Failed to delete loading message:', err);
      }
    }

    if (status === 200) {
      await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `\`\`\`Wildcard\n${escapeMarkdownV2(fullDomain)} added successfully\`\`\``, { parse_mode: 'MarkdownV2' });
    } else if (status === 409) {
      await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `⚠️ Subdomain *${escapeMarkdownV2(fullDomain)}* already exists.`, { parse_mode: 'MarkdownV2' });
    } else if (status === 530) {
      await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `❌ Subdomain *${escapeMarkdownV2(fullDomain)}* not active (error 530).`, { parse_mode: 'MarkdownV2' });
    } else {
      await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `❌ Failed to add *${escapeMarkdownV2(fullDomain)}*, status: \`${status}\``, { parse_mode: 'MarkdownV2' });
    }

    return new Response('OK', { status: 200 });
  }

  if (text.startsWith('/del ')) {
    const subdomain = text.split(' ')[1];
    if (!subdomain) return new Response('OK', { status: 200 });

    const status = await deleteSubdomain(env, subdomain);
    const fullDomain = `${subdomain}.${rootDomain}`;

    if (status === 200) {
      await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `\`\`\`Wildcard\n${escapeMarkdownV2(fullDomain)} deleted successfully.\`\`\``, { parse_mode: 'MarkdownV2' });
    } else if (status === 404) {
      await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `⚠️ Subdomain *${escapeMarkdownV2(fullDomain)}* not found.`, { parse_mode: 'MarkdownV2' });
    } else {
      await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `❌ Failed to delete *${escapeMarkdownV2(fullDomain)}*, status: \`${status}\``, { parse_mode: 'MarkdownV2' });
    }

    return new Response('OK', { status: 200 });
  }

  if (text.startsWith('/list')) {
    const domains = await getDomainList(env);

    if (domains.length === 0) {
      await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, '*No subdomains registered yet.*', { parse_mode: 'MarkdownV2' });
    } else {
      const formattedList = domains.map((d, i) => `${i + 1}\\. ${escapeMarkdownV2(d)}`).join('\n');
      const totalLine = `\n\nTotal: *${domains.length}* subdomain${domains.length > 1 ? 's' : ''}`;
      const textPreview = `\`\`\`List-Wildcard\n${formattedList}\`\`\`` + totalLine;

      await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, textPreview, { parse_mode: 'MarkdownV2' });

      const fileContent = domains.map((d, i) => `${i + 1}. ${d}`).join('\n');
      await sendDocument(env.TELEGRAM_BOT_TOKEN, chatId, fileContent, 'wildcard-list.txt', 'text/plain');
    }

    return new Response('OK', { status: 200 });
  }

  return new Response('OK', { status: 200 });
}
