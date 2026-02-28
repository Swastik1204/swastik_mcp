import { useState, useEffect } from 'react';
import {
  listMcpClients,
  createMcpClientApi,
  updateMcpClientApi,
  testMcpClientApi,
  reconnectMcpClientApi,
  launchMcpClientApi,
  mcpHealthCheck,
} from '../services/api';

const CLIENT_OPTIONS = [
  { value: 'claude-desktop', label: 'Claude Desktop', icon: '🤖' },
  { value: 'vscode', label: 'VS Code MCP client', icon: '💻' },
  { value: 'continue-dev', label: 'Continue', icon: '▶️' },
  { value: 'cursor', label: 'Cursor', icon: '⌨️' },
  { value: 'chatgpt-bridge', label: 'ChatGPT MCP', icon: '💬' },
  { value: 'gemini-bridge', label: 'Gemini MCP', icon: '✨' },
  { value: 'antigravity', label: 'Antigravity', icon: '🚀' },
  { value: 'stitch', label: 'Stitch', icon: '🧵' },
  { value: 'generic', label: 'Generic MCP', icon: '🔌' },
];

const PERMISSION_OPTIONS = [
  { value: 'memory-only', label: 'Memory Only', desc: 'Read/write memory entries' },
  { value: 'memory+project-metadata', label: 'Memory + Project Metadata', desc: 'Memory + project metadata access' },
  { value: 'memory+project-files', label: 'Memory + Project Files', desc: 'Memory + project file reading access' },
];

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3939/api').replace(/\/$/, '');

function mcpUrl() {
  return `${API_BASE}/mcp`;
}

function getSetupInstructions(clientType, connectionMode, clientId = '<mcp-client-id>') {
  const endpoint = mcpUrl();

  if (connectionMode === 'stdio') {
    return {
      title: 'STDIO Setup',
      config: JSON.stringify({
        mcpServers: {
          'swastik-brain': {
            command: 'node',
            args: ['<path-to>/backend/src/mcp/server.js', '--stdio'],
            env: {
              MCP_CLIENT_ID: clientId,
            },
          },
        },
      }, null, 2),
      warning: 'STDIO mode is trusted-local only. Any local process can impersonate the owner. Do not use this on shared machines.',
    };
  }

  if (clientType === 'vscode' || clientType === 'continue-dev') {
    return {
      title: 'VS Code-style MCP Setup',
      config: JSON.stringify({
        'mcp.servers': {
          'swastik-brain': {
            url: endpoint,
            headers: {
              Authorization: 'Bearer <your-firebase-id-token>',
              'X-MCP-Client-Id': clientId,
            },
          },
        },
      }, null, 2),
    };
  }

  return {
    title: 'HTTP MCP Setup',
    config: JSON.stringify({
      mcpServers: {
        'swastik-brain': {
          url: endpoint,
          headers: {
            Authorization: 'Bearer <your-firebase-id-token>',
            'X-MCP-Client-Id': clientId,
          },
        },
      },
    }, null, 2),
  };
}

