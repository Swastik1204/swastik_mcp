/**
 * Memory routes — Global + Project memory CRUD + Tombstone Delete/Restore.
 * Delegates all data semantics to shared memoryService.
 */

const { Router } = require('express');
const router = Router();

const { writeLimiter } = require('../middleware/rateLimiter');
const {
  MemoryServiceError,
  listGlobalMemory,
  getGlobalMemory,
  setGlobalMemory,
  deleteGlobalMemory,
  restoreGlobalMemory,
  listProjectMemory,
  getProjectMemory,
  setProjectMemory,
  deleteProjectMemory,
  restoreProjectMemory,
} = require('../services/memoryService');

const DEVICE_ID = process.env.DEVICE_ID || 'backend-primary';

function requestContext(req) {
  return {
    uid: req.user?.uid,
    deviceId: req.headers['x-device-id'] || DEVICE_ID,
    mode: 'http',
    source: 'rest',
  };
}

function handleError(error, res, next) {
  if (error instanceof MemoryServiceError) {
    return res.status(error.status).json({ error: error.message, code: error.code });
  }
  return next(error);
}

router.get('/global', async (req, res, next) => {
  try {
    const includeDeleted = req.query.includeDeleted === 'true';
    const result = await listGlobalMemory(requestContext(req), includeDeleted);
    return res.json(result);
  } catch (error) {
    return handleError(error, res, next);
  }
});

router.get('/global/:key', async (req, res, next) => {
  try {
    const includeDeleted = req.query.includeDeleted === 'true';
    const result = await getGlobalMemory(requestContext(req), req.params.key, includeDeleted);
    return res.json(result);
  } catch (error) {
    return handleError(error, res, next);
  }
});

router.post('/global', writeLimiter, async (req, res, next) => {
  try {
    const { key, value } = req.body;
    const result = await setGlobalMemory(requestContext(req), key, value);
    return res.json(result);
  } catch (error) {
    return handleError(error, res, next);
  }
});

router.delete('/global/:key', writeLimiter, async (req, res, next) => {
  try {
    const { reason, infection_id: infectionId } = req.body || {};
    const result = await deleteGlobalMemory(requestContext(req), req.params.key, reason, infectionId);
    return res.json(result);
  } catch (error) {
    return handleError(error, res, next);
  }
});

router.post('/global/:key/restore', writeLimiter, async (req, res, next) => {
  try {
    const result = await restoreGlobalMemory(requestContext(req), req.params.key);
    return res.json(result);
  } catch (error) {
    return handleError(error, res, next);
  }
});

router.get('/project/:projectId', async (req, res, next) => {
  try {
    const includeDeleted = req.query.includeDeleted === 'true';
    const result = await listProjectMemory(requestContext(req), req.params.projectId, includeDeleted);
    return res.json(result);
  } catch (error) {
    return handleError(error, res, next);
  }
});

router.get('/project/:projectId/:key', async (req, res, next) => {
  try {
    if (req.params.key === 'restore') {
      return next();
    }
    const includeDeleted = req.query.includeDeleted === 'true';
    const result = await getProjectMemory(requestContext(req), req.params.projectId, req.params.key, includeDeleted);
    return res.json(result);
  } catch (error) {
    return handleError(error, res, next);
  }
});

router.post('/project/:projectId', writeLimiter, async (req, res, next) => {
  try {
    const { key, value } = req.body;
    const result = await setProjectMemory(requestContext(req), req.params.projectId, key, value);
    return res.json(result);
  } catch (error) {
    return handleError(error, res, next);
  }
});

router.delete('/project/:projectId/:key', writeLimiter, async (req, res, next) => {
  try {
    const { reason, infection_id: infectionId } = req.body || {};
    const result = await deleteProjectMemory(
      requestContext(req),
      req.params.projectId,
      req.params.key,
      reason,
      infectionId,
    );
    return res.json(result);
  } catch (error) {
    return handleError(error, res, next);
  }
});

router.post('/project/:projectId/:key/restore', writeLimiter, async (req, res, next) => {
  try {
    const result = await restoreProjectMemory(requestContext(req), req.params.projectId, req.params.key);
    return res.json(result);
  } catch (error) {
    return handleError(error, res, next);
  }
});

module.exports = router;
