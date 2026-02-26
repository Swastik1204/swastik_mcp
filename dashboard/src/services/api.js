/**
 * API helper — talks to the MCP backend.
 * In dev, Vite proxies /api → http://localhost:4000/api
 */

const API_BASE = '/api';

export async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ── Memory ─────────────────────────────────────────────

export const getGlobalMemory = () => apiFetch('/memory/global');
export const setGlobalMemory = (key, value) =>
  apiFetch('/memory/global', { method: 'POST', body: JSON.stringify({ key, value }) });

export const getProjectMemory = (projectId) => apiFetch(`/memory/project/${projectId}`);
export const setProjectMemory = (projectId, key, value) =>
  apiFetch(`/memory/project/${projectId}`, { method: 'POST', body: JSON.stringify({ key, value }) });

// ── Sync ───────────────────────────────────────────────

export const syncPush = () => apiFetch('/sync/push', { method: 'POST' });
export const syncPull = () => apiFetch('/sync/pull', { method: 'POST' });
export const syncStatus = () => apiFetch('/sync/status');

// ── Health ─────────────────────────────────────────────

export const healthCheck = () => apiFetch('/health');

// ── Tools ──────────────────────────────────────────────

export const getTools = () => apiFetch('/tools');
