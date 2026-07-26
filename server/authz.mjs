// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { logAuditEvent } from "./auditLog.mjs";
import { createPublicKey, verify as cryptoVerify } from "node:crypto";
import { resolveSessionIdentity } from "./authSessions.mjs";

const SUPPORTED_ROLES = new Set(["owner", "admin", "analyst", "viewer"]);
const TENANT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,63}$/;
const USER_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:@-]{1,127}$/;

// JWKS cache: { keys: [], fetchedAt: number }
let _jwksCache = null;
const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchJwks(issuer) {
  const now = Date.now();
  if (_jwksCache && now - _jwksCache.fetchedAt < JWKS_CACHE_TTL_MS) {
    return _jwksCache.keys;
  }
  const url = `${issuer}/.well-known/jwks.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const data = await res.json();
  _jwksCache = { keys: data.keys || [], fetchedAt: now };
  return _jwksCache.keys;
}

function b64urlDecode(str) {
  return Buffer.from(str, "base64url");
}

export async function verifyJwtBearer(req) {
  const authHeader = String(req?.headers?.authorization || "").trim();
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return { ok: false, skipped: true };
  }
  const token = authHeader.slice(7).trim();
  if (!token) return { ok: false, skipped: true };

  const issuer = process.env.OAUTH_ISSUER;
  if (!issuer) return { ok: false, skipped: true };

  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, error: "Malformed JWT." };

  let header;
  try {
    header = JSON.parse(b64urlDecode(parts[0]).toString("utf8"));
  } catch {
    return { ok: false, error: "Malformed JWT header." };
  }

  let payload;
  try {
    payload = JSON.parse(b64urlDecode(parts[1]).toString("utf8"));
  } catch {
    return { ok: false, error: "Malformed JWT payload." };
  }

  let keys;
  try {
    keys = await fetchJwks(issuer);
  } catch (err) {
    return { ok: false, error: `JWKS unavailable: ${err.message}` };
  }

  const matchingKey = header.kid
    ? keys.find((k) => k.kid === header.kid)
    : keys.find((k) => k.kty === "RSA");

  if (!matchingKey) return { ok: false, error: "No matching JWK found." };

  let pubKey;
  try {
    pubKey = createPublicKey({
      key: { kty: matchingKey.kty, n: matchingKey.n, e: matchingKey.e, alg: matchingKey.alg || "RS256" },
      format: "jwk",
    });
  } catch {
    return { ok: false, error: "Invalid JWK." };
  }

  const signingInput = Buffer.from(`${parts[0]}.${parts[1]}`);
  const signature = b64urlDecode(parts[2]);

  let valid;
  try {
    valid = cryptoVerify("RSA-SHA256", signingInput, pubKey, signature);
  } catch {
    return { ok: false, error: "Signature verification error." };
  }

  if (!valid) return { ok: false, error: "Invalid JWT signature." };

  if (payload.iss !== issuer) return { ok: false, error: "JWT issuer mismatch." };

  const nowSec = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < nowSec) return { ok: false, error: "JWT expired." };

  const tenant_id = String(payload.tenant_id || payload.tid || "").trim();
  const user_id   = String(payload.user_id   || payload.sub || "").trim();
  const role      = String(payload.role || "viewer").trim().toLowerCase();

  return { ok: true, identity: { tenant_id, user_id, role } };
}

function isLoopbackAddress(addr = "") {
  const value = String(addr || "").trim();
  return value === "::1" || value === "127.0.0.1" || value === "::ffff:127.0.0.1";
}

function trustIdentityHeadersFromRemote() {
  return ["1", "true", "yes", "on"].includes(String(process.env.ARIA_TRUST_IDENTITY_HEADERS_FROM_REMOTE || "").toLowerCase());
}

function normalizeRole(value) {
  const role = String(value || "").trim().toLowerCase();
  return SUPPORTED_ROLES.has(role) ? role : null;
}

function pathScope(apiPath = "") {
  if (apiPath.startsWith("/api/aria/")) return "aria";
  if (apiPath.startsWith("/api/ai-spm/")) return "ai-spm";
  if (apiPath.startsWith("/api/connectors/")) return "connectors";
  if (apiPath.startsWith("/api/network/")) return "network";
  if (apiPath.startsWith("/api/bluetooth/")) return "bluetooth";
  if (apiPath.startsWith("/api/identity/")) return "identity";
  return null;
}

function actionType(req) {
  return String(req?.method || "GET").toUpperCase() === "GET" ? "read" : "write";
}

function canRoleAccess({ role, scope, action, apiPath }) {
  if (role === "owner" || role === "admin") return true;
  if (role === "analyst") {
    if (scope === "connectors") return action === "read";
    if (scope === "ai-spm") return true;
    if (scope === "aria") {
      if (apiPath === "/api/aria/autonomy" && action === "write") return false;
      return true;
    }
    // Connectors: analysts can read status but cannot connect/disconnect/supply credentials.
    if (scope === "connectors") return action === "read";
    // Network: analysts can read status/galaxies, trigger passive (GET) discovery,
    // and RUN an active scan within an already-authorized window (SOC threat-hunting
    // is an analyst function). But *authorizing* a scan — attesting legal authority
    // over the segments — and revoking/clearing it stay reserved for admin/owner.
    if (scope === "network") {
      if (action === "read") return true;
      return apiPath === "/api/network/scan/active";
    }
    if (scope === "bluetooth") return true;
    // Identity: read-only directory/UEBA data. Analysts can read; no writes exist.
    if (scope === "identity") return action === "read";
    return false;
  }
  if (role === "viewer") {
    // Viewers can read public status endpoints but cannot manage connectors.
    if (scope === "connectors") return action === "read";
    // Network: read-only (status, galaxies, passive). No authorize/active scan.
    if (scope === "network") return action === "read";
    if (scope === "bluetooth") return action === "read";
    return action === "read";
  }
  return false;
}

function isBypassEnabled() {
  return ["1", "true", "yes", "on"].includes(String(process.env.ARIA_AUTHZ_ALLOW_LOCAL_BYPASS || "").toLowerCase());
}

// In a standalone server deployment, a reverse proxy on the same host forwards
// requests to this process over loopback — so "the request came from 127.0.0.1"
// no longer implies "this is our own trusted Electron-spawned backend." When
// ARIA_TRUST_PROXY_SECRET is configured, loopback callers must also present it
// before their self-asserted identity headers are trusted. Unconfigured, this
// is a no-op so today's local/Electron flow is unaffected.
function proxySecretValid(req) {
  const expected = process.env.ARIA_TRUST_PROXY_SECRET;
  if (!expected) return true;
  const supplied = String(req?.headers?.["x-aria-proxy-secret"] || "");
  return supplied === expected;
}

export function extractTenantContext(req) {
  const headers = req?.headers || {};
  const remoteAddress = String(req?.socket?.remoteAddress || "");
  const allowRemoteHeaders = trustIdentityHeadersFromRemote();
  const trustedHeaderSource = (allowRemoteHeaders || isLoopbackAddress(remoteAddress)) && proxySecretValid(req);

  const rawTenant = trustedHeaderSource ? String(headers["x-tenant-id"] || "").trim() : "";
  const rawUser = trustedHeaderSource ? String(headers["x-user-id"] || "").trim() : "";
  const roleHeader = trustedHeaderSource ? String(headers["x-role"] || "").trim() : "";
  // Only fall back to env/default when the header is absent entirely.
  // An explicit but unrecognized role header must not silently elevate to "owner".
  const role = roleHeader
    ? (normalizeRole(roleHeader) ?? "__invalid__")
    : (normalizeRole(process.env.ARIA_DEFAULT_ROLE) || "viewer");

  return {
    tenant_id: rawTenant || process.env.ARIA_DEFAULT_TENANT_ID || "tenant-local",
    user_id: rawUser || process.env.ARIA_DEFAULT_USER_ID || "user-local",
    role,
    // flags for enforce-mode checks
    _has_tenant_header: !!rawTenant,
    _has_user_header: !!rawUser,
    _has_role_header: !!roleHeader,
    source: trustedHeaderSource ? "headers" : "untrusted-remote",
  };
}

function denyAudit({ event_type, context, apiPath, reason }) {
  logAuditEvent({
    event_type,
    status: "denied",
    actor: context?.user_id || "unknown",
    context: {
      tenant_id: context?.tenant_id,
      role: context?.role,
      api_path: apiPath,
      reason,
    },
  });
}

export async function extractTenantContextAsync(req) {
  const jwtResult = await verifyJwtBearer(req);
  if (jwtResult.ok) {
    const identity = jwtResult.identity;
    const role = normalizeRole(identity.role) || "viewer";
    return {
      tenant_id: identity.tenant_id || process.env.ARIA_DEFAULT_TENANT_ID || "tenant-local",
      user_id:   identity.user_id   || process.env.ARIA_DEFAULT_USER_ID   || "user-local",
      role,
      _has_tenant_header: !!identity.tenant_id,
      _has_user_header:   !!identity.user_id,
      _has_role_header:   !!identity.role,
      source: "oauth_jwt",
    };
  }

  // Fall back to header-based identity (dev, loopback, or ARIA_ALLOW_UNAUTH_SESSION_ISSUE).
  return extractTenantContext(req);
}

export async function authorizeRequest({ req, apiPath }) {
  const scope = pathScope(apiPath);
  if (!scope) {
    return { allowed: true, context: null };
  }

  const allowUnauthIssue = ["1", "true", "yes", "on"].includes(String(process.env.ARIA_ALLOW_UNAUTH_SESSION_ISSUE || "").toLowerCase());
  const remoteAddress = String(req?.socket?.remoteAddress || "");
  const isLoopback = isLoopbackAddress(remoteAddress);
  // A configured proxy secret means loopback traffic is a reverse-proxy hop in a
  // real deployment, not our own spawned process — JWT verification must still run.
  const proxyFronted = !!process.env.ARIA_TRUST_PROXY_SECRET;
  const useJwt = !allowUnauthIssue && (!isLoopback || proxyFronted);
  // A valid operator session token is authoritative — it carries the identity
  // established at login and overrides header/JWT/default resolution.
  const sessionIdentity = resolveSessionIdentity(req);
  const context = sessionIdentity
    ? {
        tenant_id: sessionIdentity.tenant_id,
        user_id: sessionIdentity.user_id,
        role: sessionIdentity.role,
        _has_tenant_header: true,
        _has_user_header: true,
        _has_role_header: true,
        source: "session-token",
      }
    : (useJwt ? await extractTenantContextAsync(req) : extractTenantContext(req));
  const bypass = isBypassEnabled();
  const missingHeaders = !context._has_tenant_header || !context._has_user_header || !context._has_role_header;

  // Default behavior is now deny-by-default for missing auth context.
  // A local/demo bypass can be explicitly enabled for developer workflows.
  if (missingHeaders && !bypass) {
    denyAudit({ event_type: "authz.missing_context", context, apiPath, reason: "Missing required auth headers (x-tenant-id / x-user-id / x-role)" });
    return {
      allowed: false,
      statusCode: 401,
      error: "Missing auth context (x-tenant-id, x-user-id, and x-role headers are required).",
      context,
    };
  }

  if (!TENANT_ID_PATTERN.test(context.tenant_id)) {
    denyAudit({ event_type: "authz.invalid_context", context, apiPath, reason: `Invalid tenant_id format: ${context.tenant_id}` });
    return {
      allowed: false,
      statusCode: 400,
      error: "Invalid tenant context (x-tenant-id format is not allowed).",
      context,
    };
  }

  if (!USER_ID_PATTERN.test(context.user_id)) {
    denyAudit({ event_type: "authz.invalid_context", context, apiPath, reason: `Invalid user_id format: ${context.user_id}` });
    return {
      allowed: false,
      statusCode: 400,
      error: "Invalid user context (x-user-id format is not allowed).",
      context,
    };
  }

  // Cross-tenant guard: if caller supplies x-resource-tenant it must match their own tenant.
  const resourceTenant = String(req?.headers?.["x-resource-tenant"] || "").trim();
  if (resourceTenant && resourceTenant !== context.tenant_id) {
    denyAudit({ event_type: "authz.cross_tenant_denied", context, apiPath, reason: `Tenant ${context.tenant_id} attempted to access resource owned by ${resourceTenant}` });
    return {
      allowed: false,
      statusCode: 403,
      error: `Cross-tenant access denied. Caller tenant ${context.tenant_id} may not access resources for ${resourceTenant}.`,
      context,
    };
  }

  const action = actionType(req);
  const allowed = canRoleAccess({ role: context.role, scope, action, apiPath });
  if (!allowed) {
    denyAudit({ event_type: "authz.role_denied", context, apiPath, reason: `Role ${context.role} denied ${action} on ${scope}` });
    return {
      allowed: false,
      statusCode: 403,
      error: `Role '${context.role}' is not permitted to ${action} ${scope}.`,
      context,
    };
  }

  return { allowed: true, context };
}

export function isValidTenantId(value) {
  return TENANT_ID_PATTERN.test(String(value || ""));
}

export function isValidUserId(value) {
  return USER_ID_PATTERN.test(String(value || ""));
}

export function normalizeSupportedRole(value) {
  return normalizeRole(value);
}
