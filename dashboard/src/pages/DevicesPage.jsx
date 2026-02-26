import { useState, useEffect } from 'react';
import { syncStatus, syncPush, syncPull } from '../services/api';

export default function DevicesPage() {
  const [sync, setSync] = useState(null);
  const [actionStatus, setActionStatus] = useState('');

  useEffect(() => {
    fetchSyncStatus();
  }, []);

  async function fetchSyncStatus() {
    try {
      const data = await syncStatus();
      setSync(data);
    } catch (err) {
      setActionStatus(`Error: ${err.message}`);
    }
  }

  async function handlePush() {
    setActionStatus('Pushing…');
    try {
      const result = await syncPush();
      setActionStatus(`✅ Pushed: ${result.synced} synced, ${result.failed} failed`);
      fetchSyncStatus();
    } catch (err) {
      setActionStatus(`❌ ${err.message}`);
    }
  }

  async function handlePull() {
    setActionStatus('Pulling…');
    try {
      const result = await syncPull();
      setActionStatus(`✅ Pulled: ${result.pulled} entries`);
      fetchSyncStatus();
    } catch (err) {
      setActionStatus(`❌ ${err.message}`);
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">💻 Devices & Sync</h2>

      <div className="flex gap-3 mb-6">
        <button className="btn btn-primary btn-sm" onClick={handlePush}>⬆ Push to Cloud</button>
        <button className="btn btn-secondary btn-sm" onClick={handlePull}>⬇ Pull from Cloud</button>
        <button className="btn btn-ghost btn-sm" onClick={fetchSyncStatus}>↻ Refresh</button>
      </div>

      {actionStatus && <div className="alert alert-info mb-4 text-sm">{actionStatus}</div>}

      <div className="stats shadow mb-6">
        <div className="stat">
          <div className="stat-title">Pending Sync Items</div>
          <div className="stat-value">{sync?.pending ?? '—'}</div>
          <div className="stat-desc">Items waiting to be pushed</div>
        </div>
      </div>

      {/* Pending items preview */}
      {sync?.items?.length > 0 && (
        <div className="overflow-x-auto">
          <table className="table table-compact w-full">
            <thead>
              <tr>
                <th>ID</th>
                <th>Collection</th>
                <th>Doc Path</th>
                <th>Operation</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {sync.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td className="font-mono text-sm">{item.collection}</td>
                  <td className="font-mono text-sm">{item.doc_path}</td>
                  <td><span className="badge badge-sm">{item.operation}</span></td>
                  <td className="text-xs">{item.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Device info placeholder */}
      <div className="divider mt-8">Registered Devices</div>
      <p className="opacity-50 text-sm">
        Device registry will appear here once multiple devices are syncing.
        Run the local agent (<code>node agent/index.js</code>) to register this device.
      </p>
    </div>
  );
}
