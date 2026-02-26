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
  ];
}

module.exports = { registerMemoryTools };
