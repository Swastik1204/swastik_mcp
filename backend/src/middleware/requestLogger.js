/**
 * requestLogger.js — Structured per-request logging middleware.
 *
 * Attaches a unique traceId to every request so logs can be correlated
 * across the request lifecycle (auth, tools, errors).
 *
 * Logged fields (JSON to stdout):
 *   level, traceId, method, path, status, durationMs, uid (if Auth), timestamp
 *
 * Structured JSON output makes it easy to filter in Render / logtail:
 *   { "level": "request", "traceId": "...", "status": 200, "durationMs": 42 }
 *
 * The traceId is also attached to:
 *   - req.traceId  (for use in errorEnvelope and route handlers)
 *   - res.setHeader('X-Trace-Id', ...)  (visible in browser Network tab)
 */

const { v4: uuidv4 } = require('uuid');

// Which events to include in structured log output
const STRUCTURED_EVENTS = ['mcp_connect', 'memory_add', 'memory_update', 'memory_delete', 'project_attach', 'project_detach'];

/**
 * Generates a traceId for each request and emits a structured JSON log line
 * once the response finishes.
 */
function requestLogger(req, res, next) {
  const traceId = uuidv4();
  const startMs = Date.now();

  // Attach to request so downstream handlers can reference it
  req.traceId = traceId;
  res.setHeader('X-Trace-Id', traceId);

  // Fire once the response is fully sent
  res.on('finish', () => {
    const durationMs = Date.now() - startMs;
    const uid = req.user?.uid || req.user?.email || null;

    const entry = {
      level: 'request',
      traceId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs,
      uid,
      timestamp: new Date().toISOString(),
    };

    // Emit as structured JSON for production log aggregation
    process.stdout.write(JSON.stringify(entry) + '\n');
  });

  next();
}

/**
 * logEvent(req, eventName, payload)
 *
 * Emits a structured event log entry for domain events such as
 * memory_add, mcp_connect, project_attach etc.
 *
 * Usage in a route handler:
 *   const { logEvent } = require('../middleware/requestLogger');
 *   logEvent(req, 'memory_add', { key: 'foo', projectId: null });
 */
function logEvent(req, eventName, payload = {}) {
  if (!STRUCTURED_EVENTS.includes(eventName)) {
    // Allow unknown events but flag them
    payload._unknownEvent = true;
  }

  const entry = {
    level: 'event',
    traceId: req?.traceId || 'no-trace',
    event: eventName,
    uid: req?.user?.uid || null,
    ...payload,
    timestamp: new Date().toISOString(),
  };

  process.stdout.write(JSON.stringify(entry) + '\n');
}

module.exports = { requestLogger, logEvent };
