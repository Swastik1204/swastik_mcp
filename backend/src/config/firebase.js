/**
 * Firebase Admin SDK initialisation.
 * Uses a service-account key file for server-side access.
 * The path is read from FIREBASE_SERVICE_ACCOUNT_PATH env var.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

let db = null;

function resolveServiceAccountPath(rawPath) {
  const value = String(rawPath || '').trim();
  if (!value) return null;

  const backendRoot = path.resolve(__dirname, '..', '..');
  const candidates = [];

  if (path.isAbsolute(value)) {
    candidates.push(path.normalize(value));
  } else {
    candidates.push(path.resolve(process.cwd(), value));
    candidates.push(path.resolve(backendRoot, value));
    candidates.push(path.resolve(__dirname, value));
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

function loadDefaultServiceAccountPath() {
  const backendRoot = path.resolve(__dirname, '..', '..');
  const defaults = [
    path.join(backendRoot, 'firebase-key.json'),
    path.join(backendRoot, 'service-account.json'),
    path.join(backendRoot, 'firebase-service-account.json'),
  ];

  return defaults.find((candidate) => fs.existsSync(candidate)) || null;
}

function initFirebase() {
  // If already initialised, skip
  if (admin.apps.length) {
    db = admin.firestore();
    return;
  }

  const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  let projectId = String(process.env.FIREBASE_PROJECT_ID || '').trim();

  if (saJson) {
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(saJson);
    } catch (error) {
      throw new Error(`Invalid FIREBASE_SERVICE_ACCOUNT_JSON: ${error.message}`);
    }

    if (!projectId && serviceAccount.project_id) {
      projectId = serviceAccount.project_id;
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: projectId || undefined,
    });
    console.log('🔥  Firebase initialised with service account JSON');
  } else {
    const resolvedPath = resolveServiceAccountPath(saPath) || loadDefaultServiceAccountPath();

    if (resolvedPath) {
      const serviceAccount = require(resolvedPath);
      if (!projectId && serviceAccount.project_id) {
        projectId = serviceAccount.project_id;
      }

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: projectId || undefined,
      });
      console.log(`🔥  Firebase initialised with service account: ${resolvedPath}`);
    } else {
      // Fallback: initialise without credentials (emulator / limited)
      admin.initializeApp({ projectId: projectId || undefined });
      console.warn('⚠️  Firebase initialised without service account (limited mode)');
      if (saPath) {
        console.warn(`⚠️  FIREBASE_SERVICE_ACCOUNT_PATH not found: ${saPath}`);
      }
    }

    db = admin.firestore();
    return;
  }

  db = admin.firestore();
}

/**
 * Get a Firestore reference.
 * Always call initFirebase() before using this.
 */
function getFirestore() {
  if (!db) throw new Error('Firestore not initialised. Call initFirebase() first.');
  return db;
}

module.exports = { initFirebase, getFirestore };
