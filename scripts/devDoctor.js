#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawnSync } = require('child_process');

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  grey: '\x1b[90m',
};

const ok = (msg) => console.log(`  ${C.green}✓${C.reset} ${msg}`);
const warn = (msg) => console.log(`  ${C.yellow}⚠${C.reset} ${msg}`);
const fail = (msg) => console.log(`  ${C.red}✗${C.reset} ${msg}`);
const info = (msg) => console.log(`  ${C.grey}ℹ${C.reset} ${msg}`);
const sep = () => console.log(`  ${C.grey}${'─'.repeat(52)}${C.reset}`);

const ROOT = path.resolve(__dirname, '..');
const BACKEND = path.join(ROOT, 'backend');
const DASH = path.join(ROOT, 'dashboard');
const TELEGRAM = path.join(ROOT, 'telegram');

let errors = 0;
let warnings = 0;

function readEnvValue(envContent, key) {
  const match = envContent.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return match ? match[1].trim() : '';
}

function parseList(value) {
  return String(value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function commandExists(cmd) {
  try {
    const result = spawnSync(
      process.platform === 'win32' ? 'where' : 'which',
      [cmd],
      { stdio: 'pipe', shell: true }
    );
    return result.status === 0;
  } catch {
    return false;
  }
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port, '127.0.0.1');
  });
}

function inferProjectIdFromServiceAccount(saJson, saPath) {
  if (saJson) {
    try {
      const parsed = JSON.parse(saJson);
      if (parsed && parsed.project_id) return parsed.project_id;
    } catch {
      return '';
    }
  }

  if (saPath) {
    const resolved = path.isAbsolute(saPath) ? saPath : path.resolve(BACKEND, saPath);
    if (fs.existsSync(resolved)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
        return parsed?.project_id || '';
      } catch {
        return '';
      }
    }
  }

  return '';
}

