const sqlite = require('../db/sqlite');
const { getFirestore } = require('../config/firebase');

const DEFAULT_DEVICE_ID = process.env.DEVICE_ID || 'backend-primary';

class MemoryServiceError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function ensureAuth(context = {}) {
  if (!context.uid) {
    throw new MemoryServiceError(401, 'UNAUTHORIZED', 'Authentication required');
  }
}

function ensureOwner(context = {}) {
  const ownerUid = process.env.OWNER_UID;
  if (!ownerUid) {
    throw new MemoryServiceError(500, 'SERVER_MISCONFIG', 'Server misconfigured: OWNER_UID not set');
  }
  if (!context.uid || context.uid !== ownerUid) {
    throw new MemoryServiceError(403, 'FORBIDDEN', 'Owner-only action');
  }
}

function asMeta(context = {}) {
  return {
    uid: context.uid,
    sourceDeviceId: context.deviceId || DEFAULT_DEVICE_ID,
  };
}

function parsePathParts(collection, docPath) {
  const parts = docPath.split('/');
  if (parts.length === 1) {
    return { collection, refParts: [parts[0]] };
  }
  return { collection, refParts: parts };
}

function resolveRef(db, collection, docPath) {
  const { refParts } = parsePathParts(collection, docPath);
  if (refParts.length === 1) {
    return db.collection(collection).doc(refParts[0]);
  }

  let ref = db.collection(collection);
  for (let index = 0; index < refParts.length; index += 1) {
    ref = index % 2 === 0 ? ref.doc(refParts[index]) : ref.collection(refParts[index]);
  }
  return ref;
}

async function addFirestoreAudit(action, collection, docPath, actorUid, details) {
  try {
    const db = getFirestore();
    await db.collection('logs').add({
      action,
      collection,
      doc_path: docPath,
      actor_uid: actorUid,
      details: details || {},
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Best-effort only; SQLite audit is authoritative for local durability.
  }
}

function formatMcpError(error) {
  if (error instanceof MemoryServiceError) {
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        status: error.status,
      },
    };
  }
  return {
    ok: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: error.message || 'Internal error',
      status: 500,
    },
  };
}

async function listGlobalMemory(context, includeDeleted = false) {
  ensureAuth(context);
  try {
    const ref = getFirestore().collection('global_memory');
    const query = includeDeleted ? ref : ref.where('deleted', '!=', true);
    const snap = await query.get();
    return { source: 'firebase', items: snap.docs.map((doc) => ({ key: doc.id, ...doc.data() })) };
  } catch {
    return { source: 'sqlite', items: sqlite.getAllGlobalMemory(includeDeleted) };
  }
}

async function getGlobalMemory(context, key, includeDeleted = false) {
  ensureAuth(context);
  try {
    const doc = await getFirestore().collection('global_memory').doc(key).get();
    if (doc.exists) {
      const value = doc.data();
      if (value.deleted && !includeDeleted) {
        throw new MemoryServiceError(404, 'NOT_FOUND', 'Key not found');
      }
      return { source: 'firebase', key, ...value };
    }
  } catch (error) {
    if (error instanceof MemoryServiceError) {
      throw error;
    }
  }

  const full = sqlite.getGlobalMemoryFull(key);
  if (!full || (full.deleted && !includeDeleted)) {
    throw new MemoryServiceError(404, 'NOT_FOUND', 'Key not found');
  }
  return { source: 'sqlite', key, ...full };
}

async function setGlobalMemory(context, key, value) {
  ensureAuth(context);
  if (!key || value === undefined) {
    throw new MemoryServiceError(400, 'BAD_REQUEST', 'key and value are required');
  }

  const meta = asMeta(context);
  const revision = sqlite.setGlobalMemory(key, value, {
    updated_by: meta.uid,
    source_device_id: meta.sourceDeviceId,
  });

  const payload = {
    value,
    revision,
    updated_at: new Date().toISOString(),
    updated_by: meta.uid,
    source_device_id: meta.sourceDeviceId,
    deleted: false,
  };

  try {
    await getFirestore().collection('global_memory').doc(key).set(payload, { merge: true });
    return { status: 'synced', key, revision };
  } catch {
    sqlite.enqueueSync('global_memory', key, 'SET', payload);
    return { status: 'queued', key, revision };
  }
}

