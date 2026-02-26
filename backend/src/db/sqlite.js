/**
 * Local SQLite cache layer.
 * Uses better-sqlite3 for synchronous, fast, offline-first storage.
 * DB file lives at backend/data/local_cache.db
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let db = null;

/** Ensure data directory exists and open the database */
function initSQLite() {
  const dataDir = path.join(__dirname, '..', '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const dbPath = path.join(dataDir, 'local_cache.db');
  db = new Database(dbPath);

  // Enable WAL mode for better concurrent performance
  db.pragma('journal_mode = WAL');

  // Create tables
  db.exec(`
    -- Global memory cache
    CREATE TABLE IF NOT EXISTS global_memory (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Per-project memory cache
    CREATE TABLE IF NOT EXISTS project_memory (
      project_id TEXT NOT NULL,
      key        TEXT NOT NULL,
      value      TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (project_id, key)
    );

    -- Offline queue: operations waiting to sync to Firebase
    CREATE TABLE IF NOT EXISTS sync_queue (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      collection TEXT NOT NULL,
      doc_path   TEXT NOT NULL,
      operation  TEXT NOT NULL CHECK(operation IN ('SET','DELETE')),
      payload    TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      synced     INTEGER DEFAULT 0
    );

    -- Device registry
    CREATE TABLE IF NOT EXISTS devices (
      device_id   TEXT PRIMARY KEY,
      device_name TEXT,
      last_sync   TEXT,
      status      TEXT DEFAULT 'offline'
    );
  `);

  console.log('💾  SQLite initialised at', dbPath);
}

/** Return the raw better-sqlite3 instance */
function getDB() {
  if (!db) throw new Error('SQLite not initialised. Call initSQLite() first.');
  return db;
}

// ── Global memory helpers ──────────────────────────────

function getGlobalMemory(key) {
  const row = getDB().prepare('SELECT value FROM global_memory WHERE key = ?').get(key);
  return row ? JSON.parse(row.value) : null;
}

function setGlobalMemory(key, value) {
  getDB().prepare(
    `INSERT INTO global_memory (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, JSON.stringify(value));
}

function getAllGlobalMemory() {
  const rows = getDB().prepare('SELECT key, value, updated_at FROM global_memory').all();
  return rows.map(r => ({ key: r.key, value: JSON.parse(r.value), updated_at: r.updated_at }));
}

// ── Project memory helpers ─────────────────────────────

function getProjectMemory(projectId, key) {
  const row = getDB().prepare(
    'SELECT value FROM project_memory WHERE project_id = ? AND key = ?'
  ).get(projectId, key);
  return row ? JSON.parse(row.value) : null;
}

function setProjectMemory(projectId, key, value) {
  getDB().prepare(
    `INSERT INTO project_memory (project_id, key, value, updated_at) VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(project_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(projectId, key, JSON.stringify(value));
}

function getAllProjectMemory(projectId) {
  const rows = getDB().prepare(
    'SELECT key, value, updated_at FROM project_memory WHERE project_id = ?'
  ).all(projectId);
  return rows.map(r => ({ key: r.key, value: JSON.parse(r.value), updated_at: r.updated_at }));
}

// ── Sync queue helpers ─────────────────────────────────

function enqueueSync(collection, docPath, operation, payload) {
  getDB().prepare(
    'INSERT INTO sync_queue (collection, doc_path, operation, payload) VALUES (?, ?, ?, ?)'
  ).run(collection, docPath, operation, payload ? JSON.stringify(payload) : null);
}

function getPendingSyncItems() {
  return getDB().prepare('SELECT * FROM sync_queue WHERE synced = 0 ORDER BY created_at ASC').all();
}

function markSynced(id) {
  getDB().prepare('UPDATE sync_queue SET synced = 1 WHERE id = ?').run(id);
}

module.exports = {
  initSQLite,
  getDB,
  getGlobalMemory,
  setGlobalMemory,
  getAllGlobalMemory,
  getProjectMemory,
  setProjectMemory,
  getAllProjectMemory,
  enqueueSync,
  getPendingSyncItems,
  markSynced,
};
