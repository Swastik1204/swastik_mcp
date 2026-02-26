/**
 * Logs page — placeholder for future structured logging.
 * Will pull from Firestore `logs` collection when implemented.
 */
export default function LogsPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">📋 Logs</h2>

      <div className="alert alert-warning mb-6">
        <span>
          Logging is not yet connected. This page will display backend, agent, and sync logs
          once the <code>logs</code> Firestore collection is wired up.
        </span>
      </div>

      <div className="mockup-code">
        <pre data-prefix="1"><code>[INFO]  2026-02-26T10:00:00Z  Backend started on :4000</code></pre>
        <pre data-prefix="2"><code>[INFO]  2026-02-26T10:00:01Z  Firebase initialised</code></pre>
        <pre data-prefix="3"><code>[INFO]  2026-02-26T10:00:01Z  SQLite initialised</code></pre>
        <pre data-prefix="4" className="text-success"><code>[SYNC]  2026-02-26T10:01:00Z  Push complete: 3 synced, 0 failed</code></pre>
        <pre data-prefix="5" className="text-success"><code>[SYNC]  2026-02-26T10:01:02Z  Pull complete: 12 entries</code></pre>
      </div>
    </div>
  );
}
