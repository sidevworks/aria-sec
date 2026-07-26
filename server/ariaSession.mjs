// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isDurable, tenantGet, tenantSet, tenantDel, tenantScan } from "./durableStore.mjs";

// Session token format (base64url): <payload_b64>.<signature_b64>
// payload JSON: { sid, tenant_id, user_id, role, iat, exp }
//
// ARIA_SESSION_SECRET — shared secret for HMAC-SHA256 signing.
//   Production: a strong random secret injected by the platform.
//   Staging/dev: any non-empty string; tokens are only as secure as the secret.
//   Unset: session endpoint is disabled (returns 503).
//
// ARIA_SESSION_TTL_SECONDS — token lifetime (default 3600 = 1 hour).
//
// SVC-019 (updated): Sessions are persisted exclusively to KV store (when
//   ARIA_KV_REST_URL is set) so they survive cold starts and EB deployments.
//   Keys are tenant-scoped: tenant:{tenant_id}:sess:{sid}
//   Sessions auto-expire via KV TTL — no polling needed.

const SUPPORTED_ROLES = new Set(["owner", "admin", "analyst", "viewer"]);
const DEFAULT_TTL_S = 3600;
const KV_SESSION_PREFIX = "sess:";

// In-memory fallback registry — keyed by `${tenant_id}:${sid}` for isolation.
// Used only when KV is unavailable (isDurable() === false).
// Warn once so operators know state won't survive restarts.
let _warnedFallback = false;
const _fallbackRegistry = new Map();

function _warnFallback() {
  if (!_warnedFallback) {
    _warnedFallback = true;
    process.stdout.write(
      JSON.stringify({
        level: "warn",
        msg: "ARIA_KV_REST_URL not configured — sessions stored in process memory and will be lost on restart.",
      }) + "\n"
    );
  }
}

function getSecret() {
  return process.env.ARIA_SESSION_SECRET || "";
}

function ttlSeconds() {
  const v = Number(process.env.ARIA_SESSION_TTL_SECONDS ?? DEFAULT_TTL_S);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : DEFAULT_TTL_S;
}

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function fromB64url(str) {
  return Buffer.from(str, "base64url");
}

function sign(payloadB64, secret) {
  return createHmac("sha256", secret).update(payloadB64).digest();
}

function decodePayload(token) {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const payloadB64 = token.slice(0, dot);
  try {
    return JSON.parse(fromB64url(payloadB64).toString("utf8"));
  } catch {
    return null;
  }
}

// ── KV helpers with in-memory fallback ──────────────────────────────────────
// All KV keys are tenant-scoped: tenant:{tenantId}:sess:{sid}

async function sessionGet(tenantId, sid) {
  if (isDurable()) {
    return await tenantGet(tenantId, KV_SESSION_PREFIX + sid);
  }
  _warnFallback();
  const entry = _fallbackRegistry.get(`${tenantId}:${sid}`);
  if (!entry) return null;
  if (entry._expiresAt && Date.now() > entry._expiresAt) {
    _fallbackRegistry.delete(`${tenantId}:${sid}`);
    return null;
  }
  return entry;
}

async function sessionSet(tenantId, sid, entry, ttl = null) {
  if (isDurable()) {
    return await tenantSet(tenantId, KV_SESSION_PREFIX + sid, entry, ttl);
  }
  _warnFallback();
  _fallbackRegistry.set(`${tenantId}:${sid}`, {
    ...entry,
    _expiresAt: ttl ? Date.now() + ttl * 1000 : null,
  });
}

async function sessionDel(tenantId, sid) {
  if (isDurable()) {
    return await tenantDel(tenantId, KV_SESSION_PREFIX + sid);
  }
  _fallbackRegistry.delete(`${tenantId}:${sid}`);
}

async function sessionScan(tenantId) {
  if (isDurable()) {
    return await tenantScan(tenantId, KV_SESSION_PREFIX);
  }
  // In-memory fallback scan — iterate only entries for this tenant
  const now = Date.now();
  const out = [];
  const keyPrefix = `${tenantId}:`;
  for (const [compositeKey, entry] of _fallbackRegistry) {
    if (!compositeKey.startsWith(keyPrefix)) continue;
    if (entry._expiresAt && now > entry._expiresAt) {
      _fallbackRegistry.delete(compositeKey);
      continue;
    }
    out.push({ key: `tenant:${tenantId}:${KV_SESSION_PREFIX}${compositeKey.slice(keyPrefix.length)}`, value: entry });
  }
  return out;
}

