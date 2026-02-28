/**
 * Project routes — attach local folders, scan metadata, GitHub detection.
 *
 * POST   /api/projects              → create/attach project
 * GET    /api/projects              → list all projects
 * GET    /api/projects/:id          → get single project
 * POST   /api/projects/:id/rescan   → rescan local folder
 * POST   /api/projects/scan-preview → preview scan without saving
 * POST   /api/projects/validate-github → validate GitHub URL/username
 */

const { Router } = require('express');
const router = Router();
const { writeLimiter } = require('../middleware/rateLimiter');
const {
  ProjectServiceError,
  createProject,
  listProjects,
  getProject,
  rescanProject,
  scanProjectFolder,
  validateGitHubUsername,
  parseGitHubUrl,
  checkGitHubRepoExists,
} = require('../services/projectService');

function ctx(req) {
  return { uid: req.user?.uid };
}

function handleError(error, res, next) {
  if (error instanceof ProjectServiceError) {
    return res.status(error.status).json({ error: error.message, code: error.code });
  }
  return next(error);
}

router.get('/', async (req, res, next) => {
  try {
    const result = listProjects(ctx(req));
    return res.json({ projects: result });
  } catch (error) {
    return handleError(error, res, next);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const result = getProject(ctx(req), req.params.id);
    return res.json(result);
  } catch (error) {
    return handleError(error, res, next);
  }
});

router.post('/', writeLimiter, async (req, res, next) => {
  try {
    const result = await createProject(ctx(req), req.body);
    return res.status(201).json(result);
  } catch (error) {
    return handleError(error, res, next);
  }
});

router.post('/:id/rescan', writeLimiter, async (req, res, next) => {
  try {
    const result = rescanProject(ctx(req), req.params.id);
    return res.json(result);
  } catch (error) {
    return handleError(error, res, next);
  }
});

router.post('/scan-preview', writeLimiter, async (req, res, next) => {
  try {
    const { local_path } = req.body;
    if (!local_path) return res.status(400).json({ error: 'local_path required' });
    const result = scanProjectFolder(local_path);
    return res.json(result);
  } catch (error) {
    return handleError(error, res, next);
  }
});

router.post('/validate-github', writeLimiter, async (req, res, next) => {
  try {
    const { username, repo_url } = req.body;

    if (username) {
      const valid = validateGitHubUsername(username);
      return res.json({ username, valid });
    }

    if (repo_url) {
      const parsed = parseGitHubUrl(repo_url);
      if (!parsed) return res.json({ valid: false, reason: 'Invalid GitHub URL format' });

      const check = await checkGitHubRepoExists(parsed.owner, parsed.repo);
      return res.json({ ...parsed, ...check });
    }

    return res.status(400).json({ error: 'username or repo_url required' });
  } catch (error) {
    return handleError(error, res, next);
  }
});

module.exports = router;
