/**
 * API helper — talks to the MCP backend.
 * Reads base URL from VITE_API_BASE_URL env or falls back to '/api' (Vite proxy).
 * Automatically attaches Firebase Auth ID token to every request.
 */

import { auth } from './firebase';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3939/api').replace(/\/$/, '');

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
export const mcpHealthCheck = () => apiFetch('/health/mcp');
export const telegramHealthCheck = () => apiFetch('/health/telegram');

// ── Tools ──────────────────────────────────────────────

export const getTools = () => apiFetch('/tools');

// ── MCP ────────────────────────────────────────────────

export const getMcpInfo = () => apiFetch('/mcp/info');
export const getMcpTools = () => apiFetch('/mcp/tools');
export const callMcpTool = (name, args) =>
  apiFetch('/mcp/tools/call', { method: 'POST', body: JSON.stringify({ name, arguments: args }) });

// ── Projects ───────────────────────────────────────────

export const listProjectsApi = () => apiFetch('/projects');
export const getProjectApi = (id) => apiFetch(`/projects/${id}`);
export const createProjectApi = (data) =>
  apiFetch('/projects', { method: 'POST', body: JSON.stringify(data) });
export const rescanProjectApi = (id) =>
  apiFetch(`/projects/${id}/rescan`, { method: 'POST' });
export const scanPreview = (local_path) =>
  apiFetch('/projects/scan-preview', { method: 'POST', body: JSON.stringify({ local_path }) });
export const validateGitHub = (data) =>
  apiFetch('/projects/validate-github', { method: 'POST', body: JSON.stringify(data) });

// ── MCP Clients ────────────────────────────────────────

export const listMcpClients = () => apiFetch('/mcp/clients');
export const getMcpClientApi = (id) => apiFetch(`/mcp/clients/${id}`);
export const createMcpClientApi = (data) =>
  apiFetch('/mcp/clients', { method: 'POST', body: JSON.stringify(data) });
export const updateMcpClientApi = (id, data) =>
  apiFetch(`/mcp/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const testMcpClientApi = (id) =>
  apiFetch(`/mcp/clients/${id}/test`, { method: 'POST' });
export const reconnectMcpClientApi = (id) =>
  apiFetch(`/mcp/clients/${id}/reconnect`, { method: 'POST' });
export const launchMcpClientApi = (id, action = 'launch') =>
  apiFetch(`/mcp/clients/${id}/launch`, { method: 'POST', body: JSON.stringify({ action }) });
export const getMcpClientMeta = () => apiFetch('/mcp/clients/meta');

export const addFreeformMemoryApi = ({
  text,
  tags = [],
  projectId,
  importance = 'medium',
  pinned = false,
  key,
}) => {
  const memoryKey = key || `manual_${Date.now()}`;
  const value = {
    manual: true,
    text,
    tags,
    importance,
    pinned,
    created_at: new Date().toISOString(),
  };

  if (projectId) {
    return setProjectMemory(projectId, memoryKey, value);
  }
  return setGlobalMemory(memoryKey, value);
};
