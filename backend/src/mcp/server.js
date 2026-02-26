/**
 * MCP Compatibility Layer — HTTP + STDIO transports.
 * Uses shared memory service and modular tool registration.
 */

const { Router } = require('express');
const path = require('path');
const readline = require('readline');

const sqlite = require('../db/sqlite');
const { initSQLite, getDB } = require('../db/sqlite');
const { initFirebase, getFirestore } = require('../config/firebase');
const { getSyncStatus } = require('../sync/engine');
const { MemoryServiceError, formatMcpError } = require('../services/memoryService');
const { registerTools } = require('./tools/registerTools');

const DEFAULT_DEVICE_ID = process.env.DEVICE_ID || 'mcp-server';

const runtimeState = {
  mode: null,
  sqliteReady: false,
  firestoreReady: false,
  syncEngineReady: false,
};

const SERVER_INFO = {
  name: 'swastik-brain',
  version: '0.3.0',
  description: 'Personal MCP brain with REST-parity memory semantics',
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
  {
    uri: 'memory://project/{projectId}',
    name: 'Project Memory',
    description: 'Project-scoped key-value entries',
    mimeType: 'application/json',
  },
];

const toolRegistry = registerTools();

function getToolListForMcp() {
  return toolRegistry.listToolMetadata().map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}

function getToolListForHttp() {
  return toolRegistry.listToolMetadata();
}

function buildContext({ uid, mode, source, deviceId }) {
  return {
    uid,
    mode,
    source,
    deviceId: deviceId || DEFAULT_DEVICE_ID,
  };
}

function toMcpError(error) {
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
  return formatMcpError(error);
}

function logToolCall(name, uid, success, message = '') {
  const actor = uid || 'anonymous';
  const status = success ? 'success' : 'failure';
  const tail = message ? ` (${message})` : '';
  console.log(`[MCP] tool=${name} uid=${actor} status=${status}${tail}`);
}

async function executeTool(name, args, context) {
  const tool = toolRegistry.getTool(name);
  if (!tool) {
    throw new MemoryServiceError(404, 'TOOL_NOT_FOUND', `Unknown tool: ${name}`);
  }

  if (tool.ownerOnly) {
    const ownerUid = process.env.OWNER_UID;
    if (!ownerUid) {
      throw new MemoryServiceError(500, 'SERVER_MISCONFIG', 'Server misconfigured: OWNER_UID not set');
    }
    if (!context.uid || context.uid !== ownerUid) {
      throw new MemoryServiceError(403, 'FORBIDDEN', 'Owner-only action');
    }
  }

  const result = await tool.handler({ args, context });
  return { ok: true, result };
}

function readResource(uri) {
  if (uri === 'memory://global') {
    return { contents: sqlite.getAllGlobalMemory(false) };
  }

  if (uri === 'memory://projects') {
    const db = getDB();
    const rows = db.prepare('SELECT DISTINCT project_id FROM project_memory WHERE deleted = 0').all();
    return { contents: rows.map((row) => row.project_id) };
  }

  const match = uri.match(/^memory:\/\/project\/(.+)$/);
  if (match) {
    return { contents: sqlite.getAllProjectMemory(match[1], false) };
  }

  return {
    error: {
      code: 'RESOURCE_NOT_FOUND',
      message: 'Unknown resource URI',
    },
  };
}

function bootstrapMcp({ mode, initializeBackends = false }) {
  runtimeState.mode = mode;

  try {
    if (initializeBackends) {
      initSQLite();
    }
    getDB();
    runtimeState.sqliteReady = true;
    console.log('[MCP] SQLite initialised');
  } catch (error) {
    runtimeState.sqliteReady = false;
    console.error('[MCP] SQLite init failed:', error.message);
  }

  try {
    if (initializeBackends) {
      initFirebase();
    }
    getFirestore();
    runtimeState.firestoreReady = true;
    console.log('[MCP] Firestore connected');
  } catch (error) {
    runtimeState.firestoreReady = false;
    console.error('[MCP] Firestore init failed:', error.message);
  }

  try {
    getSyncStatus();
    runtimeState.syncEngineReady = true;
    console.log('[MCP] Sync engine ready');
  } catch (error) {
    runtimeState.syncEngineReady = false;
    console.error('[MCP] Sync engine not ready:', error.message);
  }

  console.log(`[MCP] Mode: ${mode}`);
}

