const { registerMemoryTools } = require('./memoryTools');
const { createFutureToolTemplate } = require('./futureToolTemplate');

function registerTools() {
  const tools = [
    ...registerMemoryTools(),
    createFutureToolTemplate(),
  ];

  const byName = new Map();
  for (const tool of tools) {
    byName.set(tool.name, tool);
  }

  return {
    tools,
    getTool(name) {
      return byName.get(name) || null;
    },
    listToolMetadata() {
      return tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        ownerOnly: tool.ownerOnly,
        writeEffect: tool.writeEffect,
        inputSchema: tool.inputSchema,
      }));
    },
  };
}

module.exports = { registerTools };
