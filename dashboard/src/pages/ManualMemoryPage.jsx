import { useState } from 'react';
import { addFreeformMemoryApi, listProjectsApi } from '../services/api';

export default function ManualMemoryPage() {
  const [text, setText] = useState('');
  const [tags, setTags] = useState('');
  const [scope, setScope] = useState('global');
  const [projectId, setProjectId] = useState('');
  const [importance, setImportance] = useState('medium');
  const [pinned, setPinned] = useState(false);
  const [customKey, setCustomKey] = useState('');
  const [status, setStatus] = useState('');
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  async function loadProjects() {
    setLoadingProjects(true);
    try {
      const data = await listProjectsApi();
      setProjects(data.projects || []);
    } catch (err) {
      setStatus(`❌ ${err.message}`);
    }
    setLoadingProjects(false);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!text.trim()) return;

    try {
      const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);
      const result = await addFreeformMemoryApi({
        text: text.trim(),
        tags: tagList,
        projectId: scope === 'project' ? projectId : undefined,
        importance,
        pinned,
        key: customKey.trim() || undefined,
      });

      setStatus(`✅ Manual memory saved (${result.status})`);
      setText('');
      setTags('');
      setCustomKey('');
      setPinned(false);
    } catch (err) {
      setStatus(`❌ ${err.message}`);
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">🧠 Add Memory Manually</h2>

      {status && (
        <div className={`alert ${status.startsWith('✅') ? 'alert-success' : 'alert-error'} mb-4`}>
          <span className="text-sm">{status}</span>
          <button className="btn btn-ghost btn-xs" onClick={() => setStatus('')}>✕</button>
        </div>
      )}

      <div className="card bg-base-100 shadow">
        <div className="card-body">
          <form onSubmit={handleSave} className="space-y-4">
            <div className="form-control">
              <label className="label"><span className="label-text">Memory text</span></label>
              <textarea
                className="textarea textarea-bordered h-32"
                placeholder="Write what you want your brain to remember..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="form-control">
                <label className="label"><span className="label-text">Scope</span></label>
                <select
                  className="select select-bordered"
                  value={scope}
                  onChange={(e) => {
                    const next = e.target.value;
                    setScope(next);
                    if (next === 'project' && projects.length === 0) loadProjects();
                  }}
                >
                  <option value="global">Global</option>
                  <option value="project">Project</option>
                </select>
              </div>

              <div className="form-control">
                <label className="label"><span className="label-text">Importance</span></label>
                <select className="select select-bordered" value={importance} onChange={(e) => setImportance(e.target.value)}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>

            {scope === 'project' && (
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Project</span>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={loadProjects}>Refresh</button>
                </label>
                <select className="select select-bordered" value={projectId} onChange={(e) => setProjectId(e.target.value)} required>
                  <option value="">Select project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>{project.project_name} ({project.id})</option>
                  ))}
                </select>
                {loadingProjects && <span className="loading loading-spinner loading-sm mt-2"></span>}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="form-control">
                <label className="label"><span className="label-text">Tags (comma-separated)</span></label>
                <input className="input input-bordered" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="mcp, auth, roadmap" />
              </div>
              <div className="form-control">
                <label className="label"><span className="label-text">Custom key (optional)</span></label>
                <input className="input input-bordered" value={customKey} onChange={(e) => setCustomKey(e.target.value)} placeholder="manual_important_note" />
              </div>
            </div>

            <label className="label cursor-pointer justify-start gap-3">
              <input type="checkbox" className="checkbox checkbox-primary" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
              <span className="label-text">Pin this memory</span>
            </label>

            <button className="btn btn-primary" type="submit">Save Memory</button>
          </form>
        </div>
      </div>
    </div>
  );
}
