/**
 * Health-check route.
 * GET /api/health → { status: 'ok', uptime, timestamp }
 */

const { Router } = require('express');
const router = Router();
const { getMcpHealth, getMcpDiagnostics } = require('../mcp/server');
const { getTelegramHealth } = require('../services/telegramControlService');

router.get('/', (_req, res) => {
  if (String(_req.headers['x-mcp-client-id'] || '').trim() === 'telegram-bot') {
    console.log('TELEGRAM WOKE RENDER');
  }

  res.json({
    status: 'ok',
    service: 'mcp-backend',
    uptime: Number(process.uptime().toFixed(2)),
    timestamp: new Date().toISOString(),
  });
});

router.get('/metrics', (_req, res) => {
  const usage = process.memoryUsage();
  const cpu = process.cpuUsage();

  res.json({
    status: 'ok',
    service: 'mcp-backend',
    timestamp: new Date().toISOString(),
    memory: {
      rss_mb: Number((usage.rss / (1024 * 1024)).toFixed(2)),
      heap_used_mb: Number((usage.heapUsed / (1024 * 1024)).toFixed(2)),
      heap_total_mb: Number((usage.heapTotal / (1024 * 1024)).toFixed(2)),
    },
    cpu: {
      user_us: cpu.user,
      system_us: cpu.system,
    },
    uptime: Number(process.uptime().toFixed(2)),
  });
});

router.get('/mcp', (_req, res) => {
  const diagnostics = getMcpDiagnostics();
  const mcp = getMcpHealth();
  res.json({
    ok: true,
    status: 'ok',
    timestamp: new Date().toISOString(),
    http: diagnostics.http,
    stdio_supported: diagnostics.stdio_supported,
    tools_registered: diagnostics.tools_registered,
    resources_registered: diagnostics.resources_registered,
    last_tool_call_at: diagnostics.last_tool_call_at,
    port: diagnostics.port,
    env: diagnostics.env,
    mcpReady: mcp.mode !== 'uninitialized' && mcp.sqliteReady && mcp.firestoreReady,
    firestore: mcp.firestoreReady,
    sqlite: mcp.sqliteReady,
    queueDepth: mcp.syncQueueDepth,
    deadLetters: mcp.deadLetters,
    mode: mcp.mode,
    sqliteReady: mcp.sqliteReady,
    firestoreReady: mcp.firestoreReady,
    syncQueueDepth: mcp.syncQueueDepth,
  });
});

router.get('/telegram', (_req, res) => {
  res.json(getTelegramHealth());
});

module.exports = router;
