/**
 * ====================================
 * Swastik MCP Backend — Entry Point
 * ====================================
 * Express.js API server for the MCP brain.
 * Handles memory CRUD, sync, tool registry, and AI routing.
 * Protected by Firebase Auth + rate limiting.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

// Route imports
const healthRoutes = require('./routes/health');
const memoryRoutes = require('./routes/memory');
const syncRoutes = require('./routes/sync');
const toolRoutes = require('./routes/tools');
const aiRoutes = require('./routes/ai');
const { router: mcpRouter } = require('./mcp/server');

// Middleware
const { requireAuth } = require('./middleware/auth');
const { apiLimiter } = require('./middleware/rateLimiter');

// Services
const { initSQLite } = require('./db/sqlite');
const { initFirebase } = require('./config/firebase');

const app = express();
const PORT = process.env.PORT || 4000;

// ── CORS — locked to allowed origins ──────────────────
const ALLOWED_ORIGINS = [
  'https://swastikmcp.web.app',
  'https://swastikmcp.firebaseapp.com',
  'http://localhost:5173',
  'http://localhost:4000',
];
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, Postman, MCP clients)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));

app.use(express.json());
app.use(morgan('dev'));

// ── Rate limiting ─────────────────────────────────────
app.use('/api', apiLimiter);

// ── Initialize backends ────────────────────────────────
initFirebase();
initSQLite();

// ── Public routes (no auth) ───────────────────────────
app.use('/api/health', healthRoutes);

// ── Auth-protected routes ─────────────────────────────
app.use('/api/memory', requireAuth, memoryRoutes);
app.use('/api/sync', requireAuth, syncRoutes);
app.use('/api/tools', requireAuth, toolRoutes);
app.use('/api/ai', requireAuth, aiRoutes);
app.use('/api/mcp', requireAuth, mcpRouter);

// ── Global error handler ──────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: err.message });
});

// ── Start server ──────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅  MCP Backend running on http://localhost:${PORT}`);
});
