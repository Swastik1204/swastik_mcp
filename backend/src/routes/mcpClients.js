/**
 * MCP Client routes — onboarding, testing, management.
 *
 * POST   /api/mcp/clients            → register new MCP client
 * GET    /api/mcp/clients            → list all MCP clients
 * GET    /api/mcp/clients/:id        → get single client
 * PUT    /api/mcp/clients/:id        → update client (enable/disable, perms)
 * POST   /api/mcp/clients/:id/test   → test MCP connectivity
 */

const { Router } = require('express');
const router = Router();
const { writeLimiter } = require('../middleware/rateLimiter');
const {
  ProjectServiceError,
  createMcpClient,
  listMcpClients,
  getMcpClient,
  updateMcpClient,
  testMcpClient,
  reconnectMcpClient,
  VALID_CLIENT_TYPES,
  VALID_CONNECTION_MODES,
  VALID_PERMISSIONS,
} = require('../services/projectService');
const { launchClientSetup } = require('../services/mcpLauncherService');

function ctx(req) {
  return { uid: req.user?.uid };
}

function handleError(error, res, next) {
  if (error instanceof ProjectServiceError) {
    return res.status(error.status).json({ error: error.message, code: error.code });
  }
  return next(error);
}

router.get('/meta', (_req, res) => {
  res.json({
    client_types: VALID_CLIENT_TYPES,
    connection_modes: VALID_CONNECTION_MODES,
    permissions: VALID_PERMISSIONS,
  });
});

router.get('/', async (req, res, next) => {
  try {
    const result = listMcpClients(ctx(req));
    return res.json({ clients: result });
  } catch (error) {
    return handleError(error, res, next);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const result = getMcpClient(ctx(req), req.params.id);
    return res.json(result);
  } catch (error) {
    return handleError(error, res, next);
  }
});

router.post('/', writeLimiter, async (req, res, next) => {
  try {
    const result = createMcpClient(ctx(req), req.body);
    return res.status(201).json(result);
  } catch (error) {
    return handleError(error, res, next);
  }
});

router.put('/:id', writeLimiter, async (req, res, next) => {
  try {
    const result = updateMcpClient(ctx(req), req.params.id, req.body);
    return res.json(result);
  } catch (error) {
    return handleError(error, res, next);
  }
});

router.post('/:id/test', writeLimiter, async (req, res, next) => {
  try {
    const result = testMcpClient(ctx(req), req.params.id);
    return res.json(result);
  } catch (error) {
    return handleError(error, res, next);
  }
});

router.post('/:id/reconnect', writeLimiter, async (req, res, next) => {
  try {
    const result = reconnectMcpClient(ctx(req), req.params.id);
    return res.json(result);
  } catch (error) {
    return handleError(error, res, next);
  }
});

router.post('/:id/launch', writeLimiter, async (req, res, next) => {
  try {
    const client = getMcpClient(ctx(req), req.params.id);
    const action = req.body?.action || 'launch';
    const baseFromEnv = process.env.PUBLIC_API_BASE_URL || process.env.RENDER_EXTERNAL_URL;
    const fallbackBase = `${req.protocol}://${req.get('host')}/api`;
    const apiBase = (baseFromEnv || fallbackBase).replace(/\/$/, '');
    const mcpUrl = `${apiBase}/mcp`;

    const result = await launchClientSetup({
      client,
      mcpUrl,
      action,
    });

    return res.json({
      client_id: client.id,
      client_type: client.client_type,
      mcp_url: mcpUrl,
      ...result,
    });
  } catch (error) {
    return handleError(error, res, next);
  }
});

module.exports = router;
