/**
 * Memory routes — Global + Project memory CRUD + Tombstone Delete/Restore.
 *
 * Global memory:
 *   GET    /api/memory/global                  → list all (?includeDeleted=true)
 *   GET    /api/memory/global/:key             → get one
 *   POST   /api/memory/global                  → set { key, value }
 *   DELETE /api/memory/global/:key             → tombstone (owner-only)
 *   POST   /api/memory/global/:key/restore     → restore (owner-only)
 *
 * Project memory:
 *   GET    /api/memory/project/:projectId           → list all
 *   GET    /api/memory/project/:projectId/:key      → get one
 *   POST   /api/memory/project/:projectId           → set { key, value }
 *   DELETE /api/memory/project/:projectId/:key      → tombstone (owner-only)
 *   POST   /api/memory/project/:projectId/:key/restore → restore (owner-only)
 */

const { Router } = require('express');
const router = Router();

const { getFirestore } = require('../config/firebase');
const { requireOwner } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimiter');
const sqlite = require('../db/sqlite');

const DEVICE_ID = process.env.DEVICE_ID || 'backend-primary';

// ── Global Memory ──────────────────────────────────────

/** List all global memory entries */
router.get('/global', async (req, res, next) => {
  try {
    const includeDeleted = req.query.includeDeleted === 'true';
    // Try Firebase first; fall back to SQLite
    try {
      const ref = getFirestore().collection('global_memory');
      let query = includeDeleted ? ref : ref.where('deleted', '!=', true);
      const snap = await query.get();
      const items = snap.docs.map(d => ({ key: d.id, ...d.data() }));
      return res.json({ source: 'firebase', items });
    } catch {
      const items = sqlite.getAllGlobalMemory(includeDeleted);
      return res.json({ source: 'sqlite', items });
    }
  } catch (err) { next(err); }
});

/** Get a single global memory entry by key */
router.get('/global/:key', async (req, res, next) => {
  try {
    const { key } = req.params;
    try {
      const doc = await getFirestore().collection('global_memory').doc(key).get();
      if (doc.exists && !doc.data().deleted) {
        return res.json({ source: 'firebase', key, ...doc.data() });
      }
    } catch { /* fall through */ }

    const full = sqlite.getGlobalMemoryFull(key);
    if (full && !full.deleted) return res.json({ source: 'sqlite', key, ...full });

    return res.status(404).json({ error: 'Key not found' });
  } catch (err) { next(err); }
});

/** Set a global memory entry */
router.post('/global', writeLimiter, async (req, res, next) => {
  try {
    const { key, value } = req.body;
    if (!key || value === undefined) {
      return res.status(400).json({ error: 'key and value are required' });
    }

    const meta = {
      updated_by: req.user.uid,
      source_device_id: DEVICE_ID,
    };

    // Write to SQLite immediately (offline-first)
    const revision = sqlite.setGlobalMemory(key, value, meta);

    // Attempt Firebase write; queue if it fails
    const firestorePayload = {
      value,
      revision,
      updated_at: new Date().toISOString(),
      updated_by: req.user.uid,
      source_device_id: DEVICE_ID,
      deleted: false,
    };

    try {
      await getFirestore().collection('global_memory').doc(key).set(firestorePayload, { merge: true });
      return res.json({ status: 'synced', key, revision });
    } catch {
      sqlite.enqueueSync('global_memory', key, 'SET', firestorePayload);
      return res.json({ status: 'queued', key, revision });
    }
  } catch (err) { next(err); }
});

