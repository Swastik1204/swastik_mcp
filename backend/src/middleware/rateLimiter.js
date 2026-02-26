/**
 * Rate limiter middleware.
 * Prevents abuse on public-facing API endpoints.
 */

const rateLimit = require('express-rate-limit');

/** General API rate limiter: 100 requests per minute per IP */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please try again later' },
});

/** Stricter limiter for write operations: 30 per minute */
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Write rate limit exceeded — please slow down' },
});

module.exports = { apiLimiter, writeLimiter };
