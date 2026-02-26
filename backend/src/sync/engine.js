/**
 * Sync Engine — two-way sync between SQLite (offline) and Firebase (cloud).
 *
 * syncPush():  Flush queued local writes to Firebase.
 * syncPull():  Pull latest data from Firebase into SQLite.
 * getSyncStatus(): Number of items waiting to be synced.
 */

const { getFirestore } = require('../config/firebase');
const sqlite = require('../db/sqlite');

/**
 * Push all pending offline operations to Firebase.
 * Each item in sync_queue describes a SET or DELETE on a Firestore path.
 */
async function syncPush() {
  const pending = sqlite.getPendingSyncItems();
  let synced = 0;
  let failed = 0;

  const db = getFirestore();

  for (const item of pending) {
    try {
      const payload = item.payload ? JSON.parse(item.payload) : null;

      if (item.operation === 'SET' && payload) {
        // doc_path can be "key" or "projectId/entries/key"
        const parts = item.doc_path.split('/');
        let ref;
        if (parts.length === 1) {
          ref = db.collection(item.collection).doc(parts[0]);
        } else {
          // nested: project_memory / projectId / entries / key
          ref = db.collection(item.collection);
          for (let i = 0; i < parts.length; i++) {
            ref = i % 2 === 0 ? ref.doc(parts[i]) : ref.collection(parts[i]);
          }
        }
        await ref.set({ ...payload, updated_at: new Date().toISOString() }, { merge: true });
      }

      if (item.operation === 'DELETE') {
        await db.collection(item.collection).doc(item.doc_path).delete();
      }

      sqlite.markSynced(item.id);
      synced++;
    } catch (err) {
      console.error(`[SYNC PUSH] Failed item ${item.id}:`, err.message);
      failed++;
    }
  }

  return { synced, failed, remaining: pending.length - synced };
}

/**
 * Pull latest global + project memory from Firebase into SQLite.
 * Simple full-replace strategy — good enough for solo use.
 */
async function syncPull() {
  const db = getFirestore();
  let pulled = 0;

  try {
    // Pull global memory
    const globalSnap = await db.collection('global_memory').get();
    for (const doc of globalSnap.docs) {
      const data = doc.data();
      sqlite.setGlobalMemory(doc.id, data.value);
      pulled++;
    }

    // Pull project memory (top-level docs = project IDs)
    const projectSnap = await db.collection('project_memory').get();
    for (const projDoc of projectSnap.docs) {
      const entriesSnap = await projDoc.ref.collection('entries').get();
      for (const entryDoc of entriesSnap.docs) {
        const data = entryDoc.data();
        sqlite.setProjectMemory(projDoc.id, entryDoc.id, data.value);
        pulled++;
      }
    }
  } catch (err) {
    console.error('[SYNC PULL]', err.message);
    return { status: 'error', error: err.message, pulled };
  }

  return { status: 'ok', pulled };
}

/** Return count of pending items in the offline queue */
function getSyncStatus() {
  const pending = sqlite.getPendingSyncItems();
  return { pending: pending.length, items: pending.slice(0, 20) };
}

module.exports = { syncPush, syncPull, getSyncStatus };
