/**
 * ====================================
 * Swastik MCP — Local Device Agent
 * ====================================
 *
 * A lightweight Node.js script that runs on each device.
 * Responsibilities:
 *   1. Sync on startup  — push pending + pull latest
 *   2. Periodic sync    — every SYNC_INTERVAL_MS
 *   3. Offline queue    — writes go to SQLite; flushed when online
 *
 * Usage:
 *   node agent/index.js
 *
 * The agent talks to the MCP backend on localhost (or a remote URL).
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', 'backend', '.env') });
const os = require('os');
const { v4: uuidv4 } = require('uuid');

// ── Config ─────────────────────────────────────────────
const API_BASE = process.env.MCP_API_URL || 'http://localhost:4000/api';
const SYNC_INTERVAL_MS = parseInt(process.env.SYNC_INTERVAL_MS, 10) || 60_000; // 1 min default
const DEVICE_ID = process.env.DEVICE_ID || `device-${os.hostname()}-${uuidv4().slice(0, 8)}`;

// ── Helpers ────────────────────────────────────────────

async function apiCall(path, method = 'GET', body = null) {
  const url = `${API_BASE}${path}`;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);

  try {
    const res = await fetch(url, opts);
    const data = await res.json();
    return { ok: res.ok, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Sync actions ───────────────────────────────────────

async function syncPush() {
  console.log(`[${new Date().toISOString()}] ⬆  Pushing offline queue…`);
  const result = await apiCall('/sync/push', 'POST');
  if (result.ok) {
    console.log(`   ✅ Push complete:`, result.data);
  } else {
    console.log(`   ⚠  Push failed:`, result.error || result.data);
  }
}

async function syncPull() {
  console.log(`[${new Date().toISOString()}] ⬇  Pulling latest from cloud…`);
  const result = await apiCall('/sync/pull', 'POST');
  if (result.ok) {
    console.log(`   ✅ Pull complete:`, result.data);
  } else {
    console.log(`   ⚠  Pull failed:`, result.error || result.data);
  }
}

async function fullSync() {
  await syncPush();
  await syncPull();
}

async function healthCheck() {
  const result = await apiCall('/health');
  if (result.ok) {
    console.log(`   🟢 Backend is healthy:`, result.data);
    return true;
  }
  console.log(`   🔴 Backend unreachable:`, result.error || result.data);
  return false;
}

// ── Main ───────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   Swastik MCP — Local Device Agent          ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`   Device ID : ${DEVICE_ID}`);
  console.log(`   API Base  : ${API_BASE}`);
  console.log(`   Interval  : ${SYNC_INTERVAL_MS}ms\n`);

  // 1. Health check
  const online = await healthCheck();

  // 2. Sync on startup
  if (online) {
    await fullSync();
  } else {
    console.log('   📴 Offline — will retry on next interval');
  }

  // 3. Periodic sync
  setInterval(async () => {
    const isOnline = await healthCheck();
    if (isOnline) await fullSync();
  }, SYNC_INTERVAL_MS);

  console.log(`\n🔄  Periodic sync running every ${SYNC_INTERVAL_MS / 1000}s. Press Ctrl+C to stop.\n`);
}

main().catch(console.error);