// Scan across all tenants (for admin-level listing without tenant filter).
// In-memory: iterate all fallback entries; durable: not supported without full SCAN.
async function sessionScanAll() {
  if (!isDurable()) {
    const now = Date.now();
    const out = [];
    for (const [compositeKey, entry] of _fallbackRegistry) {
      if (entry._expiresAt && now > entry._expiresAt) {
        _fallbackRegistry.delete(compositeKey);
        continue;
      }
      out.push({ key: compositeKey, value: entry });
    }
    return out;
  }
  // Durable path: caller should pass a tenant_id for scoped listing
  return [];
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Issue a signed session token for the given identity.
 * Returns { session_token, tenant_id, user_id, role, expires_at }.
 */
export async function issueSessionToken({ tenant_id, user_id, role }) {
  const secret = getSecret();
  if (!secret) throw new Error("ARIA_SESSION_SECRET is not configured.");

  const normalizedRole = SUPPORTED_ROLES.has(role) ? role : "viewer";
  const now = Math.floor(Date.now() / 1000);
  const ttl = ttlSeconds();
  const exp = now + ttl;

  // Cryptographically random session ID (not timestamp-based)
  const sid = randomBytes(32).toString("base64url");

  const resolvedTenantId = String(tenant_id || "tenant-local");

  const payload = JSON.stringify({
    sid,
    tenant_id: resolvedTenantId,
    user_id:   String(user_id   || "user-local"),
    role:      normalizedRole,
    iat:       now,
    exp,
  });

  const payloadB64 = b64url(payload);
  const sig = b64url(sign(payloadB64, secret));
  const session_token = `${payloadB64}.${sig}`;
  const parsed = JSON.parse(payload);
  const issuedAt  = new Date(parsed.iat * 1000).toISOString();
  const expiresAt = new Date(parsed.exp * 1000).toISOString();

  const entry = {
    sid:        parsed.sid,
    tenant_id:  parsed.tenant_id,
    user_id:    parsed.user_id,
    role:       parsed.role,
    issued_at:  issuedAt,
    expires_at: expiresAt,
    last_seen:  issuedAt,
    revoked_at: null,
  };

  await sessionSet(resolvedTenantId, sid, entry, ttl);

  return {
    session_token,
    tenant_id: parsed.tenant_id,
    user_id:   parsed.user_id,
    role:      normalizedRole,
    expires_at: expiresAt,
  };
}

/**
 * Validate a session token and return its identity payload.
 * Returns { ok: true, identity } or { ok: false, error }.
 * Uses tenant_id from the verified token payload for the KV lookup.
 */
export async function validateSessionToken(token) {
  const secret = getSecret();
  if (!secret) return { ok: false, error: "Session endpoint not configured." };
  if (!token || typeof token !== "string") return { ok: false, error: "Missing token." };

  const dot = token.lastIndexOf(".");
  if (dot < 1) return { ok: false, error: "Malformed token." };

  const payloadB64 = token.slice(0, dot);
  const sigB64     = token.slice(dot + 1);

  // Timing-safe signature comparison
  const expected = sign(payloadB64, secret);
  let provided;
  try {
    provided = fromB64url(sigB64);
  } catch {
    return { ok: false, error: "Malformed token signature." };
  }

  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return { ok: false, error: "Invalid token signature." };
  }

  let payload;
  try {
    payload = JSON.parse(fromB64url(payloadB64).toString("utf8"));
  } catch {
    return { ok: false, error: "Malformed token payload." };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < nowSec) {
    return { ok: false, error: "Token expired." };
  }

  if (!SUPPORTED_ROLES.has(payload.role)) {
    return { ok: false, error: "Invalid role in token." };
  }

  if (payload.sid) {
    const tenantId = String(payload.tenant_id || "tenant-local");
    let entry;
    try {
      entry = await sessionGet(tenantId, payload.sid);
    } catch {
      // KV read failure is non-fatal — token signature already verified
      entry = null;
    }

    if (entry === null || entry === undefined) {
      return { ok: false, error: "Session not found or expired." };
    }

    if (entry.revoked_at) {
      return { ok: false, error: "Session revoked." };
    }

    // Update last_seen, preserving remaining TTL
    const remainingTtl = payload.exp - Math.floor(Date.now() / 1000);
    if (remainingTtl > 0) {
      const updated = { ...entry, last_seen: new Date().toISOString() };
      await sessionSet(tenantId, payload.sid, updated, remainingTtl).catch(() => {});
    }
  }

  return {
    ok: true,
    identity: {
      tenant_id:  String(payload.tenant_id || ""),
      user_id:    String(payload.user_id   || ""),
      role:       payload.role,
      expires_at: new Date(payload.exp * 1000).toISOString(),
    },
  };
}

