/**
 * Firebase Auth middleware.
 * Verifies the Firebase ID token from the Authorization header.
 *
 * Usage:
 *   app.use('/api', requireAuth);          // protect all /api routes
 *   router.delete('/:key', requireOwner);  // owner-only destructive ops
 *
 * Attaches req.user = { uid, email, ... } on success.
 */

const admin = require('firebase-admin');

/**
 * Verify Firebase ID token.
 * Expects header: Authorization: Bearer <idToken>
 * Skips /api/health (public).
 */
async function requireAuth(req, res, next) {
  // Allow health check without auth
  if (req.path === '/health' || req.path === '/api/health') {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const idToken = authHeader.split('Bearer ')[1];

  // ── Agent secret bypass ───────────────────────────────
  // If AGENT_SECRET is set and the token matches, treat the caller as the
  // owner so the local sync agent can reach auth-protected endpoints without
  // a Firebase ID token.
  const agentSecret = process.env.AGENT_SECRET;
  if (agentSecret && idToken === agentSecret) {
    const ownerUid = process.env.OWNER_UID || 'agent';
    req.user = { uid: ownerUid, email: null, name: 'agent' };
    return next();
  }

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.user = {
      uid: decoded.uid,
      email: decoded.email || null,
      name: decoded.name || null,
    };
    next();
  } catch (err) {
    console.error('[AUTH] Token verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Owner-only gate.
 * Must be used AFTER requireAuth.
 * Checks req.user.uid against OWNER_UID env var.
 */
function requireOwner(req, res, next) {
  const ownerUid = process.env.OWNER_UID;

  if (!ownerUid) {
    console.error('[AUTH] OWNER_UID not set — blocking owner-only action');
    return res.status(500).json({ error: 'Server misconfigured: OWNER_UID not set' });
  }

  if (!req.user || req.user.uid !== ownerUid) {
    return res.status(403).json({ error: 'Forbidden — owner-only action' });
  }

  next();
}

module.exports = { requireAuth, requireOwner };
