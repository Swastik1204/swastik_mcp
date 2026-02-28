require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MCP_CLIENT_ID = 'telegram-bot';
const PUBLIC_API_BASE_URL = String(process.env.PUBLIC_API_BASE_URL || '').replace(/\/$/, '');
const BACKEND_ADMIN_SECRET = String(process.env.BACKEND_ADMIN_SECRET || '').trim();
const REQUEST_TIMEOUT_MS = Math.min(Number(process.env.REQUEST_TIMEOUT_MS || 15000), 15000);
const RATE_LIMIT_PER_CHAT_MS = Number(process.env.RATE_LIMIT_PER_CHAT_MS || 1200);
const RETRY_COUNT = 1;

const ADMINS = String(process.env.TELEGRAM_ADMIN_CHAT_IDS || process.env.TELEGRAM_OWNER_CHAT_ID || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const VIEWERS = String(process.env.TELEGRAM_VIEWER_CHAT_IDS || process.env.TELEGRAM_ALLOWED_CHAT_IDS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
  .filter((chatId) => !ADMINS.includes(chatId));

const API_BASE = PUBLIC_API_BASE_URL;
const BACKEND_HEALTH_URL = `${API_BASE}/health`;
const BACKEND_MCP_HEALTH_URL = `${API_BASE}/health/mcp`;
const BACKEND_TELEGRAM_HEALTH_URL = `${API_BASE}/health/telegram`;
const BACKEND_METRICS_URL = `${API_BASE}/health/metrics`;
const BACKEND_ADMIN_STATUS_URL = `${API_BASE}/admin/status`;
const BACKEND_ADMIN_RESTART_URL = `${API_BASE}/admin/restart`;

const commandAlias = new Map([
  ['/start', 'ping'],
  ['/help', 'help'],
  ['/status', 'status'],
  ['/health', 'health'],
  ['/ping', 'ping'],
  ['/restart', 'restart'],
  ['wake', 'ping'],
  ['start', 'ping'],
  ['status', 'status'],
  ['health', 'health'],
  ['ping', 'ping'],
  ['restart', 'restart'],
  ['help', 'help'],
]);

const lastReplyByChat = new Map();

function assertConfig() {
  const missing = [];
  if (!TELEGRAM_BOT_TOKEN) missing.push('TELEGRAM_BOT_TOKEN');
  if (!API_BASE) missing.push('PUBLIC_API_BASE_URL');
  if (!BACKEND_ADMIN_SECRET) missing.push('BACKEND_ADMIN_SECRET');
  if (ADMINS.length === 0) missing.push('TELEGRAM_ADMIN_CHAT_IDS');

  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }

  if (process.env.NODE_ENV === 'production' && /localhost|127\.0\.0\.1/i.test(API_BASE)) {
    throw new Error('PUBLIC_API_BASE_URL must point to Render in production, not localhost.');
  }
}

function normalizeCommand(text) {
  const value = String(text || '').trim().toLowerCase();
  if (!value) return null;

  const first = value.split(/\s+/)[0];
  const noMention = first.replace(/@.+$/, '');
  return commandAlias.get(noMention) || null;
}

function isViewer(chatId) {
  return VIEWERS.includes(String(chatId));
}

function isAdmin(chatId) {
  return ADMINS.includes(String(chatId));
}

function hasPermission(chatId, command) {
  const value = String(chatId);
  const viewer = isViewer(value);
  const admin = isAdmin(value);

  if (command === 'restart') return admin;
  if (command === 'status' || command === 'health' || command === 'ping') {
    return admin || viewer;
  }
  return admin || viewer;
}

function shouldRateLimit(chatId) {
  const now = Date.now();
  const previous = lastReplyByChat.get(String(chatId)) || 0;
  if (now - previous < RATE_LIMIT_PER_CHAT_MS) {
    return true;
  }
  lastReplyByChat.set(String(chatId), now);
  return false;
}

async function fetchJson(url, { method = 'GET', body, chatId, command, retryCount = RETRY_COUNT } = {}) {
  let lastError = null;

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${BACKEND_ADMIN_SECRET}`,
        'X-MCP-Client-Id': MCP_CLIENT_ID,
      };

      if (chatId) {
        headers['X-Telegram-Chat-Id'] = String(chatId);
      }

      if (command) {
        headers['X-Telegram-Command'] = String(command);
      }

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const text = await response.text();
      let data;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }

      if (!response.ok) {
        const message = data?.humanMessage || data?.error || data?.message || `HTTP ${response.status}`;
        const error = new Error(message);
        error.status = response.status;
        throw error;
      }

      return data;
    } catch (error) {
      const retriable = !error.status || error.status >= 500;
      lastError = error;
      if (!retriable || attempt === retryCount) {
        break;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error('Unknown request failure');
}

function helpText() {
  return [
    'Available commands:',
    'status  - Show Render/backend system status',
    'health  - Check backend health endpoint',
    'ping    - Wake sleeping Render service',
    'restart - Restart backend container (admin only)',
    'help   - Show this help',
  ].join('\n');
}

function formatStatus(payload) {
  const render = payload?.render || 'unknown';
  const uptime = payload?.uptime ?? 'n/a';
  const memory = payload?.memory ?? 'n/a';
  const clientsConnected = payload?.clientsConnected ?? 'n/a';
  const lastRestart = payload?.lastRestart || 'never';
  const version = payload?.version || 'n/a';

  return [
    '📊 Backend Status',
    '',
    `Render: ${render}`,
    `Uptime: ${uptime}s`,
    `Memory RSS: ${memory} MB`,
    `Clients Connected: ${clientsConnected}`,
    `Last Restart: ${lastRestart}`,
    `Version: ${version}`,
  ].join('\n');
}

function formatHealth(payload) {
  return [
    '🩺 Health',
    '',
    `Service: ${payload?.service || 'mcp-backend'}`,
    `Status: ${payload?.status === 'ok' ? '✅ Alive' : '❌ Down'}`,
    `Uptime: ${payload?.uptime ?? 'n/a'}s`,
    `Time: ${payload?.timestamp || 'n/a'}`,
  ].join('\n');
}

function formatMetrics(payload) {
  return [
    '📈 Metrics',
    '',
    `RSS: ${payload?.memory?.rss_mb ?? 'n/a'} MB`,
    `Heap Used: ${payload?.memory?.heap_used_mb ?? 'n/a'} MB`,
    `CPU User: ${payload?.cpu?.user_us ?? 'n/a'} µs`,
    `CPU System: ${payload?.cpu?.system_us ?? 'n/a'} µs`,
  ].join('\n');
}

async function executeWithWakeNotice(bot, msg, operation) {
  let wakeNoticeSent = false;
  const wakeTimer = setTimeout(async () => {
    wakeNoticeSent = true;
    try {
      await bot.sendMessage(msg.chat.id, '⏳ Waking Render…');
    } catch {
      // ignore
    }
  }, 2500);

  try {
    const result = await operation();
    return { result, wakeNoticeSent };
  } finally {
    clearTimeout(wakeTimer);
  }
}

async function handleCommand(bot, msg, command) {
  const chatId = String(msg.chat.id);

  if (!hasPermission(chatId, command)) {
    await bot.sendMessage(msg.chat.id, '🚫 You are not allowed to perform this action.');
    return;
  }

  if (shouldRateLimit(chatId)) {
    return;
  }

  if (command === 'help') {
    await bot.sendMessage(msg.chat.id, helpText());
    return;
  }

  if (command === 'ping') {
    try {
      await executeWithWakeNotice(bot, msg, () => fetchJson(BACKEND_HEALTH_URL, { chatId, command }));
      await bot.sendMessage(msg.chat.id, '✅ Ping ok. Render backend is awake.');
    } catch (error) {
      await bot.sendMessage(msg.chat.id, `Ping failed ❌\n${error.message}`);
    }
    return;
  }

  if (command === 'status') {
    try {
      const { result } = await executeWithWakeNotice(bot, msg, () => fetchJson(BACKEND_ADMIN_STATUS_URL, { chatId, command }));
      await bot.sendMessage(msg.chat.id, formatStatus(result));
    } catch (error) {
      await bot.sendMessage(msg.chat.id, `Status failed ❌\n${error.message}`);
    }
    return;
  }

  if (command === 'health') {
    try {
      const { result } = await executeWithWakeNotice(bot, msg, () => fetchJson(BACKEND_HEALTH_URL, { chatId, command }));
      await bot.sendMessage(msg.chat.id, formatHealth(result));
    } catch (error) {
      await bot.sendMessage(msg.chat.id, `Health failed ❌\n${error.message}`);
    }
    return;
  }

  if (command === 'restart') {
    try {
      const { result } = await executeWithWakeNotice(bot, msg, () => fetchJson(BACKEND_ADMIN_RESTART_URL, {
        method: 'POST',
        body: { reason: 'telegram-restart-command' },
        chatId,
        command,
      }));
      await bot.sendMessage(msg.chat.id, `♻️ Restart requested (${result.mode || 'self-exit'}).`);
    } catch (error) {
      await bot.sendMessage(msg.chat.id, `Restart failed ❌\n${error.message}`);
    }
    return;
  }

  await bot.sendMessage(msg.chat.id, helpText());
}

async function main() {
  assertConfig();
  const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

  bot.on('polling_error', (error) => {
    console.error('[TELEGRAM] polling_error', error.message);
  });

  bot.on('message', async (msg) => {
    try {
      const command = normalizeCommand(msg.text || '');
      if (!command) return;
      await handleCommand(bot, msg, command);
    } catch (error) {
      try {
        await bot.sendMessage(msg.chat.id, 'Unexpected bot error ❌');
      } catch {
        // ignore send failures
      }
      console.error('[TELEGRAM] message handler error', error.message);
    }
  });

  try {
    const telegramHealth = await fetchJson(BACKEND_TELEGRAM_HEALTH_URL, { command: 'startup-check' });
    console.log(`[BOT] backend telegram health ok=${telegramHealth.ok}`);
  } catch (error) {
    console.warn(`[BOT] initial backend health check failed: ${error.message}`);
  }

  try {
    const metrics = await fetchJson(BACKEND_METRICS_URL, { command: 'startup-metrics' });
    console.log(`[BOT] metrics rss=${metrics?.memory?.rss_mb ?? 'n/a'}MB`);
  } catch (error) {
    console.warn(`[BOT] initial metrics check failed: ${error.message}`);
  }

  console.log('[BOT] Telegram control bot running');
  console.log(`[BOT] API base: ${API_BASE}`);
  console.log(`[BOT] Admins: ${ADMINS.length}`);
  console.log(`[BOT] Viewers: ${VIEWERS.length}`);
}

main().catch((error) => {
  console.error('[BOT] Fatal startup error:', error.message);
  process.exit(1);
});