export function sessionEndpointEnabled() {
  return Boolean(getSecret());
}

export function extractSessionToken(req) {
  const authHeader = String(req?.headers?.authorization || "").trim();
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  const headerToken = String(req?.headers?.["x-session-token"] || "").trim();
  return headerToken || null;
}

/**
 * List all issued sessions, optionally filtered by tenant_id.
 * Returns an array of session entries sorted newest-first.
 */
export async function listIssuedSessions({ tenant_id = null } = {}) {
  let items;
  try {
    items = tenant_id
      ? await sessionScan(tenant_id)
      : await sessionScanAll();
  } catch {
    items = [];
  }

  const sessions = items
    .map(({ value }) => {
      if (!value || typeof value !== "object") return null;
      return {
        sid:        value.sid,
        tenant_id:  value.tenant_id,
        user_id:    value.user_id,
        role:       value.role,
        issued_at:  value.issued_at,
        expires_at: value.expires_at,
        last_seen:  value.last_seen,
        revoked_at: value.revoked_at ?? null,
      };
    })
    .filter((s) => s !== null)
    .filter((s) => !tenant_id || s.tenant_id === tenant_id)
    .sort((a, b) => (a.issued_at < b.issued_at ? 1 : -1));

  return sessions;
}

/**
 * Revoke a session token by its decoded sid.
 * Sets revoked_at in KV so revocation survives restarts.
 */
export async function revokeSessionToken(token) {
  if (!token || typeof token !== "string") return { ok: false, error: "Missing token." };
  const payload = decodePayload(token);
  if (!payload?.sid) return { ok: false, error: "Malformed token payload." };

  return revokeSessionById({ sid: payload.sid, tenant_id: payload.tenant_id });
}

/**
 * Revoke a session by sid.
 * Does NOT delete the entry — revocation must survive restarts.
 */
export async function revokeSessionById({ sid, tenant_id = null }) {
  const id = String(sid || "").trim();
  if (!id) return { ok: false, error: "Missing session id." };

  let entry;
  try {
    // When tenant_id is provided, look up directly in the tenant partition.
    // Without it, fall back to scanning all in-memory entries (durable path
    // requires tenant_id for efficient lookup).
    if (tenant_id) {
      entry = await sessionGet(String(tenant_id), id);
    } else {
      const all = await sessionScanAll();
      const found = all.find(({ value }) => value?.sid === id);
      entry = found?.value ?? null;
    }
  } catch {
    return { ok: false, error: "KV read failed." };
  }

  if (!entry) return { ok: false, error: "Session not found." };
  if (tenant_id && entry.tenant_id !== String(tenant_id)) return { ok: false, error: "Session not found." };
  if (entry.revoked_at) return { ok: true, already_revoked: true, sid: id };

  const revoked_at = new Date().toISOString();
  const updated = { ...entry, revoked_at };

  await sessionSet(String(entry.tenant_id), id, updated, 86400).catch(() => {});

  return { ok: true, sid: id, revoked_at };
}

/**
 * Revoke all sessions for a given tenant.
 * Returns { revoked: number }.
 */
export async function revokeAllSessions(tenantId = null) {
  const sessions = await listIssuedSessions({ tenant_id: tenantId });
  let revoked = 0;
  for (const session of sessions) {
    if (session.revoked_at) continue;
    const result = await revokeSessionById({ sid: session.sid, tenant_id: session.tenant_id });
    if (result.ok && !result.already_revoked) revoked++;
  }
  return { revoked };
}

/**
 * Sessions auto-expire via KV TTL — no polling or background cleanup needed.
 * This is a no-op export kept for API compatibility.
 */
export function enforceSessionTimeout() {
  // No-op: KV TTL handles session expiry automatically.
}

// Tracks synthetic (header-derived) sessions that have been revoked this process lifetime.
const revokedSyntheticSids = new Set();

export function revokeSessionBySid(sid) {
  const id = String(sid || "").trim();
  if (!id) return { ok: false, error: "Missing session id." };
  // Synthetic session pattern: sess-<tenant_id>-<user_id>
  if (id.startsWith("sess-")) {
    if (revokedSyntheticSids.has(id)) return { ok: true, already_revoked: true, sid: id };
    revokedSyntheticSids.add(id);
    const revoked_at = new Date().toISOString();
    return { ok: true, sid: id, revoked_at, entry: { session_id: id, status: "revoked", revoked_at } };
  }
  return { ok: false, error: "Session not found." };
}

export function isSyntheticSidRevoked(sid) {
  return revokedSyntheticSids.has(String(sid || "").trim());
}
