/**
 * Sync Engine v2 — tombstone-aware two-way sync between SQLite and Firebase.
 *
 * syncPush():    Flush queued writes to Firebase with retry + dead-letter.
 * syncPull(deviceId):  Incremental pull from Firebase using per-device cursor.
 * getSyncStatus():     Queue depth + dead-letter count.
 * retryDeadLetters():  Re-attempt dead-letter items once.
 *
 * Key invariants:
 *   - Tombstones propagate; a deleted entry must never be resurrected by a stale pull.
 *   - Revisions are monotonically increasing; higher revision always wins.
 *   - Dead-letter items (retry_count >= MAX_RETRIES) are parked, not replayed automatically.
 */

const { getFirestore } = require('../config/firebase');
const sqlite = require('../db/sqlite');

const MAX_RETRIES = 5;
const DEVICE_ID = process.env.DEVICE_ID || 'backend-primary';

// ── Helpers ────────────────────────────────────────────

/** Resolve a Firestore doc ref from collection + doc_path (supports nested paths) */
function resolveRef(db, collection, docPath) {
  const parts = docPath.split('/');
  if (parts.length === 1) {
    return db.collection(collection).doc(parts[0]);
  }
  // nested: project_memory  →  doc(projectId)/collection(entries)/doc(key)
  let ref = db.collection(collection);
  for (let i = 0; i < parts.length; i++) {
    ref = i % 2 === 0 ? ref.doc(parts[i]) : ref.collection(parts[i]);
  }
  return ref;
}

// ── Push ───────────────────────────────────────────────

/**
 * Push all pending (non-dead-letter) sync items to Firebase.
 * On failure, increment retry_count and record last_error.
 * After MAX_RETRIES the item becomes a dead letter.
 */
async function syncPush() {
  const pending = sqlite.getPendingSyncItems();       // excludes dead-letter
  let synced = 0;
  let failed = 0;

  let db;
  try { db = getFirestore(); } catch {
    return { synced: 0, failed: pending.length, remaining: pending.length, error: 'Firebase unavailable' };
  }

  for (const item of pending) {
    try {
      const payload = item.payload ? JSON.parse(item.payload) : {};

      if (item.operation === 'SET' || item.operation === 'TOMBSTONE') {
        const ref = resolveRef(db, item.collection, item.doc_path);
        await ref.set({ ...payload, updated_at: new Date().toISOString() }, { merge: true });
      } else if (item.operation === 'DELETE') {
        // Hard delete (legacy) — kept for backwards compat
        const ref = resolveRef(db, item.collection, item.doc_path);
        await ref.delete();
      }

      sqlite.markSynced(item.id);
      synced++;
    } catch (err) {
      console.error(`[SYNC PUSH] Failed item ${item.id} (attempt ${(item.retry_count || 0) + 1}):`, err.message);
      sqlite.markSyncFailed(item.id, err.message);
      failed++;
    }
  }

  return { synced, failed, remaining: pending.length - synced };
}

// ── Pull ───────────────────────────────────────────────

/**
 * Incremental pull: fetch docs updated since this device's last sync cursor.
 * Tombstoned entries overwrite local state; stale entries never resurrect tombstones.
 *
 * @param {string} deviceId  — identifier for this device / agent
 */