async function deleteGlobalMemory(context, key, reason, infectionId = null) {
  ensureAuth(context);
  ensureOwner(context);

  const meta = asMeta(context);
  const details = {
    deleted_by: meta.uid,
    delete_reason: reason || 'Manual delete',
    infection_id: infectionId || null,
    source_device_id: meta.sourceDeviceId,
  };

  const revision = sqlite.tombstoneGlobalMemory(key, details);
  if (!revision) {
    throw new MemoryServiceError(404, 'NOT_FOUND', 'Key not found');
  }

  sqlite.logAudit('DELETE', 'global_memory', key, meta.uid, details);
  await addFirestoreAudit('DELETE', 'global_memory', key, meta.uid, details);

  const payload = {
    deleted: true,
    deleted_at: new Date().toISOString(),
    deleted_by: meta.uid,
    delete_reason: details.delete_reason,
    infection_id: details.infection_id,
    revision,
    updated_at: new Date().toISOString(),
    updated_by: meta.uid,
    source_device_id: meta.sourceDeviceId,
  };

  try {
    await getFirestore().collection('global_memory').doc(key).set(payload, { merge: true });
    return { status: 'deleted', key, revision };
  } catch {
    sqlite.enqueueSync('global_memory', key, 'TOMBSTONE', payload);
    return { status: 'queued-delete', key, revision };
  }
}

async function restoreGlobalMemory(context, key) {
  ensureAuth(context);
  ensureOwner(context);

  const meta = asMeta(context);
  const revision = sqlite.restoreGlobalMemory(key, {
    updated_by: meta.uid,
    source_device_id: meta.sourceDeviceId,
  });

  if (!revision) {
    throw new MemoryServiceError(404, 'NOT_FOUND', 'Key not found or not deleted');
  }

  sqlite.logAudit('RESTORE', 'global_memory', key, meta.uid, {});
  await addFirestoreAudit('RESTORE', 'global_memory', key, meta.uid, {});

  const payload = {
    deleted: false,
    deleted_at: null,
    deleted_by: null,
    delete_reason: null,
    infection_id: null,
    revision,
    updated_at: new Date().toISOString(),
    updated_by: meta.uid,
    source_device_id: meta.sourceDeviceId,
  };

  try {
    await getFirestore().collection('global_memory').doc(key).set(payload, { merge: true });
    return { status: 'restored', key, revision };
  } catch {
    sqlite.enqueueSync('global_memory', key, 'SET', payload);
    return { status: 'queued-restore', key, revision };
  }
}

async function listProjectMemory(context, projectId, includeDeleted = false) {
  ensureAuth(context);
  try {
    const ref = getFirestore().collection('project_memory').doc(projectId).collection('entries');
    const query = includeDeleted ? ref : ref.where('deleted', '!=', true);
    const snap = await query.get();
    return { source: 'firebase', projectId, items: snap.docs.map((doc) => ({ key: doc.id, ...doc.data() })) };
  } catch {
    return { source: 'sqlite', projectId, items: sqlite.getAllProjectMemory(projectId, includeDeleted) };
  }
}

async function getProjectMemory(context, projectId, key, includeDeleted = false) {
  ensureAuth(context);
  try {
    const doc = await getFirestore()
      .collection('project_memory')
      .doc(projectId)
      .collection('entries')
      .doc(key)
      .get();

    if (doc.exists) {
      const value = doc.data();
      if (value.deleted && !includeDeleted) {
        throw new MemoryServiceError(404, 'NOT_FOUND', 'Key not found');
      }
      return { source: 'firebase', projectId, key, ...value };
    }
  } catch (error) {
    if (error instanceof MemoryServiceError) {
      throw error;
    }
  }

  const full = sqlite.getProjectMemoryFull(projectId, key);
  if (!full || (full.deleted && !includeDeleted)) {
    throw new MemoryServiceError(404, 'NOT_FOUND', 'Key not found');
  }
  return { source: 'sqlite', projectId, key, ...full };
}

