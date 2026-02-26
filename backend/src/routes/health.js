/**
 * Health-check route.
 * GET /api/health → { status: 'ok', uptime, timestamp }
 */

const { Router } = require('express');
const router = Router();
const { getMcpHealth } = require('../mcp/server');

router.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

router.get('/mcp', (_req, res) => {
  const mcp = getMcpHealth();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
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

module.exports = router;
