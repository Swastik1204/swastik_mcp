/**
 * Memory routes — Global + Project memory CRUD.
 *
 * Global memory:
 *   GET    /api/memory/global           → list all
 *   GET    /api/memory/global/:key      → get one
 *   POST   /api/memory/global           → set { key, value }
 *
 * Project memory:
 *   GET    /api/memory/project/:projectId           → list all for project
 *   GET    /api/memory/project/:projectId/:key      → get one
 *   POST   /api/memory/project/:projectId           → set { key, value }
 */

const { Router } = require('express');
const router = Router();

const { getFirestore } = require('../config/firebase');
const sqlite = require('../db/sqlite');

// ── Global Memory ──────────────────────────────────────

/** List all global memory entries */
router.get('/global', async (_req, res, next) => {
  try {
    // Try Firebase first; fall back to SQLite
    try {
      const snap = await getFirestore().collection('global_memory').get();
      const items = snap.docs.map(d => ({ key: d.id, ...d.data() }));
      return res.json({ source: 'firebase', items });
    } catch {
      const items = sqlite.getAllGlobalMemory();
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
      if (doc.exists) return res.json({ source: 'firebase', key, value: doc.data().value });
    } catch { /* fall through */ }

    const value = sqlite.getGlobalMemory(key);
    if (value !== null) return res.json({ source: 'sqlite', key, value });

    return res.status(404).json({ error: 'Key not found' });
  } catch (err) { next(err); }
});

/** Set a global memory entry */
router.post('/global', async (req, res, next) => {
  try {
    const { key, value } = req.body;
    if (!key || value === undefined) {
      return res.status(400).json({ error: 'key and value are required' });
    }

    // Write to SQLite immediately (offline-first)
    sqlite.setGlobalMemory(key, value);

    // Attempt Firebase write; queue if it fails
    try {
      await getFirestore().collection('global_memory').doc(key).set({
        value,
        updated_at: new Date().toISOString(),
      }, { merge: true });
      return res.json({ status: 'synced', key });
    } catch {
      sqlite.enqueueSync('global_memory', key, 'SET', { value });
      return res.json({ status: 'queued', key });
    }
  } catch (err) { next(err); }
});

// ── Project Memory ─────────────────────────────────────

/** List all memory entries for a project */
router.get('/project/:projectId', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    try {
      const snap = await getFirestore()
        .collection('project_memory').doc(projectId)
        .collection('entries').get();
      const items = snap.docs.map(d => ({ key: d.id, ...d.data() }));
      return res.json({ source: 'firebase', projectId, items });
    } catch {
      const items = sqlite.getAllProjectMemory(projectId);
      return res.json({ source: 'sqlite', projectId, items });
    }
  } catch (err) { next(err); }
});

/** Get a single project memory entry */
router.get('/project/:projectId/:key', async (req, res, next) => {
  try {
    const { projectId, key } = req.params;
    try {
      const doc = await getFirestore()
        .collection('project_memory').doc(projectId)
        .collection('entries').doc(key).get();
      if (doc.exists) return res.json({ source: 'firebase', projectId, key, value: doc.data().value });
    } catch { /* fall through */ }

    const value = sqlite.getProjectMemory(projectId, key);
    if (value !== null) return res.json({ source: 'sqlite', projectId, key, value });

    return res.status(404).json({ error: 'Key not found' });
  } catch (err) { next(err); }
});

/** Set a project memory entry */
router.post('/project/:projectId', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { key, value } = req.body;
    if (!key || value === undefined) {
      return res.status(400).json({ error: 'key and value are required' });
    }

    // Write to SQLite (offline-first)
    sqlite.setProjectMemory(projectId, key, value);

    // Attempt Firebase write
    try {
      await getFirestore()
        .collection('project_memory').doc(projectId)
        .collection('entries').doc(key)
        .set({ value, updated_at: new Date().toISOString() }, { merge: true });
      return res.json({ status: 'synced', projectId, key });
    } catch {
      sqlite.enqueueSync('project_memory', `${projectId}/entries/${key}`, 'SET', { value });
      return res.json({ status: 'queued', projectId, key });
    }
  } catch (err) { next(err); }
});

module.exports = router;
