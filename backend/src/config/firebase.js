/**
 * Firebase Admin SDK initialisation.
 * Uses a service-account key file for server-side access.
 * The path is read from FIREBASE_SERVICE_ACCOUNT_PATH env var.
 */

const admin = require('firebase-admin');

let db = null;

function initFirebase() {
  // If already initialised, skip
  if (admin.apps.length) {
    db = admin.firestore();
    return;
  }

  const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  if (saPath) {
    // Production / full-access mode
    const serviceAccount = require(saPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('🔥  Firebase initialised with service account');
  } else {
    // Fallback: initialise without credentials (emulator / limited)
    admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'stocker-5213e' });
    console.log('🔥  Firebase initialised (no service account — limited mode)');
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
