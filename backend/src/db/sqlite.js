/**
 * Local SQLite cache layer — with tombstone support.
 * Uses better-sqlite3 for synchronous, fast, offline-first storage.
 * DB file lives at backend/data/local_cache.db
 *
 * Tombstone fields: deleted, deleted_at, deleted_by, delete_reason,
 *                   infection_id, revision, updated_by, source_device_id
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let db = null;

/** Ensure data directory exists, open DB, and run migrations */
function initSQLite() {
  const dataDir = path.join(__dirname, '..', '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const dbPath = path.join(dataDir, 'local_cache.db');
  db = new Database(dbPath);

  // Enable WAL mode for better concurrent performance
  db.pragma('journal_mode = WAL');

  // Run migrations
  migrate();

  console.log('💾  SQLite initialised at', dbPath);
}

/** Create tables + migrate existing ones to add tombstone columns */
function migrate() {
  db.exec(`
    -- Global memory cache (with tombstone support)
    CREATE TABLE IF NOT EXISTS global_memory (
      key              TEXT PRIMARY KEY,
      value            TEXT NOT NULL,
      revision         INTEGER DEFAULT 1,
      updated_at       TEXT DEFAULT (datetime('now')),
      updated_by       TEXT,
      source_device_id TEXT,
      deleted          INTEGER DEFAULT 0,
      deleted_at       TEXT,
      deleted_by       TEXT,
      delete_reason    TEXT,
      infection_id     TEXT
    );

    -- Per-project memory cache (with tombstone support)
    CREATE TABLE IF NOT EXISTS project_memory (
      project_id       TEXT NOT NULL,
      key              TEXT NOT NULL,
      value            TEXT NOT NULL,
      revision         INTEGER DEFAULT 1,
      updated_at       TEXT DEFAULT (datetime('now')),
      updated_by       TEXT,
      source_device_id TEXT,
      deleted          INTEGER DEFAULT 0,
      deleted_at       TEXT,
      deleted_by       TEXT,
      delete_reason    TEXT,
      infection_id     TEXT,
      PRIMARY KEY (project_id, key)
    );

    -- Offline queue: operations waiting to sync to Firebase
    CREATE TABLE IF NOT EXISTS sync_queue (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      collection   TEXT NOT NULL,
      doc_path     TEXT NOT NULL,
      operation    TEXT NOT NULL CHECK(operation IN ('SET','DELETE','TOMBSTONE')),
      payload      TEXT,
      created_at   TEXT DEFAULT (datetime('now')),
      synced       INTEGER DEFAULT 0,
      retry_count  INTEGER DEFAULT 0,
      last_error   TEXT,
      dead_letter  INTEGER DEFAULT 0
    );

    -- Device registry + last sync cursor
    CREATE TABLE IF NOT EXISTS devices (
      device_id   TEXT PRIMARY KEY,
      device_name TEXT,
      last_sync   TEXT,
      status      TEXT DEFAULT 'offline',
      platform    TEXT
    );

    -- Audit log for delete/restore actions
    CREATE TABLE IF NOT EXISTS audit_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      action     TEXT NOT NULL,
      collection TEXT,
      doc_path   TEXT,
      actor_uid  TEXT,
      details    TEXT,
      timestamp  TEXT DEFAULT (datetime('now'))
    );
  `);

  // ── Column migrations for existing databases ────────
  const migrateCols = [
    { table: 'global_memory', col: 'revision',         type: 'INTEGER DEFAULT 1' },
    { table: 'global_memory', col: 'updated_by',       type: 'TEXT' },
    { table: 'global_memory', col: 'source_device_id', type: 'TEXT' },
    { table: 'global_memory', col: 'deleted',          type: 'INTEGER DEFAULT 0' },
    { table: 'global_memory', col: 'deleted_at',       type: 'TEXT' },
    { table: 'global_memory', col: 'deleted_by',       type: 'TEXT' },
    { table: 'global_memory', col: 'delete_reason',    type: 'TEXT' },
    { table: 'global_memory', col: 'infection_id',     type: 'TEXT' },
    { table: 'project_memory', col: 'revision',         type: 'INTEGER DEFAULT 1' },
    { table: 'project_memory', col: 'updated_by',       type: 'TEXT' },
    { table: 'project_memory', col: 'source_device_id', type: 'TEXT' },
    { table: 'project_memory', col: 'deleted',          type: 'INTEGER DEFAULT 0' },
    { table: 'project_memory', col: 'deleted_at',       type: 'TEXT' },
    { table: 'project_memory', col: 'deleted_by',       type: 'TEXT' },
    { table: 'project_memory', col: 'delete_reason',    type: 'TEXT' },
    { table: 'project_memory', col: 'infection_id',     type: 'TEXT' },
    { table: 'sync_queue', col: 'retry_count', type: 'INTEGER DEFAULT 0' },
    { table: 'sync_queue', col: 'last_error',  type: 'TEXT' },
    { table: 'sync_queue', col: 'dead_letter', type: 'INTEGER DEFAULT 0' },
  ];

  for (const { table, col, type } of migrateCols) {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
    } catch {
      // Column already exists — safe to ignore
    }
  }
}

