/**
 * API helper — talks to the MCP backend.
 * Reads base URL from VITE_API_BASE_URL env or falls back to '/api' (Vite proxy).
 * Automatically attaches Firebase Auth ID token to every request.
 */

import { auth } from './firebase';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

async function getAuthHeaders() {
  const user = auth.currentUser;
  const headers = { 'Content-Type': 'application/json' };
  if (user) {
    const token = await user.getIdToken();
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export async function apiFetch(path, options = {}) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}${path}`, {
    headers,
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ── Memory ─────────────────────────────────────────────

export const getGlobalMemory = (includeDeleted = false) =>
  apiFetch(`/memory/global${includeDeleted ? '?includeDeleted=true' : ''}`);
export const setGlobalMemory = (key, value) =>
  apiFetch('/memory/global', { method: 'POST', body: JSON.stringify({ key, value }) });
export const deleteGlobalMemory = (key, reason) =>
  apiFetch(`/memory/global/${encodeURIComponent(key)}`, { method: 'DELETE', body: JSON.stringify({ reason }) });
export const restoreGlobalMemory = (key) =>
  apiFetch(`/memory/global/${encodeURIComponent(key)}/restore`, { method: 'POST' });

export const getProjectMemory = (projectId, includeDeleted = false) =>
  apiFetch(`/memory/project/${projectId}${includeDeleted ? '?includeDeleted=true' : ''}`);
export const setProjectMemory = (projectId, key, value) =>
  apiFetch(`/memory/project/${projectId}`, { method: 'POST', body: JSON.stringify({ key, value }) });
export const deleteProjectMemory = (projectId, key, reason) =>
  apiFetch(`/memory/project/${projectId}/${encodeURIComponent(key)}`, { method: 'DELETE', body: JSON.stringify({ reason }) });
export const restoreProjectMemory = (projectId, key) =>
  apiFetch(`/memory/project/${projectId}/${encodeURIComponent(key)}/restore`, { method: 'POST' });

// ── Sync ───────────────────────────────────────────────

export const syncPush = () => apiFetch('/sync/push', { method: 'POST' });
export const syncPull = () => apiFetch('/sync/pull', { method: 'POST' });
export const syncStatus = () => apiFetch('/sync/status');
export const retryDeadLetters = () => apiFetch('/sync/retry-dead-letters', { method: 'POST' });

// ── Health ─────────────────────────────────────────────

export const healthCheck = () => apiFetch('/health');

// ── Tools ──────────────────────────────────────────────

export const getTools = () => apiFetch('/tools');

// ── MCP ────────────────────────────────────────────────

export const getMcpInfo = () => apiFetch('/mcp/info');
export const getMcpTools = () => apiFetch('/mcp/tools');
export const callMcpTool = (name, args) =>
  apiFetch('/mcp/tools/call', { method: 'POST', body: JSON.stringify({ name, arguments: args }) });