async function main() {
  console.log(`\n${C.bold}${C.cyan}🩺  Swastik MCP — Dev Doctor${C.reset}\n`);

  console.log(`${C.bold}1. Node.js version${C.reset}`);
  const nodeVer = process.versions.node;
  const major = Number(nodeVer.split('.')[0]);
  if (major >= 20) {
    ok(`Node ${nodeVer} — excellent`);
  } else if (major >= 18) {
    ok(`Node ${nodeVer} — supported (18+ required)`);
  } else {
    fail(`Node ${nodeVer} — too old, requires >= 18`);
    errors++;
  }
  sep();

  console.log(`${C.bold}2. Port availability${C.reset}`);
  const [p3939, p5173] = await Promise.all([isPortFree(3939), isPortFree(5173)]);
  if (p3939) ok('Port 3939 (backend) is free'); else { warn('Port 3939 in use'); warnings++; }
  if (p5173) ok('Port 5173 (frontend) is free'); else { warn('Port 5173 in use'); warnings++; }
  sep();

  console.log(`${C.bold}3. Backend .env${C.reset}`);
  const backendEnvPath = path.join(BACKEND, '.env');
  const backendEnvExamplePath = path.join(BACKEND, '.env.example');

  if (!fs.existsSync(backendEnvPath)) {
    if (fs.existsSync(backendEnvExamplePath)) {
      fs.copyFileSync(backendEnvExamplePath, backendEnvPath);
      warn('backend/.env not found — copied from .env.example');
      warnings++;
    } else {
      fail('backend/.env missing and no .env.example found');
      errors++;
    }
  } else {
    ok('backend/.env exists');
  }

  const backendEnv = fs.existsSync(backendEnvPath) ? fs.readFileSync(backendEnvPath, 'utf8') : '';
  const firebaseProjectId = readEnvValue(backendEnv, 'FIREBASE_PROJECT_ID');
  const firebaseSaPath = readEnvValue(backendEnv, 'FIREBASE_SERVICE_ACCOUNT_PATH');
  const firebaseSaJson = readEnvValue(backendEnv, 'FIREBASE_SERVICE_ACCOUNT_JSON');

  const inferredProjectId = inferProjectIdFromServiceAccount(firebaseSaJson, firebaseSaPath);
  if (firebaseProjectId || inferredProjectId) {
    ok('  FIREBASE_PROJECT_ID is set or inferred');
  } else {
    fail('  FIREBASE_PROJECT_ID is missing and not inferable from service account');
    errors++;
  }

  if (firebaseSaPath) {
    const resolved = path.isAbsolute(firebaseSaPath) ? firebaseSaPath : path.resolve(BACKEND, firebaseSaPath);
    if (fs.existsSync(resolved)) {
      ok(`  Firebase service account file found at ${resolved}`);
    } else {
      fail(`  FIREBASE_SERVICE_ACCOUNT_PATH does not exist: ${resolved}`);
      errors++;
    }
  } else if (firebaseSaJson) {
    ok('  Firebase service account credential set via JSON');
  } else {
    warn('  Firebase service account credential is not configured');
    warnings++;
  }
  sep();

  console.log(`${C.bold}4. Dashboard .env${C.reset}`);
  const dashEnvPath = path.join(DASH, '.env');
  const dashEnvExamplePath = path.join(DASH, '.env.example');

  if (!fs.existsSync(dashEnvPath)) {
    if (fs.existsSync(dashEnvExamplePath)) {
      fs.copyFileSync(dashEnvExamplePath, dashEnvPath);
      warn('dashboard/.env not found — copied from .env.example');
      warnings++;
    } else {
      warn('dashboard/.env not found');
      warnings++;
    }
  } else {
    ok('dashboard/.env exists');
  }
  sep();

  console.log(`${C.bold}5. Dependencies installed${C.reset}`);
  if (fs.existsSync(path.join(BACKEND, 'node_modules'))) ok('backend/node_modules present'); else { fail('backend/node_modules missing'); errors++; }
  if (fs.existsSync(path.join(DASH, 'node_modules'))) ok('dashboard/node_modules present'); else { fail('dashboard/node_modules missing'); errors++; }
  if (fs.existsSync(path.join(TELEGRAM, 'node_modules'))) ok('telegram/node_modules present'); else { warn('telegram/node_modules missing'); warnings++; }
  sep();

  console.log(`${C.bold}6. MCP desktop clients${C.reset}`);
  if (commandExists('code')) ok('VS Code (code) — on PATH'); else info('VS Code code command not on PATH (optional)');
  if (commandExists('cursor')) ok('Cursor — on PATH'); else info('Cursor — not found (optional)');
  info('Claude Desktop check skipped (optional)');
  sep();

  console.log(`${C.bold}7. Telegram bot config${C.reset}`);
  const telegramEnvPath = path.join(TELEGRAM, '.env');
  const telegramEnvExamplePath = path.join(TELEGRAM, '.env.example');

  if (!fs.existsSync(telegramEnvPath)) {
    if (fs.existsSync(telegramEnvExamplePath)) {
      fs.copyFileSync(telegramEnvExamplePath, telegramEnvPath);
      warn('telegram/.env not found — copied from .env.example');
      warnings++;
    } else {
      fail('telegram/.env missing and no .env.example found');
      errors++;
    }
  } else {
    ok('telegram/.env exists');
  }

  const telegramEnv = fs.existsSync(telegramEnvPath) ? fs.readFileSync(telegramEnvPath, 'utf8') : '';
  const tgToken = readEnvValue(telegramEnv, 'TELEGRAM_BOT_TOKEN');
  const apiBase = readEnvValue(telegramEnv, 'PUBLIC_API_BASE_URL');
  const botSecret = readEnvValue(telegramEnv, 'BACKEND_ADMIN_SECRET');
  const adminIds = parseList(readEnvValue(telegramEnv, 'TELEGRAM_ADMIN_CHAT_IDS'));
  const viewerIds = parseList(readEnvValue(telegramEnv, 'TELEGRAM_VIEWER_CHAT_IDS'));
  const legacyAllowed = parseList(readEnvValue(telegramEnv, 'TELEGRAM_ALLOWED_CHAT_IDS'));
  const owner = readEnvValue(telegramEnv, 'TELEGRAM_OWNER_CHAT_ID');

  if (tgToken && !tgToken.startsWith('REPLACE_')) ok('  TELEGRAM_BOT_TOKEN is set');
  else { warn('  TELEGRAM_BOT_TOKEN missing or placeholder'); warnings++; }

  if (apiBase && /^https:\/\/.+\.onrender\.com\/api$/i.test(apiBase)) ok('  PUBLIC_API_BASE_URL points to Render API');
  else if (apiBase) { warn('  PUBLIC_API_BASE_URL set but not matching Render API pattern'); warnings++; }
  else { fail('  PUBLIC_API_BASE_URL missing'); errors++; }

  if (adminIds.length > 0) ok('  TELEGRAM_ADMIN_CHAT_IDS is set');
  else { fail('  TELEGRAM_ADMIN_CHAT_IDS is required'); errors++; }

  if (viewerIds.length > 0 || legacyAllowed.length > 0) ok('  Viewer/allowed chat IDs configured');
  else { warn('  No viewer chat IDs configured'); warnings++; }

  if (owner) ok('  TELEGRAM_OWNER_CHAT_ID set (legacy compatibility)');

  const backendSecret = readEnvValue(backendEnv, 'BACKEND_ADMIN_SECRET');
  const backendAdminIds = parseList(readEnvValue(backendEnv, 'TELEGRAM_ADMIN_CHAT_IDS'));
  const backendViewerIds = parseList(readEnvValue(backendEnv, 'TELEGRAM_VIEWER_CHAT_IDS'));
  const backendAllowed = parseList(readEnvValue(backendEnv, 'TELEGRAM_ALLOWED_CHAT_IDS'));
  const backendResolved = Array.from(new Set([...backendAdminIds, ...backendViewerIds, ...backendAllowed]));
  const botResolved = Array.from(new Set([...adminIds, ...viewerIds, ...legacyAllowed]));

  if (backendSecret && botSecret && backendSecret === botSecret) ok('  BACKEND_ADMIN_SECRET matches backend/.env');
  else if (!backendSecret || !botSecret) { warn('  BACKEND_ADMIN_SECRET missing in backend/.env or telegram/.env'); warnings++; }
  else { fail('  BACKEND_ADMIN_SECRET mismatch between backend/.env and telegram/.env'); errors++; }

  if (botResolved.every((id) => backendResolved.includes(id))) ok('  Telegram role IDs are allowed by backend');
  else { fail('  Some Telegram role IDs are not allowed by backend env'); errors++; }

  if (owner && !botResolved.includes(owner)) {
    fail('  TELEGRAM_OWNER_CHAT_ID must be present in admin/viewer/allowed IDs');
    errors++;
  }
  sep();

  console.log(`${C.bold}Summary${C.reset}`);
  if (errors === 0 && warnings === 0) {
    console.log(`  ${C.green}${C.bold}🎉 All checks passed! You're ready to run: npm run setup${C.reset}\n`);
  } else if (errors === 0) {
    console.log(`  ${C.yellow}${C.bold}⚠  ${warnings} warning(s). Review above, then run: npm run setup${C.reset}\n`);
  } else {
    console.log(`  ${C.red}${C.bold}✗  ${errors} error(s), ${warnings} warning(s). Fix the ✗ items above before continuing.${C.reset}\n`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
