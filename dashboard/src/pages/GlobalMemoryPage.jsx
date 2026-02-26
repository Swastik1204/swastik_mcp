import { useState, useEffect } from 'react';
import { getGlobalMemory, setGlobalMemory, deleteGlobalMemory, restoreGlobalMemory } from '../services/api';

export default function GlobalMemoryPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [status, setStatus] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);

  useEffect(() => { fetchMemory(); }, [showDeleted]);

  async function fetchMemory() {
    setLoading(true);
    try {
      const data = await getGlobalMemory(showDeleted);
      setItems(data.items || []);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
    setLoading(false);
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!newKey) return;
    try {
      let parsedValue;
      try { parsedValue = JSON.parse(newValue); } catch { parsedValue = newValue; }
      const result = await setGlobalMemory(newKey, parsedValue);
      setStatus(`✅ Key "${newKey}" → ${result.status}`);
      setNewKey('');
      setNewValue('');
      fetchMemory();
    } catch (err) {
      setStatus(`❌ ${err.message}`);
    }
  }

  async function handleDelete(key) {
    if (!confirm(`Delete "${key}"? (tombstone — can be restored)`)) return;
    try {
      const result = await deleteGlobalMemory(key, 'Dashboard delete');
      setStatus(`🗑️ "${key}" deleted (rev ${result.revision})`);
      fetchMemory();
    } catch (err) {
      setStatus(`❌ ${err.message}`);
    }
  }

  async function handleRestore(key) {
    try {
      const result = await restoreGlobalMemory(key);
      setStatus(`♻️ "${key}" restored (rev ${result.revision})`);
      fetchMemory();
    } catch (err) {
      setStatus(`❌ ${err.message}`);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">🧠 Global Memory</h2>
        <label className="label cursor-pointer gap-2">
          <span className="label-text text-sm">Show deleted</span>
          <input type="checkbox" className="toggle toggle-sm" checked={showDeleted}
            onChange={(e) => setShowDeleted(e.target.checked)} />
        </label>
      </div>

      {/* Add new entry */}
      <form onSubmit={handleAdd} className="flex gap-2 mb-6">
        <input className="input input-bordered input-sm flex-1" placeholder="Key"
          value={newKey} onChange={(e) => setNewKey(e.target.value)} />
        <input className="input input-bordered input-sm flex-[2]" placeholder='Value (string or JSON)'
          value={newValue} onChange={(e) => setNewValue(e.target.value)} />
        <button type="submit" className="btn btn-primary btn-sm">Add</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={fetchMemory}>↻</button>
      </form>

      {status && <div className="alert alert-info mb-4 text-sm">{status}</div>}

      {loading ? (
        <span className="loading loading-spinner loading-lg"></span>
      ) : items.length === 0 ? (
        <p className="opacity-50">No global memory entries yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-zebra w-full">
            <thead>
              <tr>
                <th>Key</th>
                <th>Value</th>
                <th>Rev</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.key} className={item.deleted ? 'opacity-40 line-through' : ''}>
                  <td className="font-mono">{item.key}</td>
                  <td className="max-w-md truncate">
                    {typeof item.value === 'object' ? JSON.stringify(item.value) : String(item.value ?? '')}
                  </td>
                  <td className="text-xs opacity-60">{item.revision ?? '—'}</td>
                  <td className="text-xs opacity-60">{item.updated_at || '—'}</td>
                  <td>
                    {item.deleted ? (
                      <button className="btn btn-xs btn-success" onClick={() => handleRestore(item.key)}>
                        Restore
                      </button>
                    ) : (
                      <button className="btn btn-xs btn-error btn-outline" onClick={() => handleDelete(item.key)}>
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