export default function McpSettingsPage() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [status, setStatus] = useState('');
  const [mcpStatus, setMcpStatus] = useState(null);

  const [clientType, setClientType] = useState('');
  const [connectionMode, setConnectionMode] = useState('http');
  const [clientName, setClientName] = useState('');
  const [permissions, setPermissions] = useState('memory-only');
  const [testResult, setTestResult] = useState(null);
  const [savedClient, setSavedClient] = useState(null);
  const [launchResult, setLaunchResult] = useState(null);

  useEffect(() => {
    loadClients();
    refreshMcpStatus();
  }, []);

  async function loadClients() {
    setLoading(true);
    try {
      const data = await listMcpClients();
      setClients(data.clients || []);
    } catch (err) {
      setStatus(`❌ ${err.message}`);
    }
    setLoading(false);
  }

  async function refreshMcpStatus() {
    try {
      const data = await mcpHealthCheck();
      setMcpStatus(data);
    } catch {
      setMcpStatus(null);
    }
  }

  function resetWizard() {
    setStep(1);
    setClientType('');
    setConnectionMode('http');
    setClientName('');
    setPermissions('memory-only');
    setTestResult(null);
    setSavedClient(null);
    setLaunchResult(null);
  }

  function openWizard() {
    resetWizard();
    setWizardOpen(true);
  }

  async function handleSave() {
    const label = clientName || CLIENT_OPTIONS.find((c) => c.value === clientType)?.label || clientType;
    try {
      const result = await createMcpClientApi({
        name: label,
        client_type: clientType,
        connection_mode: connectionMode,
        permissions,
      });
      setSavedClient(result);
      setStep(4);
      await loadClients();
      await refreshMcpStatus();
      setStatus(`✅ MCP client "${label}" registered`);
      return result;
    } catch (err) {
      setStatus(`❌ ${err.message}`);
      return null;
    }
  }

  async function ensureSavedClient() {
    if (savedClient) return savedClient;
    return handleSave();
  }

  async function handleTest(clientId = savedClient?.id) {
    if (!clientId) return;
    setTestResult({ loading: true });
    try {
      const result = await testMcpClientApi(clientId);
      setTestResult(result);
      await loadClients();
      await refreshMcpStatus();
    } catch (err) {
      setTestResult({ success: false, error: err.message });
    }
  }

  async function handleReconnect(clientId) {
    try {
      const result = await reconnectMcpClientApi(clientId);
      setStatus(result.success ? '✅ Reconnected MCP client' : '⚠️ Reconnect attempted, but backend health still degraded');
      await loadClients();
      await refreshMcpStatus();
    } catch (err) {
      setStatus(`❌ ${err.message}`);
    }
  }

  async function toggleClient(client) {
    try {
      await updateMcpClientApi(client.id, { enabled: !client.enabled });
      await loadClients();
    } catch (err) {
      setStatus(`❌ ${err.message}`);
    }
  }

  async function handleAutoConfigure(action = 'launch') {
    const client = await ensureSavedClient();
    if (!client) return;

    try {
      const result = await launchMcpClientApi(client.id, action);
      setLaunchResult(result);
      if (result.success) {
        setStatus('✅ Auto-setup action completed');
      } else {
        setStatus('⚠️ Auto-setup fallback shown below');
      }
    } catch (err) {
      setStatus(`❌ ${err.message}`);
    }
  }

  async function copyCurrentConfig() {
    const previewClientId = savedClient?.id || '<mcp-client-id>';
    const instructions = getSetupInstructions(clientType, connectionMode, previewClientId);
    try {
      await navigator.clipboard.writeText(instructions.config);
      setStatus('✅ Config copied to clipboard');
    } catch {
      setStatus('⚠️ Browser clipboard denied. Copy from code block manually.');
    }
  }

  const instructions = clientType
    ? getSetupInstructions(clientType, connectionMode, savedClient?.id || '<mcp-client-id>')
    : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">⚙️ MCP Settings</h2>
        <div className="flex items-center gap-2">
          <span className={`badge ${mcpStatus?.mcpReady ? 'badge-success' : 'badge-warning'}`}>
            {mcpStatus?.mcpReady ? 'MCP Online' : 'MCP Degraded'}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={refreshMcpStatus}>↻</button>
          <button className="btn btn-primary btn-sm" onClick={openWizard}>+ Add MCP Client</button>
        </div>
      </div>

      {status && (
        <div className={`alert ${status.startsWith('✅') ? 'alert-success' : status.startsWith('⚠️') ? 'alert-warning' : 'alert-error'} mb-4`}>
          <span className="text-sm">{status}</span>
          <button className="btn btn-ghost btn-xs" onClick={() => setStatus('')}>✕</button>
        </div>
      )}

      {wizardOpen && (
        <dialog className="modal modal-open">
          <div className="modal-box w-11/12 max-w-3xl">
            <h3 className="font-bold text-lg mb-4">MCP Client Setup — Step {step} of 5</h3>

            <ul className="steps steps-horizontal w-full mb-6 text-xs">
              <li className={`step ${step >= 1 ? 'step-primary' : ''}`}>Client</li>
              <li className={`step ${step >= 2 ? 'step-primary' : ''}`}>Mode</li>
              <li className={`step ${step >= 3 ? 'step-primary' : ''}`}>Config</li>
              <li className={`step ${step >= 4 ? 'step-primary' : ''}`}>Test</li>
              <li className={`step ${step >= 5 ? 'step-primary' : ''}`}>Done</li>
            </ul>

            {step === 1 && (
              <div className="grid grid-cols-3 gap-3">
                {CLIENT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className={`btn btn-outline btn-sm h-auto py-3 flex-col gap-1 ${clientType === opt.value ? 'btn-primary' : ''}`}
                    onClick={() => {
                      setClientType(opt.value);
                      setClientName(opt.label);
                    }}
                  >
                    <span className="text-lg">{opt.icon}</span>
                    <span className="text-xs">{opt.label}</span>
                  </button>
                ))}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <label className="label cursor-pointer justify-start gap-4">
                  <input type="radio" name="mode" className="radio radio-primary"
                    checked={connectionMode === 'http'} onChange={() => setConnectionMode('http')} />
                  <div>
                    <span className="label-text font-semibold">HTTP (recommended)</span>
                    <p className="text-xs opacity-60">Secure token-based access to {mcpUrl()}</p>
                  </div>
                </label>
                <label className="label cursor-pointer justify-start gap-4">
                  <input type="radio" name="mode" className="radio radio-warning"
                    checked={connectionMode === 'stdio'} onChange={() => setConnectionMode('stdio')} />
                  <div>
                    <span className="label-text font-semibold">STDIO (local trusted only)</span>
                    <p className="text-xs opacity-60">No network, but local process trust boundary is weaker.</p>
                  </div>
                </label>

                <div className="form-control">
                  <label className="label"><span className="label-text">Permissions</span></label>
                  <select className="select select-bordered w-full" value={permissions}
                    onChange={(e) => setPermissions(e.target.value)}>
                    {PERMISSION_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label} — {p.desc}</option>
                    ))}
                  </select>
                </div>

                <div className="form-control">
                  <label className="label"><span className="label-text">Client Name (optional)</span></label>
                  <input type="text" className="input input-bordered w-full"
                    value={clientName} onChange={(e) => setClientName(e.target.value)} />
                </div>
              </div>
            )}

            {step === 3 && instructions && (
              <div className="space-y-4">
                <h4 className="font-semibold">{instructions.title}</h4>
                <div className="alert alert-warning text-sm">
                  We can open your MCP config file location, but you paste the config yourself.
                </div>
                <div className="mockup-code text-xs overflow-x-auto">
                  <pre><code>{instructions.config}</code></pre>
                </div>
                {instructions.warning && <div className="alert alert-warning text-sm">{instructions.warning}</div>}

                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-primary btn-sm" onClick={() => handleAutoConfigure('launch')}>
                    ▶️ Open & Configure in {clientName || clientType}
                  </button>
                  <button className="btn btn-outline btn-sm" onClick={copyCurrentConfig}>Copy config</button>
                  <button className="btn btn-outline btn-sm" onClick={() => handleAutoConfigure('open-config-folder')}>
                    Open config folder
                  </button>
                </div>

                {launchResult && (
                  <div className={`alert ${launchResult.success ? 'alert-success' : 'alert-warning'} text-sm`}>
                    <div>
                      <div>
                        Opened app: {launchResult.opened_app ? 'yes' : 'no'} · Opened folder: {launchResult.opened_config_folder ? 'yes' : 'no'} · Copied: {launchResult.copied_config ? 'yes' : 'no'}
                      </div>
                      {launchResult.fallback_instructions?.length > 0 && (
                        <ul className="list-disc list-inside mt-1">
                          {launchResult.fallback_instructions.map((line) => <li key={line}>{line}</li>)}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                {savedClient ? (
                  <>
                    <div className="alert alert-success text-sm">
                      Client "{savedClient.name}" saved successfully. ID: <span className="font-mono">{savedClient.id}</span>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn btn-outline btn-sm" onClick={() => handleTest(savedClient.id)}>
                        🔌 Test MCP Connection
                      </button>
                      <button className="btn btn-outline btn-sm" onClick={() => handleReconnect(savedClient.id)}>
                        ♻️ Reconnect MCP Client
                      </button>
                    </div>
                    {testResult && !testResult.loading && (
                      <div className={`alert ${testResult.success ? 'alert-success' : 'alert-error'} text-sm`}>
                        {testResult.success ? '✅ Connection successful' : `❌ Test failed: ${testResult.error || 'MCP health check failed'}`}
                      </div>
                    )}
                    {testResult?.loading && <span className="loading loading-spinner loading-sm"></span>}
                  </>
                ) : (
                  <div className="text-center">
                    <button className="btn btn-primary" onClick={handleSave}>💾 Save Client</button>
                  </div>
                )}
              </div>
            )}

            {step === 5 && (
              <div className="text-center space-y-4 py-4">
                <div className="text-4xl">🎉</div>
                <p className="text-lg font-semibold">MCP Client Connected</p>
                <p className="text-sm opacity-60">You can manage and reconnect clients from this page.</p>
              </div>
            )}

            <div className="modal-action">
              <button className="btn btn-ghost" onClick={() => setWizardOpen(false)}>Cancel</button>
              {step > 1 && step < 5 && <button className="btn btn-outline btn-sm" onClick={() => setStep((s) => s - 1)}>Back</button>}
              {step === 1 && <button className="btn btn-primary btn-sm" disabled={!clientType} onClick={() => setStep(2)}>Next</button>}
              {step === 2 && <button className="btn btn-primary btn-sm" onClick={() => setStep(3)}>Next</button>}
              {step === 3 && <button className="btn btn-primary btn-sm" onClick={handleSave}>Save & Continue</button>}
              {step === 4 && savedClient && <button className="btn btn-primary btn-sm" onClick={() => setStep(5)}>Finish</button>}
              {step === 5 && <button className="btn btn-primary btn-sm" onClick={() => { setWizardOpen(false); resetWizard(); }}>Done</button>}
            </div>
          </div>
          <form method="dialog" className="modal-backdrop"><button onClick={() => setWizardOpen(false)}>close</button></form>
        </dialog>
      )}

      {loading ? (
        <span className="loading loading-spinner loading-lg"></span>
      ) : clients.length === 0 ? (
        <div className="card bg-base-100 shadow">
          <div className="card-body items-center text-center">
            <h3 className="card-title">No MCP Clients</h3>
            <p className="opacity-60 text-sm">Add your first MCP client to start one-click setup.</p>
            <button className="btn btn-primary btn-sm mt-2" onClick={openWizard}>+ Add MCP Client</button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {clients.map((client) => (
            <div key={client.id} className={`card bg-base-100 shadow ${!client.enabled ? 'opacity-50' : ''}`}>
              <div className="card-body">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="card-title text-base">{client.name}</h3>
                    <div className="flex gap-2 mt-1 flex-wrap">
                      <span className="badge badge-sm badge-outline">{client.client_type}</span>
                      <span className="badge badge-sm">{client.connection_mode}</span>
                      <span className="badge badge-sm badge-accent">{client.permissions}</span>
                      <span className={`badge badge-sm ${client.test_status === 'success' ? 'badge-success' : client.test_status === 'failure' ? 'badge-error' : 'badge-ghost'}`}>
                        {client.test_status || 'untested'}
                      </span>
                    </div>
                  </div>
                  <input type="checkbox" className="toggle toggle-sm toggle-success"
                    checked={!!client.enabled}
                    onChange={() => toggleClient(client)} />
                </div>

                <div className="mt-3 flex gap-2 flex-wrap">
                  <button className="btn btn-xs btn-outline" onClick={() => handleTest(client.id)}>
                    Test MCP Connection
                  </button>
                  <button className="btn btn-xs btn-outline" onClick={() => handleReconnect(client.id)}>
                    Reconnect MCP Client
                  </button>
                  <button className="btn btn-xs btn-outline" onClick={() => launchMcpClientApi(client.id, 'launch').then((r) => setLaunchResult(r))}>
                    Open & Configure
                  </button>
                </div>

                {client.connection_mode === 'stdio' && (
                  <div className="text-xs text-warning mt-2">⚠️ Trusted-local only</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
