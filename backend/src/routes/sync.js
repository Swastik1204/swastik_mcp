/**
 * Sync routes — trigger and monitor two-way sync.
 *
 * POST /api/sync/push    → push offline queue to Firebase
 * POST /api/sync/pull    → pull latest from Firebase into SQLite
 * GET  /api/sync/status  → pending queue count
 */

const { Router } = require('express');
const router = Router();
const { syncPush, syncPull, getSyncStatus } = require('../sync/engine');

router.post('/push', async (_req, res, next) => {
  try {
    const result = await syncPush();
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/pull', async (_req, res, next) => {
  try {
    const result = await syncPull();
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/status', (_req, res) => {
  res.json(getSyncStatus());
});

module.exports = router;
