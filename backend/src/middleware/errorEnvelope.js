/**
 * errorEnvelope.js — Centralised error-handling middleware for Express.
 *
 * Every unhandled error thrown (or passed via next(err)) is normalised into
 * a predictable JSON envelope so clients always know where to look:
 *
 *   {
 *     "ok": false,
 *     "traceId": "abc123",
 *     "errorCode": "VALIDATION_ERROR",
 *     "humanMessage": "projectId is required.",
 *     "detail": "..."          // dev-only stack / original message
 *   }
 *
 * HTTP status resolution order:
 *   1. err.status / err.statusCode
 *   2. Numeric first argument to next(statusCode)
 *   3. 500
 *
 * To throw a handled error from a route:
 *   const err = new Error('Project not found');
 *   err.status = 404;
 *   err.errorCode = 'PROJECT_NOT_FOUND';
 *   throw err;   // or next(err)
 *
 * Helper: createApiError(message, status, errorCode)
 */

const { v4: uuidv4 } = require('uuid');

// ── Error code map ────────────────────────────────────────────────────────────
// Maps HTTP status → a sensible default error code for unknown errors.
const DEFAULT_ERROR_CODE = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
  502: 'BAD_GATEWAY',
  503: 'SERVICE_UNAVAILABLE',
};

// ── humanMessage helpers ───────────────────────────────────────────────────────
const DEFAULT_HUMAN_MESSAGE = {
  400: 'The request was malformed or missing required fields.',
  401: 'Authentication is required. Please sign in.',
  403: 'You do not have permission to perform this action.',
  404: 'The requested resource was not found.',
  409: 'A conflict occurred. The resource may already exist.',
  422: 'The request could not be processed due to validation errors.',
  429: 'Too many requests. Please slow down.',
  500: 'An unexpected server error occurred. Please try again.',
  503: 'The service is temporarily unavailable.',
};

// ── Middleware ────────────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
function errorEnvelope(err, req, res, next) {
  const status =
    err.status ||
    err.statusCode ||
    (typeof err === 'number' ? err : 500);

  const traceId = req.traceId || uuidv4();
  const isDev = process.env.NODE_ENV !== 'production';

  const errorCode =
    err.errorCode ||
    DEFAULT_ERROR_CODE[status] ||
    'INTERNAL_ERROR';

  const humanMessage =
    err.humanMessage ||
    (isDev ? err.message : null) ||
    DEFAULT_HUMAN_MESSAGE[status] ||
    'An unexpected error occurred.';

  // Log to console — structured for easier Render/logtail parsing
  console.error(JSON.stringify({
    level: 'error',
    traceId,
    errorCode,
    status,
    method: req.method,
    path: req.path,
    message: err.message || String(err),
    stack: isDev ? err.stack : undefined,
    timestamp: new Date().toISOString(),
  }));

  const body = {
    ok: false,
    traceId,
    errorCode,
    humanMessage,
  };

  // Only expose stack / raw message in development
  if (isDev && err.stack) {
    body.detail = err.stack;
  }

  res.status(typeof status === 'number' ? status : 500).json(body);
}

// ── Factory helper — use in route handlers ────────────────────────────────────
/**
 * createApiError(message, status?, errorCode?, humanMessage?)
 * Returns an Error object pre-decorated for errorEnvelope.
 */
function createApiError(message, status = 500, errorCode, humanMessage) {
  const err = new Error(message);
  err.status = status;
  if (errorCode)    err.errorCode    = errorCode;
  if (humanMessage) err.humanMessage = humanMessage;
  return err;
}

module.exports = { errorEnvelope, createApiError };
