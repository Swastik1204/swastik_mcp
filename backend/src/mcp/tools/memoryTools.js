const {
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
} = require('../../services/memoryService');
const { listProjects } = require('../../services/projectService');

function autoMemoryKey(prefix = 'manual') {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${random}`;
}

async function gatherMemoryRows(context, includeDeleted = false) {
  const global = await listGlobalMemory(context, includeDeleted);
  const rows = (global.items || []).map((item) => ({ ...item, scope: 'global', projectId: null }));

  let projects = [];
  try {
    projects = listProjects(context) || [];
  } catch {
    projects = [];
  }

  for (const project of projects) {
    const projectData = await listProjectMemory(context, project.id, includeDeleted);
    for (const item of projectData.items || []) {
      rows.push({ ...item, scope: 'project', projectId: project.id, project_name: project.project_name });
    }
  }

  return rows;
}

function normalizeTags(value) {
  if (!value || typeof value !== 'object') return [];
  if (!Array.isArray(value.tags)) return [];
  return value.tags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean);
}

function normalizeScope(scope) {
  if (!scope) {
    return { type: 'global', projectId: null };
  }
  if (scope === 'global') {
    return { type: 'global', projectId: null };
  }
  return { type: 'project', projectId: scope };
}

function validateMemoryScope(scope) {
  if (!scope) {
    throw new Error('scope is required');
  }
}

function registerMemoryTools() {
  return [
    {
      name: 'read_memory',
      description: 'Read a memory entry by key from global or project scope.',
      ownerOnly: false,
      writeEffect: false,
      inputSchema: {
        type: 'object',
        properties: {
          scope: { type: 'string', description: 'global or a projectId' },
          key: { type: 'string', description: 'Memory key' },
          includeDeleted: { type: 'boolean', default: false },
        },
        required: ['scope', 'key'],
      },
      handler: async ({ args, context }) => {
        validateMemoryScope(args.scope);
        const normalized = normalizeScope(args.scope);
        if (normalized.type === 'global') {
          return getGlobalMemory(context, args.key, args.includeDeleted === true);
        }
        return getProjectMemory(context, normalized.projectId, args.key, args.includeDeleted === true);
      },
    },
    {
      name: 'write_memory',
      description: 'Write or update memory value in global or project scope.',
      ownerOnly: false,
      writeEffect: true,
      inputSchema: {
        type: 'object',
        properties: {
          scope: { type: 'string', description: 'global or a projectId' },
          key: { type: 'string' },
          value: { description: 'Any JSON-serializable value' },
        },
        required: ['scope', 'key', 'value'],
      },
      handler: async ({ args, context }) => {
        validateMemoryScope(args.scope);
        const normalized = normalizeScope(args.scope);
        if (normalized.type === 'global') {
          return setGlobalMemory(context, args.key, args.value);
        }
        return setProjectMemory(context, normalized.projectId, args.key, args.value);
      },
    },
    {
      name: 'delete_memory',
      description: 'Tombstone-delete memory in global or project scope (owner-only).',
      ownerOnly: true,
      writeEffect: true,
      inputSchema: {
        type: 'object',
        properties: {
          scope: { type: 'string' },
          key: { type: 'string' },
          reason: { type: 'string' },
          infection_id: { type: 'string' },
        },
        required: ['scope', 'key'],
      },
      handler: async ({ args, context }) => {
        validateMemoryScope(args.scope);
        const normalized = normalizeScope(args.scope);
        if (normalized.type === 'global') {
          return deleteGlobalMemory(context, args.key, args.reason, args.infection_id);
        }
        return deleteProjectMemory(context, normalized.projectId, args.key, args.reason, args.infection_id);
      },
    },
    {
      name: 'restore_memory',
      description: 'Restore tombstoned memory in global or project scope (owner-only).',
      ownerOnly: true,
      writeEffect: true,
      inputSchema: {
        type: 'object',
        properties: {
          scope: { type: 'string' },
          key: { type: 'string' },
        },
        required: ['scope', 'key'],
      },
      handler: async ({ args, context }) => {
        validateMemoryScope(args.scope);
        const normalized = normalizeScope(args.scope);
        if (normalized.type === 'global') {
          return restoreGlobalMemory(context, args.key);
        }
        return restoreProjectMemory(context, normalized.projectId, args.key);
      },
    },
    {
      name: 'list_memory',
      description: 'List memory entries in global or project scope.',
      ownerOnly: false,
      writeEffect: false,
      inputSchema: {
        type: 'object',
        properties: {
          scope: { type: 'string', description: 'global or a projectId' },
          includeDeleted: { type: 'boolean', default: false },
        },
        required: ['scope'],
      },
      handler: async ({ args, context }) => {
        validateMemoryScope(args.scope);
        const normalized = normalizeScope(args.scope);
        if (normalized.type === 'global') {
          return listGlobalMemory(context, args.includeDeleted === true);
        }
        return listProjectMemory(context, normalized.projectId, args.includeDeleted === true);
      },
    },
    {
      name: 'list_memories_filtered',
      description: 'List memory entries filtered by project, tag, importance, and deletion state.',
      ownerOnly: false,
      writeEffect: false,
      requiredPermission: 'memory-only',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'Optional project id; use "global" for global memory only' },
          tag: { type: 'string' },
          importance: { type: 'string', enum: ['low', 'medium', 'high'] },
          includeDeleted: { type: 'boolean', default: false },
          limit: { type: 'number', default: 200 },
        },
      },
      handler: async ({ args, context }) => {
        const includeDeleted = args.includeDeleted === true;
        let rows = await gatherMemoryRows(context, includeDeleted);

        if (args.projectId) {
          rows = rows.filter((row) => {
            if (args.projectId === 'global') return row.scope === 'global';
            return row.projectId === args.projectId;
          });
        }

        if (args.tag) {
          const wanted = String(args.tag).trim().toLowerCase();
          rows = rows.filter((row) => normalizeTags(row.value).includes(wanted));
        }

        if (args.importance) {
          rows = rows.filter((row) => {
            if (!row.value || typeof row.value !== 'object') return false;
            return row.value.importance === args.importance;
          });
        }

        const limit = Math.min(Number(args.limit || 200), 500);
        return {
          count: rows.length,
          items: rows.slice(0, limit),
        };
      },
    },
    {
      name: 'search_memories',
      description: 'Search memory text/value content by free-text query.',
      ownerOnly: false,
      writeEffect: false,
      requiredPermission: 'memory-only',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          includeDeleted: { type: 'boolean', default: false },
          limit: { type: 'number', default: 50 },
        },
        required: ['query'],
      },
      handler: async ({ args, context }) => {
        const q = String(args.query || '').trim().toLowerCase();
        const includeDeleted = args.includeDeleted === true;
        const rows = await gatherMemoryRows(context, includeDeleted);
        const hits = rows.filter((row) => {
          const haystack = `${row.key} ${JSON.stringify(row.value || '')}`.toLowerCase();
          return haystack.includes(q);
        });

        const limit = Math.min(Number(args.limit || 50), 200);
        return {
          query: args.query,
          count: hits.length,
          items: hits.slice(0, limit),
        };
      },
    },
    {
      name: 'add_freeform_memory',
      description: 'Add manual free-form memory with optional tags/project/importance metadata.',
      ownerOnly: false,
      writeEffect: true,
      requiredPermission: 'memory-only',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          projectId: { type: 'string' },
          importance: { type: 'string', enum: ['low', 'medium', 'high'] },
          pinned: { type: 'boolean', default: false },
          key: { type: 'string', description: 'Optional explicit key' },
        },
        required: ['text'],
      },
      handler: async ({ args, context }) => {
        const text = String(args.text || '').trim();
        if (!text) {
          throw new Error('text is required');
        }

        const key = args.key || autoMemoryKey('freeform');
        const payload = {
          manual: true,
          text,
          tags: Array.isArray(args.tags) ? args.tags : [],
          importance: args.importance || 'medium',
          pinned: args.pinned === true,
          created_at: new Date().toISOString(),
        };

        if (args.projectId) {
          const result = await setProjectMemory(context, args.projectId, key, payload);
          return { scope: 'project', projectId: args.projectId, key, ...result };
        }

        const result = await setGlobalMemory(context, key, payload);
        return { scope: 'global', key, ...result };
      },
    },
    {
      name: 'visualize_memory_summary',
      description: 'Return summary counts by project, tags, recent edits, and deleted count.',
      ownerOnly: false,
      writeEffect: false,
      requiredPermission: 'memory+project-metadata',
      inputSchema: {
        type: 'object',
        properties: {
          includeDeleted: { type: 'boolean', default: true },
        },
      },
      handler: async ({ args, context }) => {
        const includeDeleted = args.includeDeleted !== false;
        const rows = await gatherMemoryRows(context, includeDeleted);
        const byProject = {};
        const byTag = {};
        let deletedCount = 0;

        for (const row of rows) {
          const projectKey = row.projectId || 'global';
          byProject[projectKey] = (byProject[projectKey] || 0) + 1;

          if (row.deleted) deletedCount += 1;

          for (const tag of normalizeTags(row.value)) {
            byTag[tag] = (byTag[tag] || 0) + 1;
          }
        }

        const recentEdits = [...rows]
          .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
          .slice(0, 20)
          .map((row) => ({
            key: row.key,
            projectId: row.projectId,
            updated_at: row.updated_at,
            deleted: !!row.deleted,
          }));

        return {
          total: rows.length,
          deleted_count: deletedCount,
          counts_by_project: byProject,
          counts_by_tag: byTag,
          recent_edits: recentEdits,
        };
      },
    },
  ];
}

module.exports = { registerMemoryTools };