/** Return the raw better-sqlite3 instance */
function getDB() {
  if (!db) throw new Error('SQLite not initialised. Call initSQLite() first.');
  return db;
}

// ── Global memory helpers ──────────────────────────────

function getGlobalMemory(key) {
  const row = getDB().prepare(
    'SELECT value, revision, deleted FROM global_memory WHERE key = ?'
  ).get(key);
  if (!row || row.deleted) return null;
  return JSON.parse(row.value);
}

function getGlobalMemoryFull(key) {
  const row = getDB().prepare('SELECT * FROM global_memory WHERE key = ?').get(key);
  if (!row) return null;
  return { ...row, value: JSON.parse(row.value) };
}

function setGlobalMemory(key, value, meta = {}) {
  const existing = getDB().prepare('SELECT revision FROM global_memory WHERE key = ?').get(key);
  const nextRev = existing ? (existing.revision || 0) + 1 : 1;

  getDB().prepare(
    `INSERT INTO global_memory (key, value, revision, updated_at, updated_by, source_device_id, deleted)
     VALUES (?, ?, ?, datetime('now'), ?, ?, 0)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       revision = ?,
       updated_at = datetime('now'),
       updated_by = excluded.updated_by,
       source_device_id = excluded.source_device_id,
       deleted = 0, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, infection_id = NULL`
  ).run(
    key, JSON.stringify(value), nextRev,
    meta.updated_by || null, meta.source_device_id || null,
    nextRev
  );
  return nextRev;
}

function tombstoneGlobalMemory(key, meta = {}) {
  const existing = getDB().prepare('SELECT revision FROM global_memory WHERE key = ?').get(key);
  if (!existing) return null;
  const nextRev = (existing.revision || 0) + 1;

  getDB().prepare(
    `UPDATE global_memory SET
       deleted = 1, deleted_at = datetime('now'), deleted_by = ?,
       delete_reason = ?, infection_id = ?, revision = ?,
       updated_at = datetime('now'), updated_by = ?, source_device_id = ?
     WHERE key = ?`
  ).run(
    meta.deleted_by || null, meta.delete_reason || null,
    meta.infection_id || null, nextRev,
    meta.deleted_by || null, meta.source_device_id || null,
    key
  );
  return nextRev;
}

function restoreGlobalMemory(key, meta = {}) {
  const existing = getDB().prepare('SELECT revision, deleted FROM global_memory WHERE key = ?').get(key);
  if (!existing || !existing.deleted) return null;
  const nextRev = (existing.revision || 0) + 1;

  getDB().prepare(
    `UPDATE global_memory SET
       deleted = 0, deleted_at = NULL, deleted_by = NULL,
       delete_reason = NULL, infection_id = NULL, revision = ?,
       updated_at = datetime('now'), updated_by = ?, source_device_id = ?
     WHERE key = ?`
  ).run(nextRev, meta.updated_by || null, meta.source_device_id || null, key);
  return nextRev;
}