async function setProjectMemory(context, projectId, key, value) {
  ensureAuth(context);
  if (!key || value === undefined) {
    throw new MemoryServiceError(400, 'BAD_REQUEST', 'key and value are required');
  }

  const meta = asMeta(context);
  const revision = sqlite.setProjectMemory(projectId, key, value, {
    updated_by: meta.uid,
    source_device_id: meta.sourceDeviceId,
  });

  const payload = {
    value,
    revision,
    updated_at: new Date().toISOString(),
    updated_by: meta.uid,
    source_device_id: meta.sourceDeviceId,
    deleted: false,
  };
  const docPath = `${projectId}/entries/${key}`;

  try {
    await resolveRef(getFirestore(), 'project_memory', docPath).set(payload, { merge: true });
    return { status: 'synced', projectId, key, revision };
  } catch {
    sqlite.enqueueSync('project_memory', docPath, 'SET', payload);
    return { status: 'queued', projectId, key, revision };
  }
}

async function deleteProjectMemory(context, projectId, key, reason, infectionId = null) {
  ensureAuth(context);
  ensureOwner(context);

  const meta = asMeta(context);
  const details = {
    deleted_by: meta.uid,
    delete_reason: reason || 'Manual delete',
    infection_id: infectionId || null,
    source_device_id: meta.sourceDeviceId,
  };

  const revision = sqlite.tombstoneProjectMemory(projectId, key, details);
  if (!revision) {
    throw new MemoryServiceError(404, 'NOT_FOUND', 'Key not found');
  }

  const docPath = `${projectId}/${key}`;
  sqlite.logAudit('DELETE', 'project_memory', docPath, meta.uid, details);
  await addFirestoreAudit('DELETE', 'project_memory', docPath, meta.uid, details);

  const payload = {
    deleted: true,
    deleted_at: new Date().toISOString(),
    deleted_by: meta.uid,
    delete_reason: details.delete_reason,
    infection_id: details.infection_id,
    revision,
    updated_at: new Date().toISOString(),
    updated_by: meta.uid,
    source_device_id: meta.sourceDeviceId,
  };

  const queuePath = `${projectId}/entries/${key}`;
  try {
    await resolveRef(getFirestore(), 'project_memory', queuePath).set(payload, { merge: true });
    return { status: 'deleted', projectId, key, revision };
  } catch {
    sqlite.enqueueSync('project_memory', queuePath, 'TOMBSTONE', payload);
    return { status: 'queued-delete', projectId, key, revision };
  }
}

async function restoreProjectMemory(context, projectId, key) {
  ensureAuth(context);
  ensureOwner(context);

  const meta = asMeta(context);
  const revision = sqlite.restoreProjectMemory(projectId, key, {
    updated_by: meta.uid,
    source_device_id: meta.sourceDeviceId,
  });

  if (!revision) {
    throw new MemoryServiceError(404, 'NOT_FOUND', 'Key not found or not deleted');
  }

  const docPath = `${projectId}/${key}`;
  sqlite.logAudit('RESTORE', 'project_memory', docPath, meta.uid, {});
  await addFirestoreAudit('RESTORE', 'project_memory', docPath, meta.uid, {});

  const payload = {
    deleted: false,
    deleted_at: null,
    deleted_by: null,
    delete_reason: null,
    infection_id: null,
    revision,
    updated_at: new Date().toISOString(),
    updated_by: meta.uid,
    source_device_id: meta.sourceDeviceId,
  };

  const queuePath = `${projectId}/entries/${key}`;
  try {
    await resolveRef(getFirestore(), 'project_memory', queuePath).set(payload, { merge: true });
    return { status: 'restored', projectId, key, revision };
  } catch {
    sqlite.enqueueSync('project_memory', queuePath, 'SET', payload);
    return { status: 'queued-restore', projectId, key, revision };
  }
}

module.exports = {
  MemoryServiceError,
  formatMcpError,
  listGlobalMemory,
  getGlobalMemory,
  setGlobalMemory,
  deleteGlobalMemory,
  restoreGlobalMemory,
  listProjectMemory,
  getProjectMemory,
  setProjectMemory,
  deleteProjectMemory,
  restoreProjectMemory,
};