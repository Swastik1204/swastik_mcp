#!/usr/bin/env node
/**
 * scripts/oneClickSetup.js — One-command local dev launcher.
 *
 * Run:  npm run setup   (from repo root)
 *  or:  node scripts/oneClickSetup.js
 *
 * What it does:
 *   1. Runs devDoctor (hard exit if blocking errors)
 *   2. Installs backend dependencies if node_modules missing
 *   3. Installs dashboard dependencies if node_modules missing
 *   4. Launches backend (node src/index.js or nodemon) in a new terminal
 *   5. Launches dashboard dev server (vite) in a new terminal
 *   6. Opens http://localhost:5173 in the default browser
 *
 * ⚠  This script spawns NEW terminal windows / tabs (OS-dependent).
 *    It does NOT block — it hands off and exits so your current shell
 *    stays clean.
 *
 * Supports: Windows (cmd), macOS (Terminal.app / open), Linux (xterm / x-terminal-emulator / bash &)
 */

const { execSync, spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');

// ── Colours ────────────────────────────────────────────────────────────────
const C = {
  reset : '\x1b[0m',
  bold  : '\x1b[1m',
  green : '\x1b[32m',
  yellow: '\x1b[33m',
  red   : '\x1b[31m',
  cyan  : '\x1b[36m',
};
const step = (n, msg) => console.log(`\n${C.cyan}[${n}]${C.reset} ${C.bold}${msg}${C.reset}`);
const ok   = (msg) => console.log(`  ${C.green}✓${C.reset} ${msg}`);
const info = (msg) => console.log(`  ${msg}`);

const ROOT    = path.resolve(__dirname, '..');
const BACKEND = path.join(ROOT, 'backend');
const DASH    = path.join(ROOT, 'dashboard');

// ── Step helpers ──────────────────────────────────────────────────────────
function npmInstall(dir, label) {
  const nmPath = path.join(dir, 'node_modules');
  if (fs.existsSync(nmPath)) {
    ok(`${label} node_modules already present — skipping install`);
    return;
  }
  info(`Installing ${label} dependencies…`);
  execSync('npm install', { cwd: dir, stdio: 'inherit' });
  ok(`${label} dependencies installed`);
}

/**
 * spawnDetachedTerminal(title, cwd, cmd)
 * Opens a new visible terminal window running `cmd` in `cwd`.
 * - Windows: new cmd window
 * - macOS:   new Terminal.app tab
 * - Linux:   tries x-terminal-emulator, then xterm, then falls back to bg process
 */
function spawnDetachedTerminal(title, cwd, cmd) {
  const plat = process.platform;

  if (plat === 'win32') {
    // start "" "cmd.exe" /k <command>
    spawn('cmd.exe', ['/c', `start "${title}" cmd.exe /k "${cmd}"`], {
      cwd,
      shell: true,
      detached: true,
      stdio: 'ignore',
    }).unref();
  } else if (plat === 'darwin') {
    // open a new Terminal tab running the command
    const script = `tell application "Terminal" to do script "cd '${cwd}' && ${cmd}"`;
    spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' }).unref();
  } else {
    // Linux — try common terminal emulators, lastly run in background
    const terminals = ['x-terminal-emulator', 'gnome-terminal', 'xterm', 'konsole'];
    let launched = false;
    for (const term of terminals) {
      try {
        execSync(`which ${term} 2>/dev/null`, { stdio: 'pipe' });
        spawn(term, ['--', 'bash', '-c', `cd '${cwd}' && ${cmd}; exec bash`], {
          detached: true,
          stdio: 'ignore',
        }).unref();
        launched = true;
        break;
      } catch { /* try next */ }
    }
    if (!launched) {
      // Last resort: background process (no visible window)
      console.log(`  ⚠  No terminal emulator found. Running ${title} as a background process.`);
      console.log(`     Logs will not be visible. Run manually: cd ${cwd} && ${cmd}`);
      spawn('bash', ['-c', `cd '${cwd}' && ${cmd}`], {
        detached: true,
        stdio: 'ignore',
      }).unref();
    }
  }
}

/**
 * openBrowser(url)
 * Opens the URL in the default browser.
 */
function openBrowser(url) {
  const plat = process.platform;
  if (plat === 'win32') {
    spawn('cmd.exe', ['/c', `start "" "${url}"`], { shell: true, detached: true, stdio: 'ignore' }).unref();
  } else if (plat === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
}

// ── Sleep helper ──────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${C.bold}${C.cyan}🚀  Swastik MCP — One-Click Setup${C.reset}\n`);

  // ── Step 1: Dev Doctor ───────────────────────────────────────────────
  step(1, 'Running dev doctor checks…');
  try {
    execSync(`node "${path.join(__dirname, 'devDoctor.js')}"`, { stdio: 'inherit' });
  } catch {
    // devDoctor exits 1 on hard errors — propagate
    console.error(`\n${C.red}Dev doctor found blocking errors. Fix them, then re-run npm run setup.${C.reset}\n`);
    process.exit(1);
  }

  // ── Step 2: Install dependencies ────────────────────────────────────
  step(2, 'Checking dependencies…');
  npmInstall(BACKEND, 'backend');
  npmInstall(DASH,    'dashboard');

  // ── Step 3: Launch backend ───────────────────────────────────────────
  step(3, 'Starting backend (port 3939)…');
  // Prefer nodemon in dev if installed
  const hasNodemon = fs.existsSync(path.join(BACKEND, 'node_modules', '.bin', 'nodemon')) ||
                     fs.existsSync(path.join(BACKEND, 'node_modules', '.bin', 'nodemon.cmd'));
  const backendCmd = hasNodemon ? 'npx nodemon src/index.js' : 'node src/index.js';
  spawnDetachedTerminal('MCP Backend', BACKEND, backendCmd);
  ok(`Backend launched (${backendCmd}) in a new terminal window`);

  // Give the backend a moment to bind the port
  await sleep(1500);

  // ── Step 4: Launch frontend ──────────────────────────────────────────
  step(4, 'Starting dashboard (port 5173)…');
  spawnDetachedTerminal('MCP Dashboard', DASH, 'npm run dev');
  ok('Dashboard launched (vite dev) in a new terminal window');

  // Give Vite a moment to start
  await sleep(2000);

  // ── Step 5: Open browser ─────────────────────────────────────────────
  step(5, 'Opening browser…');
  openBrowser('http://localhost:5173');
  ok('Opened http://localhost:5173');

  // ── Done ─────────────────────────────────────────────────────────────
  console.log(`\n${C.green}${C.bold}✅  Setup complete!${C.reset}\n`);
  console.log('  Backend  → http://localhost:3939/api');
  console.log('  Frontend → http://localhost:5173\n');
  console.log(`  ${C.yellow}Tip:${C.reset} If MCP clients need reconnecting, visit Settings → MCP in the dashboard.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
