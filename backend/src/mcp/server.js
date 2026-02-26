/**
 * MCP Compatibility Layer — Model Context Protocol server module.
 *
 * Exposes Swastik MCP memory as:
 *   Resources:  memory://global, memory://project/{projectId}
 *   Tools:      read_memory, write_memory, delete_memory, restore_memory, list_projects
 *
 * Usage:
 *   1) As an Express sub-router mounted at /mcp   (for HTTP-based MCP transports)
 *   2) As a standalone STDIO server                (for Claude Desktop / VS Code)
 *
 * Claude Desktop config (~/.config/claude/claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "swastik-brain": {
 *         "command": "node",
 *         "args": ["<path>/backend/src/mcp/server.js", "--stdio"],
 *         "env": { "FIREBASE_SERVICE_ACCOUNT_PATH": "./firebase-key.json" }
 *       }
 *     }
 *   }
 */

const { Router } = require('express');
const sqlite = require('../db/sqlite');

const DEVICE_ID = process.env.DEVICE_ID || 'mcp-server';

// ── MCP Protocol Metadata ──────────────────────────────

const SERVER_INFO = {
  name: 'swastik-brain',
  version: '0.2.0',
  description: 'Personal MCP brain — global & project memory with tombstone-safe deletion',
  capabilities: {
    resources: true,
    tools: true,
  },
};

const RESOURCES = [
  {
    uri: 'memory://global',
    name: 'Global Memory',
    description: 'Key-value pairs shared across all projects',
    mimeType: 'application/json',
  },
  {
    uri: 'memory://projects',
    name: 'Project List',
    description: 'List of all project IDs with memory',
    mimeType: 'application/json',
  },
];

const TOOLS = [
  {
    name: 'read_memory',
    description: 'Read a memory entry by key. Scope: "global" or a projectId.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', description: '"global" or a projectId' },
        key: { type: 'string', description: 'Memory key to read' },
        includeDeleted: { type: 'boolean', description: 'Include tombstoned entries', default: false },
      },
      required: ['scope', 'key'],
    },
  },
  {
    name: 'write_memory',
    description: 'Write/update a memory entry.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', description: '"global" or a projectId' },
        key: { type: 'string' },
        value: { description: 'Any JSON-serializable value' },
      },
      required: ['scope', 'key', 'value'],
    },
  },
  {
    name: 'delete_memory',
    description: 'Tombstone-delete a memory entry (reversible).',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string' },
        key: { type: 'string' },
        reason: { type: 'string', description: 'Why is this being deleted?' },
      },
      required: ['scope', 'key'],
    },
  },
  {
    name: 'restore_memory',
    description: 'Restore a previously tombstoned memory entry.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string' },
        key: { type: 'string' },
      },
      required: ['scope', 'key'],
    },
  },
  {
    name: 'list_memory',
    description: 'List all memory keys in a scope.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', description: '"global" or a projectId' },
        includeDeleted: { type: 'boolean', default: false },
      },
      required: ['scope'],
    },
  },
];

// ── Tool Handlers ──────────────────────────────────────