function getMcpHealth() {
  let syncQueueDepth = 0;
  let deadLetters = 0;
  try {
    const sync = getSyncStatus();
    syncQueueDepth = sync.pending;
    deadLetters = sync.deadLetters;
  } catch {
    syncQueueDepth = -1;
    deadLetters = -1;
  }

  return {
    mode: runtimeState.mode || 'uninitialized',
    sqliteReady: runtimeState.sqliteReady,
    firestoreReady: runtimeState.firestoreReady,
    syncQueueDepth,
    deadLetters,
  };
}

const router = Router();

router.get('/info', (_req, res) => {
  res.json({
    ...SERVER_INFO,
    mode: 'HTTP',
  });
});

router.get('/resources', (_req, res) => {
  res.json(RESOURCES);
});

router.get('/tools', (_req, res) => {
  res.json(getToolListForHttp());
});

router.get('/list_tools', (_req, res) => {
  res.json({ tools: getToolListForHttp() });
});

router.post('/resources/read', (req, res) => {
  const { uri } = req.body || {};
  res.json(readResource(uri));
});

router.post('/tools/call', async (req, res) => {
  const { name, arguments: args = {} } = req.body || {};
  const uid = req.user?.uid;
  const context = buildContext({
    uid,
    mode: 'http',
    source: 'mcp-http',
    deviceId: req.headers['x-device-id'] || DEFAULT_DEVICE_ID,
  });

  try {
    const payload = await executeTool(name, args, context);
    logToolCall(name, uid, true);
    res.json(payload);
  } catch (error) {
    logToolCall(name, uid, false, error.message);
    const formatted = toMcpError(error);
    res.status(formatted.error.status || 500).json(formatted);
  }
});

router.post('/call_tool', async (req, res) => {
  const { name, args = {}, callerUid } = req.body || {};
  const uid = req.user?.uid || callerUid;
  const context = buildContext({
    uid,
    mode: 'http',
    source: 'mcp-http',
    deviceId: req.headers['x-device-id'] || DEFAULT_DEVICE_ID,
  });

  try {
    const payload = await executeTool(name, args, context);
    logToolCall(name, uid, true);
    res.json(payload);
  } catch (error) {
    logToolCall(name, uid, false, error.message);
    const formatted = toMcpError(error);
    res.status(formatted.error.status || 500).json(formatted);
  }
});

function runStdio() {
  bootstrapMcp({ mode: 'STDIO', initializeBackends: true });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });

  function send(payload) {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  }

  rl.on('line', async (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }

    const { id, method, params = {} } = message;

    if (method === 'initialize') {
      return send({
        jsonrpc: '2.0',
        id,
        result: {
          ...SERVER_INFO,
          protocolVersion: '2024-11-05',
          mode: 'STDIO',
        },
      });
    }

    if (method === 'resources/list') {
      return send({ jsonrpc: '2.0', id, result: { resources: RESOURCES } });
    }

    if (method === 'resources/read') {
      return send({ jsonrpc: '2.0', id, result: readResource(params.uri) });
    }

    if (method === 'tools/list' || method === 'list_tools') {
      return send({ jsonrpc: '2.0', id, result: { tools: getToolListForMcp() } });
    }

    if (method === 'tools/call' || method === 'call_tool') {
      const toolName = params.name;
      const toolArgs = params.arguments || params.args || {};
      const callerUid = params.callerUid || params.uid || 'stdio-client';
      const context = buildContext({
        uid: callerUid,
        mode: 'stdio',
        source: 'mcp-stdio',
        deviceId: params.deviceId || DEFAULT_DEVICE_ID,
      });

      try {
        const payload = await executeTool(toolName, toolArgs, context);
        logToolCall(toolName, callerUid, true);
        return send({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
          },
        });
      } catch (error) {
        logToolCall(toolName, callerUid, false, error.message);
        return send({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(toMcpError(error), null, 2) }],
            isError: true,
          },
        });
      }
    }

    if (!id) {
      return;
    }

    return send({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32601,
        message: `Unknown method: ${method}`,
      },
    });
  });

  rl.on('close', () => process.exit(0));
}

if (require.main === module && process.argv.includes('--stdio')) {
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
  runStdio();
}

module.exports = {
  router,
  SERVER_INFO,
  RESOURCES,
  runStdio,
  getMcpHealth,
  bootstrapMcp,
};
