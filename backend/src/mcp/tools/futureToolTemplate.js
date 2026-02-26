function createFutureToolTemplate() {
  return {
    name: 'future_tool_template',
    description: 'Template tool for future MCP integrations (embeddings, summarization, project actions).',
    ownerOnly: false,
    writeEffect: false,
    inputSchema: {
      type: 'object',
      properties: {
        note: { type: 'string' },
      },
      required: [],
    },
    handler: async () => ({
      status: 'not_implemented',
      message: 'Template tool registered for future integrations.',
    }),
  };
}

module.exports = { createFutureToolTemplate };
