/**
 * Tool Registry routes.
 * Placeholder endpoints for Antigravity + Stitch + future tools.
 *
 * GET  /api/tools          → list registered tools
 * POST /api/tools/execute  → execute a tool by name (stub)
 */

const { Router } = require('express');
const router = Router();

// ── Tool definitions (placeholders) ────────────────────
const TOOLS = [
  {
    name: 'antigravity',
    description: 'Antigravity tool — placeholder for future integration',
    status: 'stub',
  },
  {
    name: 'stitch',
    description: 'Stitch tool — placeholder for future integration',
    status: 'stub',
  },
];

/** List all registered tools */
router.get('/', (_req, res) => {
  res.json({ tools: TOOLS });
});

/** Execute a tool by name (stub) */
router.post('/execute', (req, res) => {
  const { tool, params } = req.body;
  const found = TOOLS.find(t => t.name === tool);

  if (!found) {
    return res.status(404).json({ error: `Tool "${tool}" not found` });
  }

  // Stub response — replace with actual logic later
  res.json({
    tool,
    status: 'stub',
    message: `Tool "${tool}" execution is not yet implemented.`,
    params,
  });
});

module.exports = router;