/** Tombstone-delete a global memory entry (owner-only) */
router.delete('/global/:key', requireOwner, writeLimiter, async (req, res, next) => {
  try {
    const { key } = req.params;
    const { reason, infection_id } = req.body || {};

    const meta = {
      deleted_by: req.user.uid,
      delete_reason: reason || 'Manual delete',
      infection_id: infection_id || null,
      source_device_id: DEVICE_ID,
    };

    const revision = sqlite.tombstoneGlobalMemory(key, meta);
    if (!revision) return res.status(404).json({ error: 'Key not found' });

    sqlite.logAudit('DELETE', 'global_memory', key, req.user.uid, meta);

    const tombstonePayload = {
      deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: req.user.uid,
      delete_reason: meta.delete_reason,
      infection_id: meta.infection_id,
      revision,
      updated_at: new Date().toISOString(),
      updated_by: req.user.uid,
      source_device_id: DEVICE_ID,
    };

    try {
      await getFirestore().collection('global_memory').doc(key).set(tombstonePayload, { merge: true });
      // Also log to Firestore logs collection
      await getFirestore().collection('logs').add({
        action: 'DELETE', collection: 'global_memory', doc_path: key,
        actor_uid: req.user.uid, details: meta,
        timestamp: new Date().toISOString(),
      });
      return res.json({ status: 'deleted', key, revision });
    } catch {
      sqlite.enqueueSync('global_memory', key, 'TOMBSTONE', tombstonePayload);
      return res.json({ status: 'queued-delete', key, revision });
    }
  } catch (err) { next(err); }
});

/** Restore a tombstoned global memory entry (owner-only) */
router.post('/global/:key/restore', requireOwner, writeLimiter, async (req, res, next) => {
  try {
    const { key } = req.params;
    const meta = { updated_by: req.user.uid, source_device_id: DEVICE_ID };

    const revision = sqlite.restoreGlobalMemory(key, meta);
    if (!revision) return res.status(404).json({ error: 'Key not found or not deleted' });

    sqlite.logAudit('RESTORE', 'global_memory', key, req.user.uid, {});

    const restorePayload = {
      deleted: false,
      deleted_at: null,
      deleted_by: null,
      delete_reason: null,
      infection_id: null,
      revision,
      updated_at: new Date().toISOString(),
      updated_by: req.user.uid,
      source_device_id: DEVICE_ID,
    };

    try {
      await getFirestore().collection('global_memory').doc(key).set(restorePayload, { merge: true });
      await getFirestore().collection('logs').add({
        action: 'RESTORE', collection: 'global_memory', doc_path: key,
        actor_uid: req.user.uid, timestamp: new Date().toISOString(),
      });
      return res.json({ status: 'restored', key, revision });
    } catch {
      sqlite.enqueueSync('global_memory', key, 'SET', restorePayload);
      return res.json({ status: 'queued-restore', key, revision });
    }
  } catch (err) { next(err); }
});

// ── Project Memory ─────────────────────────────────────

/** List all memory entries for a project */
router.get('/project/:projectId', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const includeDeleted = req.query.includeDeleted === 'true';
    try {
      const ref = getFirestore()
        .collection('project_memory').doc(projectId).collection('entries');
      let query = includeDeleted ? ref : ref.where('deleted', '!=', true);
      const snap = await query.get();
      const items = snap.docs.map(d => ({ key: d.id, ...d.data() }));
      return res.json({ source: 'firebase', projectId, items });
    } catch {
      const items = sqlite.getAllProjectMemory(projectId, includeDeleted);
      return res.json({ source: 'sqlite', projectId, items });
    }
  } catch (err) { next(err); }
});

/** Get a single project memory entry */
router.get('/project/:projectId/:key', async (req, res, next) => {
  try {
    const { projectId, key } = req.params;
    // Skip restore endpoint
    if (key === 'restore') return next();
    try {
      const doc = await getFirestore()
        .collection('project_memory').doc(projectId)
        .collection('entries').doc(key).get();
      if (doc.exists && !doc.data().deleted) {
        return res.json({ source: 'firebase', projectId, key, ...doc.data() });
      }
    } catch { /* fall through */ }

    const full = sqlite.getProjectMemoryFull(projectId, key);
    if (full && !full.deleted) return res.json({ source: 'sqlite', projectId, key, ...full });

    return res.status(404).json({ error: 'Key not found' });
  } catch (err) { next(err); }
});

