/**
 * Health-check route.
 * GET /api/health → { status: 'ok', uptime, timestamp }
 */

const { Router } = require('express');
const router = Router();

router.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
