const path = require('path');

const packageJson = require(path.resolve(__dirname, '..', '..', 'package.json'));

const restartState = {
  lastPingAt: null,
  lastCommand: null,
  lastCommandAt: null,
  lastRestartAt: null,
  lastRestartResult: null,
  adminClientLastSeenAt: {},
};

function parseChatIdList(raw) {
  return String(raw || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseAdminChatIds() {
  return parseChatIdList(process.env.TELEGRAM_ADMIN_CHAT_IDS);
}

function parseViewerChatIds() {
  return parseChatIdList(process.env.TELEGRAM_VIEWER_CHAT_IDS);
}

function parseAllowedChatIds() {
  const explicitAllowed = parseChatIdList(process.env.TELEGRAM_ALLOWED_CHAT_IDS);
  const adminIds = parseAdminChatIds();
  const viewerIds = parseViewerChatIds();
  return Array.from(new Set([...explicitAllowed, ...adminIds, ...viewerIds]));
}

function getOwnerTelegramChatId() {
  return String(process.env.TELEGRAM_OWNER_CHAT_ID || process.env.OWNER_TG_ID || '').trim();
}

function isAdminChatId(chatId) {
  const value = String(chatId || '');
  const owner = getOwnerTelegramChatId();
  if (owner && value === owner) return true;
  return parseAdminChatIds().includes(value);
}

function isViewerChatId(chatId) {
  return parseViewerChatIds().includes(String(chatId || ''));
}

function isAllowedChatId(chatId) {
  const allowed = parseAllowedChatIds();
  if (allowed.length === 0) return false;
  return allowed.includes(String(chatId));
}

function parseBearerToken(headerValue) {
  const value = String(headerValue || '').trim();
  if (!value) return '';
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function registerAdminClientHit(clientId) {
  const id = String(clientId || '').trim() || 'unknown';
  restartState.adminClientLastSeenAt[id] = Date.now();
}

function getAdminClientsConnected() {
  const now = Date.now();
  const fiveMinutesMs = 5 * 60 * 1000;
  return Object.values(restartState.adminClientLastSeenAt)
    .filter((timestamp) => Number.isFinite(timestamp) && (now - timestamp) <= fiveMinutesMs)
    .length;
}

function getServiceVersion() {
  return process.env.RENDER_GIT_COMMIT || process.env.GIT_SHA || packageJson.version;
}

function canRestartBackend() {
  return Boolean(process.env.RENDER_DEPLOY_HOOK_URL || process.env.ALLOW_PROCESS_SELF_RESTART === 'true');
}

function markTelegramPing({ chatId, command = null } = {}) {
  restartState.lastPingAt = new Date().toISOString();
  if (command) {
    restartState.lastCommand = String(command);
    restartState.lastCommandAt = new Date().toISOString();
  }
  if (chatId) {
    restartState.lastChatId = String(chatId);
  }
}

function getTelegramHealth() {
  const allowed = parseAllowedChatIds();
  const now = Date.now();
  const lastPingMs = restartState.lastPingAt ? Date.parse(restartState.lastPingAt) : null;
  const botConnected = Boolean(lastPingMs && Number.isFinite(lastPingMs) && (now - lastPingMs) < 5 * 60 * 1000);

  return {
    ok: true,
    bot_connected: botConnected,
    last_ping_at: restartState.lastPingAt,
    allowed_chat_ids: allowed,
    can_restart_backend: canRestartBackend(),
    owner_chat_id_configured: Boolean(getOwnerTelegramChatId()),
    admins_configured: parseAdminChatIds().length,
    viewers_configured: parseViewerChatIds().length,
  };
}

function assertAdminSecret(secret) {
  const expected = String(process.env.BACKEND_ADMIN_SECRET || '').trim();
  if (!expected) {
    const error = new Error('Server misconfigured: BACKEND_ADMIN_SECRET not set');
    error.status = 500;
    error.errorCode = 'SERVER_MISCONFIG';
    throw error;
  }
  if (!secret || secret !== expected) {
    const error = new Error('Forbidden: invalid admin secret');
    error.status = 403;
    error.errorCode = 'FORBIDDEN';
    throw error;
  }
}

function assertMcpClientId(clientId, { requiredValue } = {}) {
  const value = String(clientId || '').trim();
  if (!value) {
    const error = new Error('Forbidden: missing X-MCP-Client-Id');
    error.status = 403;
    error.errorCode = 'FORBIDDEN';
    throw error;
  }

  if (requiredValue && value !== requiredValue) {
    const error = new Error(`Forbidden: invalid MCP client (${value})`);
    error.status = 403;
    error.errorCode = 'FORBIDDEN';
    throw error;
  }
}

function assertAllowedChat(chatId) {
  if (!chatId || !isAllowedChatId(chatId)) {
    const error = new Error('Forbidden: chat is not allowed');
    error.status = 403;
    error.errorCode = 'FORBIDDEN';
    throw error;
  }
}

function assertOwnerChat(chatId) {
  const owner = getOwnerTelegramChatId();
  if (!owner || String(chatId) !== owner) {
    const error = new Error('Forbidden: owner-only action');
    error.status = 403;
    error.errorCode = 'FORBIDDEN';
    throw error;
  }
}

function assertAdminChat(chatId) {
  if (!isAdminChatId(chatId)) {
    const error = new Error('Forbidden: admin-only action');
    error.status = 403;
    error.errorCode = 'FORBIDDEN';
    throw error;
  }
}

async function triggerBackendRestart({ reason = 'telegram-request' } = {}) {
  restartState.lastRestartAt = new Date().toISOString();
  restartState.lastRestartResult = 'self-exit-scheduled';
  setTimeout(() => process.exit(0), 250);
  return {
    restarted: true,
    mode: 'self-exit',
    reason,
    accepted_at: restartState.lastRestartAt,
  };
}

function getLastRestartAt() {
  return restartState.lastRestartAt;
}

module.exports = {
  parseAdminChatIds,
  parseViewerChatIds,
  parseAllowedChatIds,
  getOwnerTelegramChatId,
  isAdminChatId,
  isViewerChatId,
  parseBearerToken,
  registerAdminClientHit,
  getAdminClientsConnected,
  getServiceVersion,
  getTelegramHealth,
  markTelegramPing,
  assertAdminSecret,
  assertMcpClientId,
  assertAllowedChat,
  assertAdminChat,
  assertOwnerChat,
  triggerBackendRestart,
  getLastRestartAt,
};