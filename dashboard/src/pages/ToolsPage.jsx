import { useState, useEffect } from 'react';
import { getTools } from '../services/api';

export default function ToolsPage() {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getTools();
        setTools(data.tools || []);
      } catch {
        // Backend might be offline
        setTools([
          { name: 'antigravity', description: 'Placeholder', status: 'stub' },
          { name: 'stitch', description: 'Placeholder', status: 'stub' },
        ]);
      }
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">🔧 Tools</h2>

      {loading ? (
        <span className="loading loading-spinner loading-lg"></span>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tools.map((tool) => (
            <div key={tool.name} className="card bg-base-100 shadow-md">
              <div className="card-body">
                <h3 className="card-title capitalize">{tool.name}</h3>
                <p className="text-sm opacity-70">{tool.description}</p>
                <div className="card-actions justify-end mt-2">
                  <span className={`badge ${tool.status === 'active' ? 'badge-success' : 'badge-warning'}`}>
                    {tool.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