function getAllGlobalMemory(includeDeleted = false) {
  const sql = includeDeleted
    ? 'SELECT * FROM global_memory ORDER BY updated_at DESC'
    : 'SELECT * FROM global_memory WHERE deleted = 0 ORDER BY updated_at DESC';
  const rows = getDB().prepare(sql).all();
  return rows.map(r => ({ ...r, value: JSON.parse(r.value) }));
}

// ── Project memory helpers ─────────────────────────────

function getProjectMemory(projectId, key) {
  const row = getDB().prepare(
    'SELECT value, revision, deleted FROM project_memory WHERE project_id = ? AND key = ?'
  ).get(projectId, key);
  if (!row || row.deleted) return null;
  return JSON.parse(row.value);
}

function getProjectMemoryFull(projectId, key) {
  const row = getDB().prepare(
    'SELECT * FROM project_memory WHERE project_id = ? AND key = ?'
  ).get(projectId, key);
  if (!row) return null;
  return { ...row, value: JSON.parse(row.value) };
}

function setProjectMemory(projectId, key, value, meta = {}) {
  const existing = getDB().prepare(
    'SELECT revision FROM project_memory WHERE project_id = ? AND key = ?'
  ).get(projectId, key);
  const nextRev = existing ? (existing.revision || 0) + 1 : 1;

  getDB().prepare(
    `INSERT INTO project_memory (project_id, key, value, revision, updated_at, updated_by, source_device_id, deleted)
     VALUES (?, ?, ?, ?, datetime('now'), ?, ?, 0)
     ON CONFLICT(project_id, key) DO UPDATE SET
       value = excluded.value,
       revision = ?,
       updated_at = datetime('now'),
       updated_by = excluded.updated_by,
       source_device_id = excluded.source_device_id,
       deleted = 0, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, infection_id = NULL`
  ).run(
    projectId, key, JSON.stringify(value), nextRev,
    meta.updated_by || null, meta.source_device_id || null,
    nextRev
  );
  return nextRev;
}

function tombstoneProjectMemory(projectId, key, meta = {}) {
  const existing = getDB().prepare(
    'SELECT revision FROM project_memory WHERE project_id = ? AND key = ?'
  ).get(projectId, key);
  if (!existing) return null;
  const nextRev = (existing.revision || 0) + 1;

  getDB().prepare(
    `UPDATE project_memory SET
       deleted = 1, deleted_at = datetime('now'), deleted_by = ?,
       delete_reason = ?, infection_id = ?, revision = ?,
       updated_at = datetime('now'), updated_by = ?, source_device_id = ?
     WHERE project_id = ? AND key = ?`
  ).run(
    meta.deleted_by || null, meta.delete_reason || null,
    meta.infection_id || null, nextRev,
    meta.deleted_by || null, meta.source_device_id || null,
    projectId, key
  );
  return nextRev;
}

function restoreProjectMemory(projectId, key, meta = {}) {
  const existing = getDB().prepare(
    'SELECT revision, deleted FROM project_memory WHERE project_id = ? AND key = ?'
  ).get(projectId, key);
  if (!existing || !existing.deleted) return null;
  const nextRev = (existing.revision || 0) + 1;

  getDB().prepare(
    `UPDATE project_memory SET
       deleted = 0, deleted_at = NULL, deleted_by = NULL,
       delete_reason = NULL, infection_id = NULL, revision = ?,
       updated_at = datetime('now'), updated_by = ?, source_device_id = ?
     WHERE project_id = ? AND key = ?`
  ).run(nextRev, meta.updated_by || null, meta.source_device_id || null, projectId, key);
  return nextRev;
}

