import { useEffect, useMemo, useRef, useState } from 'react';
import { DataSet } from 'vis-data';
import { Network } from 'vis-network';
import {
  getGlobalMemory,
  getProjectMemory,
  listProjectsApi,
  setGlobalMemory,
  setProjectMemory,
  deleteGlobalMemory,
  deleteProjectMemory,
  restoreGlobalMemory,
  restoreProjectMemory,
} from '../services/api';

function getTags(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.tags)) return [];
  return value.tags.map((t) => String(t).trim()).filter(Boolean);
}

function getImportance(value) {
  if (!value || typeof value !== 'object') return 'medium';
  return value.importance || 'medium';
}

function buildGraph(memories) {
  const nodes = [];
  const edges = [];
  const tagNodes = new Set();

  for (const item of memories) {
    const id = `${item.scope}:${item.projectId || 'global'}:${item.key}`;
    const preview = typeof item.value === 'object'
      ? (item.value.text || JSON.stringify(item.value))
      : String(item.value ?? '');

    const importance = getImportance(item.value);

    nodes.push({
      id,
      label: item.key,
      title: preview,
      shape: 'dot',
      size: item.deleted ? 10 : importance === 'high' ? 18 : 14,
      opacity: item.deleted ? 0.4 : 1,
    });

    const tags = getTags(item.value);
    for (const tag of tags) {
      const tagId = `tag:${tag.toLowerCase()}`;
      if (!tagNodes.has(tagId)) {
        tagNodes.add(tagId);
        nodes.push({ id: tagId, label: `#${tag}`, shape: 'box' });
      }
      edges.push({ from: id, to: tagId });
    }
  }

  return { nodes, edges };
}

