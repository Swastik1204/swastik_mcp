import { useState, useEffect } from 'react';
import {
  listProjectsApi,
  createProjectApi,
  rescanProjectApi,
  scanPreview,
  validateGitHub,
} from '../services/api';

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  // Attach form state
  const [showAttach, setShowAttach] = useState(false);
  const [localPath, setLocalPath] = useState('');
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [githubUsername, setGithubUsername] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadProjects(); }, []);

  async function loadProjects() {
    setLoading(true);
    try {
      const data = await listProjectsApi();
      setProjects(data.projects || []);
    } catch (err) {
      setStatus(`❌ ${err.message}`);
    }
    setLoading(false);
  }

  async function handleScan() {
    if (!localPath.trim()) return;
    setPreviewLoading(true);
    setPreviewData(null);
    try {
      const data = await scanPreview(localPath.trim());
      setPreviewData(data);
      setGithubUsername(data.github_owner || '');
    } catch (err) {
      setStatus(`❌ Scan failed: ${err.message}`);
    }
    setPreviewLoading(false);
  }

  async function handleValidateGitHub() {
    if (!githubUsername.trim()) return;
    try {
      const data = await validateGitHub({ username: githubUsername.trim() });
      if (data.valid) {
        setStatus(`✅ GitHub username "${githubUsername}" is valid`);
      } else {
        setStatus(`⚠️ ${data.error || 'Invalid username'}`);
      }
    } catch (err) {
      setStatus(`❌ ${err.message}`);
    }
  }

  async function handleAttach() {
    setSaving(true);
    try {
      const payload = {
        local_path: localPath.trim(),
      };
      if (githubUsername) payload.githubUsername = githubUsername;

      const result = await createProjectApi(payload);
      setStatus(`✅ Project "${result.project_name}" attached!`);
      setShowAttach(false);
      setLocalPath('');
      setPreviewData(null);
      setGithubUsername('');
      loadProjects();
    } catch (err) {
      setStatus(`❌ ${err.message}`);
    }
    setSaving(false);
  }

  async function handleRescan(id) {
    try {
      const data = await rescanProjectApi(id);
      setStatus(`✅ Project rescanned: ${data.project_name}`);
      loadProjects();
    } catch (err) {
      setStatus(`❌ Rescan failed: ${err.message}`);
    }
  }

  function resetAttach() {
    setShowAttach(false);
    setLocalPath('');
    setPreviewData(null);
    setGithubUsername('');
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">📂 Projects</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAttach(true)}>
          + Attach Project Folder
        </button>
      </div>

      {status && (
        <div className={`alert ${status.startsWith('✅') ? 'alert-success' : status.startsWith('⚠️') ? 'alert-warning' : 'alert-error'} mb-4`}>
          <span className="text-sm">{status}</span>
          <button className="btn btn-ghost btn-xs" onClick={() => setStatus('')}>✕</button>
        </div>
      )}

      {/* ── Attach Project Dialog ─────────── */}
      {showAttach && (
        <dialog className="modal modal-open">
          <div className="modal-box w-11/12 max-w-2xl">
            <h3 className="font-bold text-lg mb-4">Attach Local Project Folder</h3>

            <div className="form-control mb-4">
              <label className="label"><span className="label-text">Absolute folder path</span></label>
              <div className="join w-full">
                <input type="text" className="input input-bordered join-item w-full"
                  placeholder="D:\My projects\my-app" value={localPath}
                  onChange={(e) => setLocalPath(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleScan()} />
                <button className="btn btn-primary join-item" onClick={handleScan}
                  disabled={previewLoading || !localPath.trim()}>
                  {previewLoading ? <span className="loading loading-spinner loading-xs"></span> : '🔍 Scan'}
                </button>
              </div>
              <label className="label">
                <span className="label-text-alt opacity-50">We'll scan for package.json, .git, etc.</span>
              </label>
            </div>

            {/* Scan Preview */}
            {previewData && (
              <div className="bg-base-200 rounded-lg p-4 mb-4 space-y-3">
                <h4 className="font-semibold">Scan Results</h4>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="opacity-60">Project Name:</span>{' '}
                    <span className="font-medium">{previewData.project_name || '—'}</span>
                  </div>
                  <div>
                    <span className="opacity-60">Language:</span>{' '}
                    <span className="badge badge-sm">{previewData.primary_language || 'unknown'}</span>
                  </div>
                  <div>
                    <span className="opacity-60">Framework:</span>{' '}
                    <span className="badge badge-sm badge-outline">{previewData.framework || 'none'}</span>
                  </div>
                  <div>
                    <span className="opacity-60">Git Remote:</span>{' '}
                    <span className="text-xs break-all">{previewData.git_remote || 'none'}</span>
                  </div>
                </div>

                {previewData.github_owner && previewData.github_repo && (
                  <div className="alert alert-info text-sm py-2">
                    🔗 Detected GitHub: <strong>{previewData.github_owner}/{previewData.github_repo}</strong>
                    {previewData.github_branch && ` (${previewData.github_branch})`}
                  </div>
                )}

                {previewData.files_detected && Object.values(previewData.files_detected).some(Boolean) && (
                  <details className="collapse collapse-arrow bg-base-100">
                    <summary className="collapse-title text-sm font-medium py-2 min-h-0">
                      📁 Config files found ({Object.values(previewData.files_detected || {}).filter(Boolean).length})
                    </summary>
                    <div className="collapse-content">
                      <ul className="list-disc list-inside text-xs">
                        {Object.entries(previewData.files_detected || {})
                          .filter(([, found]) => found)
                          .map(([f], i) => (
                          <li key={i}>{f}</li>
                          ))}
                      </ul>
                    </div>
                  </details>
                )}
              </div>
            )}

            {/* GitHub username */}
            {previewData && (
              <div className="form-control mb-4">
                <label className="label"><span className="label-text">GitHub Username (optional)</span></label>
                <div className="join w-full">
                  <input type="text" className="input input-bordered join-item w-full"
                    placeholder="Swastik1204" value={githubUsername}
                    onChange={(e) => setGithubUsername(e.target.value)} />
                  <button className="btn btn-outline join-item" onClick={handleValidateGitHub}
                    disabled={!githubUsername.trim()}>Validate</button>
                </div>
              </div>
            )}

            <div className="modal-action">
              <button className="btn btn-ghost" onClick={resetAttach}>Cancel</button>
              {previewData && (
                <button className="btn btn-primary" onClick={handleAttach} disabled={saving}>
                  {saving ? <span className="loading loading-spinner loading-xs"></span> : '📎 Attach Project'}
                </button>
              )}
            </div>
          </div>
          <form method="dialog" className="modal-backdrop"><button onClick={resetAttach}>close</button></form>
        </dialog>
      )}

      {/* ── Project List ──────────────────── */}
      {loading ? (
        <span className="loading loading-spinner loading-lg"></span>
      ) : projects.length === 0 ? (
        <div className="card bg-base-100 shadow">
          <div className="card-body items-center text-center">
            <h3 className="card-title">No Projects Attached</h3>
            <p className="opacity-60 text-sm">Attach a local project folder so MCP tools can access its metadata and files.</p>
            <button className="btn btn-primary btn-sm mt-2" onClick={() => setShowAttach(true)}>+ Attach Project Folder</button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {projects.map(project => (
            <div key={project.id} className="card bg-base-100 shadow">
              <div className="card-body">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="card-title text-base">{project.project_name}</h3>
                    <p className="text-xs opacity-50 mt-1 break-all">{project.local_path || '(no local path)'}</p>
                  </div>
                  <button className="btn btn-ghost btn-xs" onClick={() => handleRescan(project.id)}>
                    🔄 Rescan
                  </button>
                </div>

                <div className="flex gap-2 mt-2 flex-wrap">
                  {project.primary_language && (
                    <span className="badge badge-sm">{project.primary_language}</span>
                  )}
                  {project.framework && (
                    <span className="badge badge-sm badge-outline">{project.framework}</span>
                  )}
                  {project.github_owner && project.github_repo && (
                    <a
                      href={`https://github.com/${project.github_owner}/${project.github_repo}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="badge badge-sm badge-info gap-1"
                    >
                      🔗 {project.github_owner}/{project.github_repo}
                    </a>
                  )}
                  {project.github_branch && (
                    <span className="badge badge-sm badge-ghost">{project.github_branch}</span>
                  )}
                </div>

                <p className="text-xs opacity-40 mt-2">
                  Attached {new Date(project.created_at).toLocaleDateString()}
                  {project.updated_at && ` · Updated ${new Date(project.updated_at).toLocaleDateString()}`}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
