/**
 * Project MCP Tools — list_projects, get_project_metadata, get_project_files.
 * Extends the MCP tool registry without touching memory tools.
 */

const {
  listProjects,
  getProject,
  ProjectServiceError,
} = require('../../services/projectService');
const fs = require('fs');
const path = require('path');

const SAFE_EXTENSIONS = new Set([
  '.js', '.ts', '.jsx', '.tsx', '.py', '.json', '.yaml', '.yml',
  '.toml', '.md', '.txt', '.html', '.css', '.scss', '.env.example',
  '.gitignore', '.sh', '.bat', '.ps1', '.cfg', '.ini', '.xml',
]);

function isSafeFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath);
  if (basename === '.env' || basename.startsWith('.env.')) {
    return basename === '.env.example';
  }
  return SAFE_EXTENSIONS.has(ext) || basename === 'Makefile' || basename === 'Dockerfile';
}

function walkDir(dir, maxDepth = 3, currentDepth = 0) {
  if (currentDepth >= maxDepth) return [];
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '__pycache__') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push({ path: entry.name, type: 'directory' });
        const children = walkDir(fullPath, maxDepth, currentDepth + 1);
        for (const child of children) {
          results.push({ ...child, path: `${entry.name}/${child.path}` });
        }
      } else if (entry.isFile()) {
        results.push({ path: entry.name, type: 'file', size: fs.statSync(fullPath).size });
      }
    }
  } catch { /* permission error / missing dir */ }
  return results;
}

function registerProjectTools() {
  return [
    {
      name: 'list_projects',
      description: 'List all attached projects with metadata.',
      ownerOnly: false,
      writeEffect: false,
      requiredPermission: 'memory+project-metadata',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
      handler: async ({ context }) => {
        return listProjects(context);
      },
    },
    {
      name: 'get_project_metadata',
      description: 'Get metadata for a specific project (language, framework, git info).',
      ownerOnly: false,
      writeEffect: false,
      requiredPermission: 'memory+project-metadata',
      inputSchema: {
        type: 'object',
        properties: {
          project_id: { type: 'string', description: 'Project ID' },
        },
        required: ['project_id'],
      },
      handler: async ({ args, context }) => {
        return getProject(context, args.project_id);
      },
    },
    {
      name: 'get_project_files',
      description: 'List files in a project directory (permission-gated, trusted-local only).',
      ownerOnly: true,
      writeEffect: false,
      requiredPermission: 'memory+project-files',
      inputSchema: {
        type: 'object',
        properties: {
          project_id: { type: 'string', description: 'Project ID' },
          max_depth: { type: 'number', description: 'Max directory depth (default 3, max 5)' },
        },
        required: ['project_id'],
      },
      handler: async ({ args, context }) => {
        const project = getProject(context, args.project_id);
        if (!project.local_path) {
          throw new ProjectServiceError(400, 'NO_LOCAL_PATH', 'Project has no local path');
        }
        if (!fs.existsSync(project.local_path)) {
          throw new ProjectServiceError(400, 'PATH_NOT_FOUND', 'Local path not found');
        }
        const depth = Math.min(args.max_depth || 3, 5);
        const files = walkDir(project.local_path, depth);
        return { project_id: args.project_id, local_path: project.local_path, files };
      },
    },
    {
      name: 'read_project_file',
      description: 'Read a safe file from a project directory (owner-only, trusted-local only).',
      ownerOnly: true,
      writeEffect: false,
      requiredPermission: 'memory+project-files',
      inputSchema: {
        type: 'object',
        properties: {
          project_id: { type: 'string' },
          file_path: { type: 'string', description: 'Relative path within the project' },
        },
        required: ['project_id', 'file_path'],
      },
      handler: async ({ args, context }) => {
        const project = getProject(context, args.project_id);
        if (!project.local_path) {
          throw new ProjectServiceError(400, 'NO_LOCAL_PATH', 'Project has no local path');
        }

        const resolved = path.resolve(project.local_path, args.file_path);
        // Prevent path traversal
        if (!resolved.startsWith(path.resolve(project.local_path))) {
          throw new ProjectServiceError(403, 'PATH_TRAVERSAL', 'Path traversal not allowed');
        }
        if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
          throw new ProjectServiceError(404, 'FILE_NOT_FOUND', 'File not found');
        }
        if (!isSafeFile(resolved)) {
          throw new ProjectServiceError(403, 'UNSAFE_FILE', 'File type not allowed for reading');
        }

        const stat = fs.statSync(resolved);
        if (stat.size > 100_000) {
          throw new ProjectServiceError(400, 'FILE_TOO_LARGE', 'File exceeds 100KB limit');
        }

        const content = fs.readFileSync(resolved, 'utf8');
        return { file_path: args.file_path, size: stat.size, content };
      },
    },
  ];
}

module.exports = { registerProjectTools };
