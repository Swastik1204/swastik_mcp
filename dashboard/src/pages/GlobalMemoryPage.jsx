import { useState, useEffect } from 'react';
import { getGlobalMemory, setGlobalMemory } from '../services/api';

export default function GlobalMemoryPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [status, setStatus] = useState('');

  // Fetch global memory on mount
  useEffect(() => {
    fetchMemory();
  }, []);

  async function fetchMemory() {
    setLoading(true);
    try {
      const data = await getGlobalMemory();
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
      // Try to parse value as JSON, fall back to string
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

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">🧠 Global Memory</h2>

      {/* Add new entry */}
      <form onSubmit={handleAdd} className="flex gap-2 mb-6">
        <input
          className="input input-bordered input-sm flex-1"
          placeholder="Key"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
        />
        <input
          className="input input-bordered input-sm flex-[2]"
          placeholder='Value (string or JSON)'
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
        />
        <button type="submit" className="btn btn-primary btn-sm">Add</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={fetchMemory}>↻</button>
      </form>

      {status && <div className="alert alert-info mb-4 text-sm">{status}</div>}

      {/* Memory table */}
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
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.key}>
                  <td className="font-mono">{item.key}</td>
                  <td className="max-w-md truncate">
                    {typeof item.value === 'object' ? JSON.stringify(item.value) : String(item.value)}
                  </td>
                  <td className="text-xs opacity-60">{item.updated_at || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
