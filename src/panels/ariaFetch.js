// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// Shared fetch utility — timeout, retry, dedup, 401 auto-logout, cache invalidation
// Closes: CROSS-001, CROSS-002, CROSS-003, CROSS-004, CROSS-005, CROSS-006, CROSS-009, CROSS-010, CROSS-011

const IN_FLIGHT = new Map();

// Quota backoff: tracks paths that returned 429 and when they can be retried.
// Prevents poll loops from flooding the server after a quota hit.
const QUOTA_BACKOFF = new Map(); // path → unblockAt (ms)
const DEFAULT_QUOTA_BACKOFF_MS = 5 * 60 * 1000; // 5 min if server sends no Retry-After
const CACHE_INVALIDATION_MAP = {
  "/api/incidents": ["/api/incidents", "/api/live"],
  "/api/blocked-ips": ["/api/blocked-ips", "/api/live"],
  "/api/quarantine": ["/api/quarantine", "/api/live"],
  "/api/aria/approval": ["/api/aria/approval/queue"],
  "/api/aria/trust": ["/api/aria/trust", "/api/aria/audit-events"],
  "/api/ai-spm": ["/api/ai-spm/findings", "/api/ai-spm/inventory"],
};

function getApiBase() {
  const configured = (typeof import.meta !== "undefined" && import.meta.env?.VITE_ARIA_API_BASE || "").replace(/\/$/, "");
  if (configured) return configured;
  if (typeof window !== "undefined" && window.location?.protocol === "app:") return "http://127.0.0.1:5000";
  return "";
}

// Runtime operator session token, set on successful login. When present it is
// sent on every request and the server resolves the authenticated identity from
// it (overriding the env-default identity headers).
let _sessionToken = null;
export function setSessionToken(token) { _sessionToken = token || null; }
export function getSessionToken() { return _sessionToken; }

// Global demo-mode flag. When on, every request carries x-aria-demo:1 so
// identity/network endpoints serve labelled sample data for data protection.
let _demoMode = false;
export function setDemoMode(on) { _demoMode = Boolean(on); }
export function getDemoMode() { return _demoMode; }

function getAuthHeaders() {
  const tenantId = import.meta.env?.VITE_ARIA_TENANT_ID || "tenant-local";
  const userId = import.meta.env?.VITE_ARIA_USER_ID || "admin";
  const role = import.meta.env?.VITE_ARIA_ROLE || "owner";
  const headers = {
    "Content-Type": "application/json",
    "x-tenant-id": tenantId,
    "x-user-id": userId,
    "x-role": role,
  };
  if (_sessionToken) headers["x-session-token"] = _sessionToken;
  if (_demoMode) headers["x-aria-demo"] = "1";
  return headers;
}

let _logoutDispatch = null;
export function setLogoutHandler(fn) { _logoutDispatch = fn; }

function invalidateCacheFor(path) {
  for (const [prefix, keys] of Object.entries(CACHE_INVALIDATION_MAP)) {
    if (path.startsWith(prefix)) {
      keys.forEach(k => { IN_FLIGHT.delete("GET:" + k); });
    }
  }
}

async function fetchOnce(method, path, body, signal) {
  const base = getApiBase();
  const res = await fetch(`${base}${path}`, {
    method,
    signal,
    headers: getAuthHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    _logoutDispatch?.();
    return { error: "SESSION_EXPIRED", status: 401 };
  }
  if (res.status === 403) return { error: "PERMISSION_DENIED", status: 403 };
  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After");
    const backoffMs = retryAfter ? Number(retryAfter) * 1000 : DEFAULT_QUOTA_BACKOFF_MS;
    QUOTA_BACKOFF.set(path, Date.now() + backoffMs);
    return { error: "QUOTA_EXCEEDED", status: 429, retryAfter };
  }
  if (!res.ok) {
    let errBody = {};
    try { errBody = await res.json(); } catch { /* ignore */ }
    return { error: errBody.error || "REQUEST_FAILED", message: errBody.message, status: res.status };
  }

  const data = await res.json();
  return { data };
}

export async function ariaFetch(method, path, body) {
  const key = `${method}:${path}`;

  // If this path is in quota backoff, return the cached error immediately.
  const backoffUntil = QUOTA_BACKOFF.get(path);
  if (backoffUntil) {
    if (Date.now() < backoffUntil) return { error: "QUOTA_EXCEEDED", status: 429 };
    QUOTA_BACKOFF.delete(path);
  }

  if (method === "GET" && IN_FLIGHT.has(key)) return IN_FLIGHT.get(key);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  const promise = fetchOnce(method, path, body, controller.signal)
    .catch(err => {
      if (err.name === "AbortError") return { error: "TIMEOUT" };
      return { error: "NETWORK_ERROR", message: err.message };
    })
    .finally(() => {
      clearTimeout(timeout);
      IN_FLIGHT.delete(key);
      if (method !== "GET") invalidateCacheFor(path);
    });

  if (method === "GET") IN_FLIGHT.set(key, promise);
  return promise;
}

export async function ariaFetchWithRetry(method, path, body, maxRetries = 3) {
  let lastResult;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    lastResult = await ariaFetch(method, path, body);
    if (!lastResult.error || lastResult.status === 401 || lastResult.status === 403 || lastResult.status === 404) {
      return lastResult;
    }
    if (attempt < maxRetries) {
      await new Promise(r => setTimeout(r, Math.min(1000 * 2 ** attempt, 10_000)));
    }
  }
  return lastResult;
}
