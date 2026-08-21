const API_URL = import.meta.env.VITE_API_URL || '/api';

let accessToken = localStorage.getItem('tm_access') || null;
let refreshToken = localStorage.getItem('tm_refresh') || null;

export function setTokens(access, refresh) {
  accessToken = access;
  refreshToken = refresh;
  if (access) localStorage.setItem('tm_access', access);
  else localStorage.removeItem('tm_access');
  if (refresh) localStorage.setItem('tm_refresh', refresh);
  else localStorage.removeItem('tm_refresh');
}

export function getAccessToken() {
  return accessToken;
}

export function clearTokens() {
  setTokens(null, null);
}

async function request(method, path, body, { formData = false, timeoutMs = 0, signal } = {}) {
  const headers = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (!formData && body !== undefined) headers['Content-Type'] = 'application/json';

  let reqSignal;
  if (signal && typeof AbortSignal.any === 'function' && timeoutMs > 0) {
    reqSignal = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
  } else if (signal) {
    reqSignal = signal;
  } else if (timeoutMs > 0) {
    reqSignal = AbortSignal.timeout(timeoutMs);
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: formData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    ...(reqSignal ? { signal: reqSignal } : {}),
  });

  if (res.status === 401 && refreshToken) {
    // try to refresh once
    try {
      const r = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (r.ok) {
        const data = await r.json();
        setTokens(data.access, data.refresh);
        return request(method, path, body, { formData, timeoutMs, signal });
      }
    } catch { /* fall through */ }
  }

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err = new Error(data?.error || data?.message || 'Request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body, opts) => request('POST', path, body, opts),
  patch: (path, body) => request('PATCH', path, body),
  put: (path, body) => request('PUT', path, body),
  del: (path) => request('DELETE', path),
};