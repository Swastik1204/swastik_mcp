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
const projectRoutes = require('./routes/projects');
const mcpClientRoutes = require('./routes/mcpClients');
const adminRoutes = require('./routes/admin');
const { router: mcpRouter, bootstrapMcp } = require('./mcp/server');

// Middleware
const { requireAuth } = require('./middleware/auth');
const { apiLimiter } = require('./middleware/rateLimiter');
const { requestLogger } = require('./middleware/requestLogger');
const { errorEnvelope } = require('./middleware/errorEnvelope');

// Services
const { initSQLite } = require('./db/sqlite');
const { initFirebase } = require('./config/firebase');
const packageJson = require('../package.json');

const app = express();
const PORT = process.env.PORT || 3939;

console.log(`MCP BACKEND COLD START @ ${new Date().toISOString()}`);

// ── CORS — locked to allowed origins ──────────────────
const ALLOWED_ORIGINS = [
  'https://swastikmcp.web.app',
  'https://swastikmcp.firebaseapp.com',
  'http://localhost:5173',
  'http://localhost:3939',
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
app.use(morgan('dev'));         // Human-readable dev logs (coloured, suppressed in prod)
app.use(requestLogger);        // Structured JSON logs with traceId for every request

// ── Rate limiting ─────────────────────────────────────
app.use('/api', apiLimiter);

// ── Initialize backends ────────────────────────────────
initFirebase();
initSQLite();

// Bootstrap project/MCP client tables
const { ensureProjectTables } = require('./services/projectService');
ensureProjectTables();

bootstrapMcp({ mode: 'HTTP', initializeBackends: false });

// ── Public routes (no auth) ───────────────────────────
app.use('/api/health', healthRoutes);
app.use('/api/admin', adminRoutes);

// ── Auth-protected routes ─────────────────────────────
app.use('/api/memory', requireAuth, memoryRoutes);
app.use('/api/sync', requireAuth, syncRoutes);
app.use('/api/tools', requireAuth, toolRoutes);
app.use('/api/ai', requireAuth, aiRoutes);
app.use('/api/projects', requireAuth, projectRoutes);
app.use('/api/mcp/clients', requireAuth, mcpClientRoutes);
app.use('/api/mcp', requireAuth, mcpRouter);

// ── Global error handler — structured JSON envelope ────
// Must be registered AFTER all routes (Express convention).
// Returns: { ok, traceId, errorCode, humanMessage, detail? }
app.use(errorEnvelope);

// ── Start server ──────────────────────────────────────
app.listen(PORT, () => {
  const localApiBase = `http://localhost:${PORT}/api`;
  const localMcpBase = `http://localhost:${PORT}/api/mcp`;
  const renderBase = process.env.RENDER_EXTERNAL_URL || '<render-backend>.onrender.com';
  const prodApiBase = `${renderBase.replace(/\/$/, '')}/api`;
  const prodMcpBase = `${renderBase.replace(/\/$/, '')}/api/mcp`;

  console.log(`✅  MCP Backend running on http://localhost:${PORT}`);
  console.log(`🏷️  Version: ${process.env.RENDER_GIT_COMMIT || packageJson.version}`);
  console.log(`🔗 Local API: ${localApiBase}`);
  console.log(`🧠 Local MCP: ${localMcpBase}`);
  console.log(`🌐 Prod API: ${prodApiBase}`);
  console.log(`🌐 Prod MCP: ${prodMcpBase}`);
});