function getAllProjectMemory(projectId, includeDeleted = false) {
  const sql = includeDeleted
    ? 'SELECT * FROM project_memory WHERE project_id = ? ORDER BY updated_at DESC'
    : 'SELECT * FROM project_memory WHERE project_id = ? AND deleted = 0 ORDER BY updated_at DESC';
  const rows = getDB().prepare(sql).all(projectId);
  return rows.map(r => ({ ...r, value: JSON.parse(r.value) }));
}

// ── Sync queue helpers ─────────────────────────────────

function enqueueSync(collection, docPath, operation, payload) {
  getDB().prepare(
    'INSERT INTO sync_queue (collection, doc_path, operation, payload) VALUES (?, ?, ?, ?)'
  ).run(collection, docPath, operation, payload ? JSON.stringify(payload) : null);
}

function getPendingSyncItems() {
  return getDB().prepare(
    'SELECT * FROM sync_queue WHERE synced = 0 AND dead_letter = 0 ORDER BY created_at ASC'
  ).all();
}

function markSynced(id) {
  getDB().prepare('UPDATE sync_queue SET synced = 1 WHERE id = ?').run(id);
}

function markSyncFailed(id, error) {
  getDB().prepare(
    `UPDATE sync_queue SET retry_count = retry_count + 1, last_error = ?,
     dead_letter = CASE WHEN retry_count >= 4 THEN 1 ELSE 0 END WHERE id = ?`
  ).run(error, id);
}

function getDeadLetterItems() {
  return getDB().prepare('SELECT * FROM sync_queue WHERE dead_letter = 1').all();
}

// ── Device helpers ────────────────────────────────────

function upsertDevice(deviceId, meta = {}) {
  getDB().prepare(
    `INSERT INTO devices (device_id, device_name, last_sync, status, platform)
     VALUES (?, ?, datetime('now'), 'online', ?)
     ON CONFLICT(device_id) DO UPDATE SET
       device_name = COALESCE(excluded.device_name, devices.device_name),
       last_sync = datetime('now'),
       status = 'online',
       platform = COALESCE(excluded.platform, devices.platform)`
  ).run(deviceId, meta.device_name || null, meta.platform || null);
}

function getDeviceLastSync(deviceId) {
  const row = getDB().prepare('SELECT last_sync FROM devices WHERE device_id = ?').get(deviceId);
  return row ? row.last_sync : null;
}

function updateDeviceLastSync(deviceId) {
  getDB().prepare(
    `UPDATE devices SET last_sync = datetime('now') WHERE device_id = ?`
  ).run(deviceId);
}

function getAllDevices() {
  return getDB().prepare('SELECT * FROM devices ORDER BY last_sync DESC').all();
}

// ── Audit log ──────────────────────────────────────────

function logAudit(action, collection, docPath, actorUid, details) {
  getDB().prepare(
    'INSERT INTO audit_log (action, collection, doc_path, actor_uid, details) VALUES (?, ?, ?, ?, ?)'
  ).run(action, collection, docPath, actorUid, details ? JSON.stringify(details) : null);
}

function getAuditLog(limit = 50) {
  return getDB().prepare('SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?').all(limit);
}

module.exports = {
  initSQLite,
  getDB,
  // Global memory
  getGlobalMemory,
  getGlobalMemoryFull,
  setGlobalMemory,
  tombstoneGlobalMemory,
  restoreGlobalMemory,
  getAllGlobalMemory,
  // Project memory
  getProjectMemory,
  getProjectMemoryFull,
  setProjectMemory,
  tombstoneProjectMemory,
  restoreProjectMemory,
  getAllProjectMemory,
  // Sync queue
  enqueueSync,
  getPendingSyncItems,
  markSynced,
  markSyncFailed,
  getDeadLetterItems,
  // Devices
  upsertDevice,
  getDeviceLastSync,
  updateDeviceLastSync,
  getAllDevices,
  // Audit
  logAudit,
  getAuditLog,
};
