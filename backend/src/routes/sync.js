/**
 * Sync routes — trigger and monitor two-way sync.
 *
 * POST /api/sync/push              → push offline queue to Firebase
 * POST /api/sync/pull              → incremental pull (accepts ?deviceId=)
 * GET  /api/sync/status            → pending + dead-letter counts
 * POST /api/sync/retry-dead-letters → re-attempt dead-letter items
 */

const { Router } = require('express');
const router = Router();
const { syncPush, syncPull, getSyncStatus, retryDeadLetters } = require('../sync/engine');
const { requireOwner } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimiter');

router.post('/push', writeLimiter, async (_req, res, next) => {
  try {
    const result = await syncPush();
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/pull', writeLimiter, async (req, res, next) => {
  try {
    const deviceId = req.query.deviceId || req.body.deviceId;
    const result = await syncPull(deviceId);
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/status', (_req, res) => {
  res.json(getSyncStatus());
});

router.post('/retry-dead-letters', requireOwner, writeLimiter, async (_req, res, next) => {
  try {
    const result = await retryDeadLetters();
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