function handleTool(name, args, callerUid) {
  const uid = callerUid || 'mcp-client';
  const meta = { updated_by: uid, source_device_id: DEVICE_ID };

  switch (name) {
    case 'read_memory': {
      const { scope, key, includeDeleted } = args;
      let entry;
      if (scope === 'global') {
        entry = sqlite.getGlobalMemoryFull(key);
      } else {
        entry = sqlite.getProjectMemoryFull(scope, key);
      }
      if (!entry) return { error: 'Not found' };
      if (entry.deleted && !includeDeleted) return { error: 'Entry is deleted (tombstoned)' };
      return entry;
    }

    case 'write_memory': {
      const { scope, key, value } = args;
      let revision;
      if (scope === 'global') {
        revision = sqlite.setGlobalMemory(key, value, meta);
      } else {
        revision = sqlite.setProjectMemory(scope, key, value, meta);
      }
      return { status: 'written', scope, key, revision };
    }

    case 'delete_memory': {
      const { scope, key, reason } = args;
      const delMeta = { ...meta, deleted_by: uid, delete_reason: reason || 'MCP delete' };
      let revision;
      if (scope === 'global') {
        revision = sqlite.tombstoneGlobalMemory(key, delMeta);
      } else {
        revision = sqlite.tombstoneProjectMemory(scope, key, delMeta);
      }
      if (!revision) return { error: 'Key not found' };
      sqlite.logAudit('DELETE', scope === 'global' ? 'global_memory' : 'project_memory',
        scope === 'global' ? key : `${scope}/${key}`, uid, delMeta);
      return { status: 'deleted', scope, key, revision };
    }

    case 'restore_memory': {
      const { scope, key } = args;
      let revision;
      if (scope === 'global') {
        revision = sqlite.restoreGlobalMemory(key, meta);
      } else {
        revision = sqlite.restoreProjectMemory(scope, key, meta);
      }
      if (!revision) return { error: 'Key not found or not deleted' };
      sqlite.logAudit('RESTORE', scope === 'global' ? 'global_memory' : 'project_memory',
        scope === 'global' ? key : `${scope}/${key}`, uid, {});
      return { status: 'restored', scope, key, revision };
    }

    case 'list_memory': {
      const { scope, includeDeleted } = args;
      if (scope === 'global') {
        return { items: sqlite.getAllGlobalMemory(includeDeleted) };
      }
      return { items: sqlite.getAllProjectMemory(scope, includeDeleted) };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

function handleResource(uri) {
  if (uri === 'memory://global') {
    return { contents: sqlite.getAllGlobalMemory(false) };
  }
  if (uri === 'memory://projects') {
    // Return unique project IDs from project_memory table
    try {
      const db = sqlite.getDB();
      const rows = db.prepare('SELECT DISTINCT project_id FROM project_memory WHERE deleted = 0').all();
      return { contents: rows.map(r => r.project_id) };
    } catch {
      return { contents: [] };
    }
  }
  // memory://project/{projectId}
  const match = uri.match(/^memory:\/\/project\/(.+)$/);
  if (match) {
    return { contents: sqlite.getAllProjectMemory(match[1], false) };
  }
  return { error: 'Unknown resource URI' };
}

// ── Express Router (HTTP transport) ────────────────────

const router = Router();

router.get('/info', (_req, res) => res.json(SERVER_INFO));
router.get('/resources', (_req, res) => res.json(RESOURCES));
router.get('/tools', (_req, res) => res.json(TOOLS));

router.post('/resources/read', (req, res) => {
  const { uri } = req.body;
  res.json(handleResource(uri));
});

router.post('/tools/call', (req, res) => {
  const { name, arguments: args } = req.body;
  const uid = req.user ? req.user.uid : 'mcp-http';
  res.json(handleTool(name, args || {}, uid));
});

// ── STDIO Transport (for Claude Desktop / VS Code) ─────

function runStdio() {
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });

  function send(obj) {
    process.stdout.write(JSON.stringify(obj) + '\n');
  }

  rl.on('line', (line) => {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }

    const { jsonrpc, id, method, params } = msg;

    if (method === 'initialize') {
      return send({ jsonrpc: '2.0', id, result: { ...SERVER_INFO, protocolVersion: '2024-11-05' } });
    }
    if (method === 'resources/list') {
      return send({ jsonrpc: '2.0', id, result: { resources: RESOURCES } });
    }
    if (method === 'resources/read') {
      return send({ jsonrpc: '2.0', id, result: handleResource(params.uri) });
    }
    if (method === 'tools/list') {
      return send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    }
    if (method === 'tools/call') {
      const result = handleTool(params.name, params.arguments || {}, 'stdio-client');
      return send({
        jsonrpc: '2.0', id,
        result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] },
      });
    }
    // notifications (initialized, etc.) — no response needed
    if (!id) return;

    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown method: ${method}` } });
  });

  rl.on('close', () => process.exit(0));
}

// ── Auto-start STDIO if invoked directly with --stdio ──

if (require.main === module && process.argv.includes('--stdio')) {
  // Initialize SQLite (it auto-inits on require, but ensure DB path)
  require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
  runStdio();
}

module.exports = { router, SERVER_INFO, RESOURCES, TOOLS, handleTool, handleResource, runStdio };