export default function BrainViewPage() {
  const [items, setItems] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [importanceFilter, setImportanceFilter] = useState('all');
  const [showDeleted, setShowDeleted] = useState(false);

  const [selected, setSelected] = useState(null);
  const [editValue, setEditValue] = useState('');

  const networkContainerRef = useRef(null);
  const networkRef = useRef(null);

  useEffect(() => {
    loadData();
  }, [showDeleted]);

  useEffect(() => {
    const graph = buildGraph(filteredItems);
    if (!networkContainerRef.current) return;

    if (networkRef.current) {
      networkRef.current.destroy();
      networkRef.current = null;
    }

    const network = new Network(
      networkContainerRef.current,
      { nodes: new DataSet(graph.nodes), edges: new DataSet(graph.edges) },
      {
        interaction: { hover: true },
        physics: { stabilization: true },
        nodes: { font: { color: '#1f2937' } },
      },
    );

    network.on('click', (params) => {
      if (!params.nodes?.length) return;
      const nodeId = params.nodes[0];
      if (String(nodeId).startsWith('tag:')) return;

      const target = filteredItems.find((entry) => `${entry.scope}:${entry.projectId || 'global'}:${entry.key}` === nodeId);
      if (target) {
        setSelected(target);
        setEditValue(typeof target.value === 'object' ? JSON.stringify(target.value, null, 2) : String(target.value ?? ''));
      }
    });

    networkRef.current = network;
    return () => network.destroy();
  }, [items, search, projectFilter, tagFilter, importanceFilter, showDeleted]);

  async function loadData() {
    setLoading(true);
    try {
      const projectData = await listProjectsApi();
      const projectList = projectData.projects || [];
      setProjects(projectList);

      const all = [];
      const global = await getGlobalMemory(showDeleted);
      for (const item of global.items || []) {
        all.push({ ...item, scope: 'global', projectId: null, projectName: 'Global' });
      }

      for (const project of projectList) {
        const projectMem = await getProjectMemory(project.id, showDeleted);
        for (const item of projectMem.items || []) {
          all.push({ ...item, scope: 'project', projectId: project.id, projectName: project.project_name });
        }
      }

      setItems(all);
    } catch (err) {
      setStatus(`❌ ${err.message}`);
    }
    setLoading(false);
  }

  const tags = useMemo(() => {
    const out = new Set();
    for (const item of items) {
      for (const tag of getTags(item.value)) out.add(tag);
    }
    return Array.from(out).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (!showDeleted && item.deleted) return false;
      if (projectFilter !== 'all' && ((projectFilter === 'global' && item.scope !== 'global') || (projectFilter !== 'global' && item.projectId !== projectFilter))) {
        return false;
      }
      if (importanceFilter !== 'all' && getImportance(item.value) !== importanceFilter) return false;
      if (tagFilter !== 'all' && !getTags(item.value).includes(tagFilter)) return false;
      if (search.trim()) {
        const haystack = `${item.key} ${JSON.stringify(item.value || '')}`.toLowerCase();
        if (!haystack.includes(search.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [items, showDeleted, projectFilter, importanceFilter, tagFilter, search]);

  async function handleSaveEdit() {
    if (!selected) return;
    try {
      let parsed;
      try {
        parsed = JSON.parse(editValue);
      } catch {
        parsed = editValue;
      }

      if (selected.scope === 'global') {
        await setGlobalMemory(selected.key, parsed);
      } else {
        await setProjectMemory(selected.projectId, selected.key, parsed);
      }
      setStatus('✅ Memory updated');
      await loadData();
    } catch (err) {
      setStatus(`❌ ${err.message}`);
    }
  }

  async function handleDeleteSelected() {
    if (!selected) return;
    if (!confirm(`Delete ${selected.key}?`)) return;

    try {
      if (selected.scope === 'global') {
        await deleteGlobalMemory(selected.key, 'Brain View delete');
      } else {
        await deleteProjectMemory(selected.projectId, selected.key, 'Brain View delete');
      }
      setStatus('✅ Memory deleted');
      setSelected(null);
      await loadData();
    } catch (err) {
      setStatus(`❌ ${err.message}`);
    }
  }

  async function handleRestoreSelected() {
    if (!selected) return;

    try {
      if (selected.scope === 'global') {
        await restoreGlobalMemory(selected.key);
      } else {
        await restoreProjectMemory(selected.projectId, selected.key);
      }
      setStatus('✅ Memory restored');
      await loadData();
    } catch (err) {
      setStatus(`❌ ${err.message}`);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">🧠 Brain View</h2>
        <div className="flex gap-2">
          <button className="btn btn-ghost btn-sm" onClick={() => networkRef.current?.fit()}>Fit</button>
          <button className="btn btn-ghost btn-sm" onClick={loadData}>↻ Refresh</button>
        </div>
      </div>

      {status && (
        <div className={`alert ${status.startsWith('✅') ? 'alert-success' : 'alert-error'} mb-4`}>
          <span className="text-sm">{status}</span>
          <button className="btn btn-ghost btn-xs" onClick={() => setStatus('')}>✕</button>
        </div>
      )}

      <div className="card bg-base-100 shadow mb-4">
        <div className="card-body p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
          <input className="input input-bordered input-sm" placeholder="Search memories" value={search} onChange={(e) => setSearch(e.target.value)} />

          <select className="select select-bordered select-sm" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
            <option value="all">All projects</option>
            <option value="global">Global</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.project_name}</option>)}
          </select>

          <select className="select select-bordered select-sm" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
            <option value="all">All tags</option>
            {tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
          </select>

          <select className="select select-bordered select-sm" value={importanceFilter} onChange={(e) => setImportanceFilter(e.target.value)}>
            <option value="all">All importance</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>

          <label className="label cursor-pointer justify-start gap-2">
            <span className="label-text text-sm">Show deleted</span>
            <input type="checkbox" className="toggle toggle-sm" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card bg-base-100 shadow">
          <div className="card-body p-0">
            {loading ? (
              <div className="p-10 text-center"><span className="loading loading-spinner loading-lg"></span></div>
            ) : (
              <div ref={networkContainerRef} style={{ height: 560 }} />
            )}
          </div>
        </div>

        <div className="card bg-base-100 shadow">
          <div className="card-body">
            <h3 className="card-title text-base">Memory Detail</h3>
            {!selected ? (
              <p className="text-sm opacity-60">Click a memory node to preview and edit.</p>
            ) : (
              <div className="space-y-3">
                <div className="text-xs opacity-70">{selected.scope === 'global' ? 'Global' : selected.projectName} · {selected.key}</div>
                <textarea className="textarea textarea-bordered h-48" value={editValue} onChange={(e) => setEditValue(e.target.value)} />
                <div className="flex gap-2 flex-wrap">
                  <button className="btn btn-sm btn-primary" onClick={handleSaveEdit}>Save</button>
                  {!selected.deleted ? (
                    <button className="btn btn-sm btn-error btn-outline" onClick={handleDeleteSelected}>Delete</button>
                  ) : (
                    <button className="btn btn-sm btn-success" onClick={handleRestoreSelected}>Restore</button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