/** Set a project memory entry */
router.post('/project/:projectId', writeLimiter, async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { key, value } = req.body;
    if (!key || value === undefined) {
      return res.status(400).json({ error: 'key and value are required' });
    }

    const meta = { updated_by: req.user.uid, source_device_id: DEVICE_ID };
    const revision = sqlite.setProjectMemory(projectId, key, value, meta);

    const firestorePayload = {
      value,
      revision,
      updated_at: new Date().toISOString(),
      updated_by: req.user.uid,
      source_device_id: DEVICE_ID,
      deleted: false,
    };

    try {
      await getFirestore()
        .collection('project_memory').doc(projectId)
        .collection('entries').doc(key)
        .set(firestorePayload, { merge: true });
      return res.json({ status: 'synced', projectId, key, revision });
    } catch {
      sqlite.enqueueSync('project_memory', `${projectId}/entries/${key}`, 'SET', firestorePayload);
      return res.json({ status: 'queued', projectId, key, revision });
    }
  } catch (err) { next(err); }
});

/** Tombstone-delete a project memory entry (owner-only) */
router.delete('/project/:projectId/:key', requireOwner, writeLimiter, async (req, res, next) => {
  try {
    const { projectId, key } = req.params;
    const { reason, infection_id } = req.body || {};

    const meta = {
      deleted_by: req.user.uid,
      delete_reason: reason || 'Manual delete',
      infection_id: infection_id || null,
      source_device_id: DEVICE_ID,
    };

    const revision = sqlite.tombstoneProjectMemory(projectId, key, meta);
    if (!revision) return res.status(404).json({ error: 'Key not found' });

    sqlite.logAudit('DELETE', 'project_memory', `${projectId}/${key}`, req.user.uid, meta);

    const tombstonePayload = {
      deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: req.user.uid,
      delete_reason: meta.delete_reason,
      infection_id: meta.infection_id,
      revision,
      updated_at: new Date().toISOString(),
      updated_by: req.user.uid,
      source_device_id: DEVICE_ID,
    };

    try {
      await getFirestore()
        .collection('project_memory').doc(projectId)
        .collection('entries').doc(key)
        .set(tombstonePayload, { merge: true });
      await getFirestore().collection('logs').add({
        action: 'DELETE', collection: 'project_memory',
        doc_path: `${projectId}/${key}`, actor_uid: req.user.uid,
        details: meta, timestamp: new Date().toISOString(),
      });
      return res.json({ status: 'deleted', projectId, key, revision });
    } catch {
      sqlite.enqueueSync('project_memory', `${projectId}/entries/${key}`, 'TOMBSTONE', tombstonePayload);
      return res.json({ status: 'queued-delete', projectId, key, revision });
    }
  } catch (err) { next(err); }
});

/** Restore a tombstoned project memory entry (owner-only) */
router.post('/project/:projectId/:key/restore', requireOwner, writeLimiter, async (req, res, next) => {
  try {
    const { projectId, key } = req.params;
    const meta = { updated_by: req.user.uid, source_device_id: DEVICE_ID };

    const revision = sqlite.restoreProjectMemory(projectId, key, meta);
    if (!revision) return res.status(404).json({ error: 'Key not found or not deleted' });

    sqlite.logAudit('RESTORE', 'project_memory', `${projectId}/${key}`, req.user.uid, {});

    const restorePayload = {
      deleted: false, deleted_at: null, deleted_by: null,
      delete_reason: null, infection_id: null,
      revision,
      updated_at: new Date().toISOString(),
      updated_by: req.user.uid,
      source_device_id: DEVICE_ID,
    };

    try {
      await getFirestore()
        .collection('project_memory').doc(projectId)
        .collection('entries').doc(key)
        .set(restorePayload, { merge: true });
      await getFirestore().collection('logs').add({
        action: 'RESTORE', collection: 'project_memory',
        doc_path: `${projectId}/${key}`, actor_uid: req.user.uid,
        timestamp: new Date().toISOString(),
      });
      return res.json({ status: 'restored', projectId, key, revision });
    } catch {
      sqlite.enqueueSync('project_memory', `${projectId}/entries/${key}`, 'SET', restorePayload);
      return res.json({ status: 'queued-restore', projectId, key, revision });
    }
  } catch (err) { next(err); }
});

module.exports = router;
