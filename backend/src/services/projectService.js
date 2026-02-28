/**
 * Project Service — project folder attachment, metadata scanning, GitHub detection.
 * Stores metadata in Firestore + local_path only in SQLite (never synced).
 */

const fs = require('fs');
const path = require('path');
const { getDB } = require('../db/sqlite');
const { getFirestore } = require('../config/firebase');

class ProjectServiceError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// ── SQLite schema bootstrap (called from migrate) ──────

function ensureProjectTables() {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id               TEXT PRIMARY KEY,
      project_name     TEXT NOT NULL,
      local_path       TEXT,
      primary_language TEXT,
      framework        TEXT,
      git_remote       TEXT,
      github_owner     TEXT,
      github_repo      TEXT,
      github_branch    TEXT,
      created_by       TEXT,
      created_at       TEXT DEFAULT (datetime('now')),
      updated_at       TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS mcp_clients (
      id               TEXT PRIMARY KEY,
      name             TEXT NOT NULL,
      client_type      TEXT NOT NULL,
      connection_mode  TEXT NOT NULL DEFAULT 'http',
      permissions      TEXT NOT NULL DEFAULT 'memory-only',
      enabled          INTEGER DEFAULT 1,
      last_tested_at   TEXT,
      test_status      TEXT,
      created_by       TEXT,
      created_at       TEXT DEFAULT (datetime('now')),
      updated_at       TEXT DEFAULT (datetime('now'))
    );
  `);
}

// ── File scanning helpers ──────────────────────────────

function detectLanguageFromPackageJson(pkgPath) {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps['typescript'] || deps['ts-node']) return { language: 'TypeScript', framework: detectJsFramework(deps) };
    return { language: 'JavaScript', framework: detectJsFramework(deps) };
  } catch {
    return { language: 'JavaScript', framework: null };
  }
}

function detectJsFramework(deps) {
  if (deps['next']) return 'Next.js';
  if (deps['nuxt']) return 'Nuxt';
  if (deps['react']) return 'React';
  if (deps['vue']) return 'Vue';
  if (deps['svelte']) return 'Svelte';
  if (deps['angular'] || deps['@angular/core']) return 'Angular';
  if (deps['express']) return 'Express';
  if (deps['fastify']) return 'Fastify';
  if (deps['hono']) return 'Hono';
  return null;
}

function detectPythonProject(projectPath) {
  const pyproject = path.join(projectPath, 'pyproject.toml');
  const requirements = path.join(projectPath, 'requirements.txt');
  let framework = null;

  if (fs.existsSync(pyproject)) {
    try {
      const content = fs.readFileSync(pyproject, 'utf8');
      if (content.includes('django')) framework = 'Django';
      else if (content.includes('fastapi')) framework = 'FastAPI';
      else if (content.includes('flask')) framework = 'Flask';
    } catch { /* ignore */ }
  }

  if (!framework && fs.existsSync(requirements)) {
    try {
      const content = fs.readFileSync(requirements, 'utf8').toLowerCase();
      if (content.includes('django')) framework = 'Django';
      else if (content.includes('fastapi')) framework = 'FastAPI';
      else if (content.includes('flask')) framework = 'Flask';
    } catch { /* ignore */ }
  }

  return { language: 'Python', framework };
}

function parseGitConfig(projectPath) {
  const gitConfigPath = path.join(projectPath, '.git', 'config');
  if (!fs.existsSync(gitConfigPath)) return null;

  try {
    const content = fs.readFileSync(gitConfigPath, 'utf8');
    const remoteMatch = content.match(/\[remote "origin"\]\s*\n\s*url\s*=\s*(.+)/);
    if (!remoteMatch) return null;

    const url = remoteMatch[1].trim();
    const githubMatch = url.match(/github\.com[:/]([^/]+)\/([^/.]+)/);

    const result = { remote: url, owner: null, repo: null, branch: null };
    if (githubMatch) {
      result.owner = githubMatch[1];
      result.repo = githubMatch[2];
    }

    // Try to detect current branch
    const headPath = path.join(projectPath, '.git', 'HEAD');
    if (fs.existsSync(headPath)) {
      const head = fs.readFileSync(headPath, 'utf8').trim();
      const branchMatch = head.match(/ref: refs\/heads\/(.+)/);
      if (branchMatch) result.branch = branchMatch[1];
    }

    return result;
  } catch {
    return null;
  }
}

function scanProjectFolder(localPath) {
  if (!fs.existsSync(localPath)) {
    throw new ProjectServiceError(400, 'PATH_NOT_FOUND', `Path does not exist: ${localPath}`);
  }

  const stat = fs.statSync(localPath);
  if (!stat.isDirectory()) {
    throw new ProjectServiceError(400, 'NOT_DIRECTORY', `Path is not a directory: ${localPath}`);
  }

  let projectName = path.basename(localPath);
  let language = null;
  let framework = null;

  // Detect from package.json
  const pkgPath = path.join(localPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.name) projectName = pkg.name;
    } catch { /* use folder name */ }
    const detected = detectLanguageFromPackageJson(pkgPath);
    language = detected.language;
    framework = detected.framework;
  }

  // Detect Python if no JS detected
  if (!language) {
    const pyproject = path.join(localPath, 'pyproject.toml');
    const requirements = path.join(localPath, 'requirements.txt');
    if (fs.existsSync(pyproject) || fs.existsSync(requirements)) {
      const detected = detectPythonProject(localPath);
      language = detected.language;
      framework = detected.framework;
    }
  }

  // Parse git config
  const git = parseGitConfig(localPath);

  // Detect README
  const readmePath = path.join(localPath, 'README.md');
  const hasReadme = fs.existsSync(readmePath);

  return {
    project_name: projectName,
    primary_language: language || 'Unknown',
    framework: framework || null,
    git_remote: git?.remote || null,
    github_owner: git?.owner || null,
    github_repo: git?.repo || null,
    github_branch: git?.branch || null,
    has_readme: hasReadme,
    files_detected: {
      'package.json': fs.existsSync(pkgPath),
      '.git/config': !!git,
      'pyproject.toml': fs.existsSync(path.join(localPath, 'pyproject.toml')),
      'requirements.txt': fs.existsSync(path.join(localPath, 'requirements.txt')),
      'README.md': hasReadme,
    },
  };
}

// ── GitHub validation ──────────────────────────────────

const GITHUB_USERNAME_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;
const GITHUB_REPO_URL_REGEX = /^https?:\/\/github\.com\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)\/?$/;

function validateGitHubUsername(username) {
  return GITHUB_USERNAME_REGEX.test(username);
}

function parseGitHubUrl(url) {
  const match = url.match(GITHUB_REPO_URL_REGEX);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

async function checkGitHubRepoExists(owner, repo) {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'swastik-mcp-bot' },
    });
    if (res.status === 200) return { exists: true };
    if (res.status === 404) return { exists: false, reason: 'Repository not found' };
    if (res.status === 403) return { exists: null, reason: 'GitHub rate limit reached' };
    return { exists: null, reason: `GitHub API returned ${res.status}` };
  } catch (err) {
    return { exists: null, reason: err.message };
  }
}

// ── CRUD — Projects ────────────────────────────────────

async function createProject(context, data) {
  if (!context.uid) throw new ProjectServiceError(401, 'UNAUTHORIZED', 'Auth required');

  const { local_path, github_url } = data;
  let metadata;

  if (local_path) {
    metadata = scanProjectFolder(local_path);
  } else if (github_url) {
    const parsed = parseGitHubUrl(github_url);
    if (!parsed) throw new ProjectServiceError(400, 'INVALID_URL', 'Invalid GitHub URL format');
    metadata = {
      project_name: parsed.repo,
      primary_language: 'Unknown',
      framework: null,
      git_remote: github_url,
      github_owner: parsed.owner,
      github_repo: parsed.repo,
      github_branch: 'main',
    };
  } else {
    throw new ProjectServiceError(400, 'BAD_REQUEST', 'local_path or github_url required');
  }

  const id = `${metadata.project_name}-${Date.now()}`.replace(/[^a-zA-Z0-9_-]/g, '_');

  // Store in SQLite (includes local_path)
  const db = getDB();
  db.prepare(`
    INSERT INTO projects (id, project_name, local_path, primary_language, framework,
      git_remote, github_owner, github_repo, github_branch, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, metadata.project_name, local_path || null,
    metadata.primary_language, metadata.framework,
    metadata.git_remote, metadata.github_owner, metadata.github_repo,
    metadata.github_branch, context.uid,
  );

  // Store in Firestore (WITHOUT local_path)
  try {
    const firestore = getFirestore();
    await firestore.collection('projects').doc(id).set({
      project_name: metadata.project_name,
      primary_language: metadata.primary_language,
      framework: metadata.framework,
      git_remote: metadata.git_remote,
      github_owner: metadata.github_owner,
      github_repo: metadata.github_repo,
      github_branch: metadata.github_branch,
      created_by: context.uid,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Firestore is optional; local SQLite is authoritative
  }

  return { id, ...metadata, local_path: local_path || null };
}

function listProjects(context) {
  if (!context.uid) throw new ProjectServiceError(401, 'UNAUTHORIZED', 'Auth required');
  const db = getDB();
  return db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
}

function getProject(context, projectId) {
  if (!context.uid) throw new ProjectServiceError(401, 'UNAUTHORIZED', 'Auth required');
  const db = getDB();
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!row) throw new ProjectServiceError(404, 'NOT_FOUND', 'Project not found');
  return row;
}

function rescanProject(context, projectId) {
  if (!context.uid) throw new ProjectServiceError(401, 'UNAUTHORIZED', 'Auth required');
  const db = getDB();
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!row) throw new ProjectServiceError(404, 'NOT_FOUND', 'Project not found');
  if (!row.local_path) throw new ProjectServiceError(400, 'NO_LOCAL_PATH', 'Project has no local path to rescan');

  const metadata = scanProjectFolder(row.local_path);

  db.prepare(`
    UPDATE projects SET project_name = ?, primary_language = ?, framework = ?,
      git_remote = ?, github_owner = ?, github_repo = ?, github_branch = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    metadata.project_name, metadata.primary_language, metadata.framework,
    metadata.git_remote, metadata.github_owner, metadata.github_repo,
    metadata.github_branch, projectId,
  );

  return { id: projectId, ...metadata, local_path: row.local_path };
}

// ── CRUD — MCP Clients ────────────────────────────────

const VALID_CLIENT_TYPES = [
  'claude-desktop', 'vscode', 'continue-dev', 'cursor', 'chatgpt-bridge',
  'gemini-bridge', 'antigravity', 'stitch', 'generic',
];

const VALID_CONNECTION_MODES = ['http', 'stdio'];
const VALID_PERMISSIONS = ['memory-only', 'memory+project-metadata', 'memory+project-files'];

function createMcpClient(context, data) {
  if (!context.uid) throw new ProjectServiceError(401, 'UNAUTHORIZED', 'Auth required');

  const { name, client_type, connection_mode, permissions } = data;
  if (!name || !client_type) throw new ProjectServiceError(400, 'BAD_REQUEST', 'name and client_type required');
  if (!VALID_CLIENT_TYPES.includes(client_type)) {
    throw new ProjectServiceError(400, 'INVALID_CLIENT_TYPE', `Invalid client_type. Valid: ${VALID_CLIENT_TYPES.join(', ')}`);
  }
  const mode = connection_mode || 'http';
  if (!VALID_CONNECTION_MODES.includes(mode)) {
    throw new ProjectServiceError(400, 'INVALID_MODE', `Invalid connection_mode. Valid: ${VALID_CONNECTION_MODES.join(', ')}`);
  }
  const perms = permissions || 'memory-only';
  if (!VALID_PERMISSIONS.includes(perms)) {
    throw new ProjectServiceError(400, 'INVALID_PERMS', `Invalid permissions. Valid: ${VALID_PERMISSIONS.join(', ')}`);
  }

  const id = `mcp-${client_type}-${Date.now()}`;
  const db = getDB();
  db.prepare(`
    INSERT INTO mcp_clients (id, name, client_type, connection_mode, permissions, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, name, client_type, mode, perms, context.uid);

  return { id, name, client_type, connection_mode: mode, permissions: perms, enabled: 1 };
}

function listMcpClients(context) {
  if (!context.uid) throw new ProjectServiceError(401, 'UNAUTHORIZED', 'Auth required');
  const db = getDB();
  return db.prepare('SELECT * FROM mcp_clients ORDER BY created_at DESC').all();
}

function getMcpClient(context, clientId) {
  if (!context.uid) throw new ProjectServiceError(401, 'UNAUTHORIZED', 'Auth required');
  const db = getDB();
  const row = db.prepare('SELECT * FROM mcp_clients WHERE id = ?').get(clientId);
  if (!row) throw new ProjectServiceError(404, 'NOT_FOUND', 'MCP client not found');
  return row;
}

function getMcpClientPermission(context, clientId) {
  const client = getMcpClient(context, clientId);
  return client.permissions || 'memory-only';
}

function updateMcpClient(context, clientId, updates) {
  if (!context.uid) throw new ProjectServiceError(401, 'UNAUTHORIZED', 'Auth required');
  const db = getDB();
  const existing = db.prepare('SELECT * FROM mcp_clients WHERE id = ?').get(clientId);
  if (!existing) throw new ProjectServiceError(404, 'NOT_FOUND', 'MCP client not found');

  const enabled = updates.enabled !== undefined ? (updates.enabled ? 1 : 0) : existing.enabled;
  const perms = updates.permissions || existing.permissions;
  const name = updates.name || existing.name;

  db.prepare(`
    UPDATE mcp_clients SET name = ?, permissions = ?, enabled = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(name, perms, enabled, clientId);

  return { ...existing, name, permissions: perms, enabled };
}

function testMcpClient(context, clientId) {
  if (!context.uid) throw new ProjectServiceError(401, 'UNAUTHORIZED', 'Auth required');
  const db = getDB();
  const client = db.prepare('SELECT * FROM mcp_clients WHERE id = ?').get(clientId);
  if (!client) throw new ProjectServiceError(404, 'NOT_FOUND', 'MCP client not found');

  // Test MCP connectivity — verify backend is healthy
  const { getMcpHealth } = require('../mcp/server');
  const health = getMcpHealth();
  const success = health.sqliteReady && health.firestoreReady;

  db.prepare(`
    UPDATE mcp_clients SET last_tested_at = datetime('now'), test_status = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(success ? 'success' : 'failure', clientId);

  return {
    success,
    client_id: clientId,
    connection_mode: client.connection_mode,
    mcp_health: health,
    tested_at: new Date().toISOString(),
  };
}

function reconnectMcpClient(context, clientId) {
  const result = testMcpClient(context, clientId);
  return {
    ...result,
    reconnected: result.success,
  };
}

module.exports = {
  ProjectServiceError,
  ensureProjectTables,
  scanProjectFolder,
  validateGitHubUsername,
  parseGitHubUrl,
  checkGitHubRepoExists,
  createProject,
  listProjects,
  getProject,
  rescanProject,
  createMcpClient,
  listMcpClients,
  getMcpClient,
  getMcpClientPermission,
  updateMcpClient,
  testMcpClient,
  reconnectMcpClient,
  VALID_CLIENT_TYPES,
  VALID_CONNECTION_MODES,
  VALID_PERMISSIONS,
};
