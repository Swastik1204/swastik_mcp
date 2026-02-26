/**
 * ====================================
 * Swastik MCP Backend — Entry Point
 * ====================================
 * Express.js API server for the MCP brain.
 * Handles memory CRUD, sync, tool registry, and AI routing.
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

// Services
const { initSQLite } = require('./db/sqlite');
const { initFirebase } = require('./config/firebase');

const app = express();
const PORT = process.env.PORT || 4000;

// ── Middleware ─────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// ── Initialize backends ────────────────────────────────
initFirebase();
initSQLite();

// ── Routes ─────────────────────────────────────────────
app.use('/api/health', healthRoutes);
app.use('/api/memory', memoryRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/tools', toolRoutes);
app.use('/api/ai', aiRoutes);

// ── Global error handler ──────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: err.message });
});

// ── Start server ──────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅  MCP Backend running on http://localhost:${PORT}`);
});
