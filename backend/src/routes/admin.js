const { Router } = require('express');
const { getSyncStatus } = require('../sync/engine');
const { getAuditLog } = require('../db/sqlite');
const { getMcpDiagnostics, getMcpHealth } = require('../mcp/server');
const {
  parseBearerToken,
  registerAdminClientHit,
  getAdminClientsConnected,
  getServiceVersion,
  getLastRestartAt,
  getTelegramHealth,
  markTelegramPing,
  assertAdminSecret,
  assertMcpClientId,
  assertAllowedChat,
  assertAdminChat,
  triggerBackendRestart,
} = require('../services/telegramControlService');

const router = Router();

function extractTelegramContext(req) {
  const authorization = req.headers.authorization;
  const secret = parseBearerToken(authorization) || req.headers['x-admin-secret'] || req.body?.admin_secret;
  const clientId = req.headers['x-mcp-client-id'] || req.body?.client_id;
  const chatId = req.headers['x-telegram-chat-id'] || req.body?.chat_id;
  const command = req.headers['x-telegram-command'] || req.body?.command || null;
  return {
    secret: secret ? String(secret) : '',
    clientId: clientId ? String(clientId) : '',
    chatId: chatId ? String(chatId) : '',
    command: command ? String(command) : null,
  };
}

function verifyTelegramCaller(req, {
  adminOnly = false,
  ownerOnly = false,
  requiredClientId = null,
  allowLegacyClientId = false,
} = {}) {
  const context = extractTelegramContext(req);

  if (allowLegacyClientId && !context.clientId) {
    context.clientId = 'telegram-bot-legacy';
    console.warn(`LEGACY TELEGRAM CLIENT DETECTED: /api/admin${req.path} (missing X-MCP-Client-Id)`);
  }

  console.log(`ADMIN API HIT: /api/admin${req.path} from ${context.clientId || 'unknown'}`);

  assertAdminSecret(context.secret);
  assertMcpClientId(context.clientId, { requiredValue: requiredClientId || undefined });
  assertAllowedChat(context.chatId);
  if (adminOnly) {
    assertAdminChat(context.chatId);
  }
  if (ownerOnly) {
    assertOwnerChat(context.chatId);
  }
  registerAdminClientHit(context.clientId);
  markTelegramPing({ chatId: context.chatId, command: context.command });
  return context;
}

router.get('/status', (req, res, next) => {
  try {
    verifyTelegramCaller(req, { allowLegacyClientId: true });
    const uptimeSeconds = Number(process.uptime().toFixed(2));
    const rssMb = Number((process.memoryUsage().rss / (1024 * 1024)).toFixed(2));

    const mcp = getMcpHealth();
    const diagnostics = getMcpDiagnostics();
    const sync = getSyncStatus();
    const logs = getAuditLog(5);

    res.json({
      render: 'active',
      uptime: uptimeSeconds,
      memory: rssMb,
      clientsConnected: getAdminClientsConnected(),
      lastRestart: getLastRestartAt(),
      version: getServiceVersion(),
      diagnostics: {
        mcpReady: mcp.mode !== 'uninitialized' && mcp.sqliteReady && mcp.firestoreReady,
        mode: mcp.mode,
        toolsRegistered: diagnostics.tools_registered,
        resourcesRegistered: diagnostics.resources_registered,
        syncPending: sync.pending,
        syncDeadLetters: sync.deadLetters,
      },
      recentLogs: logs.map((row) => ({ action: row.action, target: row.doc_path || row.collection, timestamp: row.timestamp })),
      telegram: getTelegramHealth(),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/telegram/ping', (req, res, next) => {
  try {
    const { chatId, command } = verifyTelegramCaller(req, { allowLegacyClientId: true });
    res.json({
      ok: true,
      chat_id: chatId,
      command: command || null,
      last_ping_at: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/restart', async (req, res, next) => {
  try {
    const { chatId } = verifyTelegramCaller(req, { adminOnly: true, requiredClientId: 'telegram-bot' });
    const reason = req.body?.reason || 'telegram-restart-command';
    const result = await triggerBackendRestart({ reason });

    console.log('ADMIN RESTART TRIGGERED BY TELEGRAM');

    res.json({
      ok: true,
      requested_by_chat_id: chatId,
      ...result,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/restart-backend', async (req, res, next) => {
  try {
    const { chatId } = verifyTelegramCaller(req, { adminOnly: true, requiredClientId: 'telegram-bot' });
    const reason = req.body?.reason || 'telegram-restart-command';
    const result = await triggerBackendRestart({ reason });

    console.log('ADMIN RESTART TRIGGERED BY TELEGRAM');

    return res.json({
      ok: true,
      requested_by_chat_id: chatId,
      ...result,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;