async function syncPull(deviceId) {
  deviceId = deviceId || DEVICE_ID;
  let pulled = 0;
  let skipped = 0;

  let db;
  try { db = getFirestore(); } catch {
    return { status: 'error', error: 'Firebase unavailable', pulled: 0 };
  }

  const lastSync = sqlite.getDeviceLastSync(deviceId) || '1970-01-01T00:00:00.000Z';

  try {
    // ── Global memory ──
    const globalSnap = await db.collection('global_memory')
      .where('updated_at', '>', lastSync)
      .orderBy('updated_at', 'asc')
      .get();

    for (const doc of globalSnap.docs) {
      const data = doc.data();
      const remoteRev = data.revision || 0;

      // Get local state to compare revisions
      const local = sqlite.getGlobalMemoryFull(doc.id);
      const localRev = local ? (local.revision || 0) : -1;

      // Skip if local is newer
      if (localRev > remoteRev) {
        skipped++;
        continue;
      }

      if (data.deleted) {
        // Propagate tombstone
        sqlite.tombstoneGlobalMemory(doc.id, {
          deleted_by: data.deleted_by || 'sync',
          delete_reason: data.delete_reason || 'Synced tombstone',
          infection_id: data.infection_id || null,
          source_device_id: data.source_device_id || 'remote',
        });
      } else {
        // Upsert value (only if not locally tombstoned with higher rev)
        if (local && local.deleted && localRev >= remoteRev) {
          skipped++;
          continue; // Local tombstone wins or ties
        }
        sqlite.setGlobalMemory(doc.id, data.value, {
          updated_by: data.updated_by || 'sync',
          source_device_id: data.source_device_id || 'remote',
        });
      }
      pulled++;
    }

    // ── Project memory ──
    const projectSnap = await db.collection('project_memory').get();
    for (const projDoc of projectSnap.docs) {
      const projId = projDoc.id;
      const entriesSnap = await projDoc.ref.collection('entries')
        .where('updated_at', '>', lastSync)
        .orderBy('updated_at', 'asc')
        .get();

      for (const entryDoc of entriesSnap.docs) {
        const data = entryDoc.data();
        const remoteRev = data.revision || 0;

        const local = sqlite.getProjectMemoryFull(projId, entryDoc.id);
        const localRev = local ? (local.revision || 0) : -1;

        if (localRev > remoteRev) { skipped++; continue; }

        if (data.deleted) {
          sqlite.tombstoneProjectMemory(projId, entryDoc.id, {
            deleted_by: data.deleted_by || 'sync',
            delete_reason: data.delete_reason || 'Synced tombstone',
            infection_id: data.infection_id || null,
            source_device_id: data.source_device_id || 'remote',
          });
        } else {
          if (local && local.deleted && localRev >= remoteRev) { skipped++; continue; }
          sqlite.setProjectMemory(projId, entryDoc.id, data.value, {
            updated_by: data.updated_by || 'sync',
            source_device_id: data.source_device_id || 'remote',
          });
        }
        pulled++;
      }
    }

    // Update cursor
    sqlite.updateDeviceLastSync(deviceId);
  } catch (err) {
    console.error('[SYNC PULL]', err.message);
    return { status: 'error', error: err.message, pulled, skipped };
  }

  return { status: 'ok', pulled, skipped, deviceId };
}

// ── Status ─────────────────────────────────────────────

/** Return queue depth and dead-letter count */
function getSyncStatus() {
  const pending = sqlite.getPendingSyncItems();
  const deadLetters = sqlite.getDeadLetterItems();
  return {
    pending: pending.length,
    deadLetters: deadLetters.length,
    items: pending.slice(0, 20),
    dead: deadLetters.slice(0, 10),
  };
}

/** Re-attempt dead-letter items once (resets retry_count) */
async function retryDeadLetters() {
  const dead = sqlite.getDeadLetterItems();
  if (dead.length === 0) return { retried: 0 };

  let db;
  try { db = getFirestore(); } catch {
    return { retried: 0, error: 'Firebase unavailable' };
  }

  let retried = 0;
  for (const item of dead) {
    try {
      const payload = item.payload ? JSON.parse(item.payload) : {};
      if (item.operation === 'SET' || item.operation === 'TOMBSTONE') {
        const ref = resolveRef(db, item.collection, item.doc_path);
        await ref.set({ ...payload, updated_at: new Date().toISOString() }, { merge: true });
      } else if (item.operation === 'DELETE') {
        const ref = resolveRef(db, item.collection, item.doc_path);
        await ref.delete();
      }
      sqlite.markSynced(item.id);
      retried++;
    } catch (err) {
      console.error(`[DEAD-LETTER RETRY] Failed item ${item.id}:`, err.message);
      // Leave it dead
    }
  }

  return { retried, total: dead.length };
}

module.exports = { syncPush, syncPull, getSyncStatus, retryDeadLetters };
