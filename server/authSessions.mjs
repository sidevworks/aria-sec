// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// authSessions.mjs — operator credential store + opaque session tokens.
//
// Auth model: an operator authenticates with username/password against a small
// credential store. A built-in demo operator is available only in explicit
// development/test mode; production and unclassified environments fail closed.
// On success we mint a random opaque token held in memory and map it to the
// operator's identity (tenant_id / user_id / role). API requests presenting the
// token via `X-Session-Token` (or `Authorization: Bearer <token>`) resolve to
// that identity in authz. Tokens are in-memory only — a server restart or the
// "login each load" client flow naturally clears them; nothing is persisted.

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SUPPORTED_ROLES = new Set(["owner", "admin", "analyst", "viewer"]);
const SESSION_TTL_MS = Number(process.env.ARIA_SESSION_TTL_MS) || 12 * 60 * 60 * 1000; // 12h

// token → { tenant_id, user_id, role, username, issued_at, expires_at }
const SESSIONS = new Map();

function hashPassword(password, salt) {
  return scryptSync(String(password), salt, 64);
}

function normalizeRole(value, fallback = "viewer") {
  const role = String(value || "").trim().toLowerCase();
  return SUPPORTED_ROLES.has(role) ? role : fallback;
}

// Build the operator credential table once at module load. Two sources:
//   1. ARIA_OPERATORS — JSON array of { username, password, tenant_id, user_id, role }
//   2. ARIA_LOGIN_USERNAME / ARIA_LOGIN_PASSWORD (+ optional tenant/user/role) — single operator
// If neither is set, a built-in demo operator is provided only in explicit
// development/test mode. ARIA_ENABLE_DEMO_LOGIN=true is also accepted outside
// production for packaged local demos.
function loadOperators() {
  const operators = [];

  const addOperator = (raw) => {
    const username = String(raw?.username || "").trim();
    const password = String(raw?.password || "");
    if (!username || !password) return;
    const salt = randomBytes(16);
    operators.push({
      username: username.toLowerCase(),
      salt,
      hash: hashPassword(password, salt),
      tenant_id: String(raw.tenant_id || process.env.ARIA_DEFAULT_TENANT_ID || "tenant-local").trim(),
      user_id: String(raw.user_id || `user-${username}`).trim(),
      role: normalizeRole(raw.role, "owner"),
    });
  };

  if (process.env.ARIA_OPERATORS) {
    try {
      const parsed = JSON.parse(process.env.ARIA_OPERATORS);
      if (Array.isArray(parsed)) parsed.forEach(addOperator);
    } catch (err) {
      console.warn("[auth] ARIA_OPERATORS is not valid JSON — ignoring:", err.message);
    }
  }

  if (process.env.ARIA_LOGIN_USERNAME && process.env.ARIA_LOGIN_PASSWORD) {
    addOperator({
      username: process.env.ARIA_LOGIN_USERNAME,
      password: process.env.ARIA_LOGIN_PASSWORD,
      tenant_id: process.env.ARIA_LOGIN_TENANT_ID,
      user_id: process.env.ARIA_LOGIN_USER_ID,
      role: process.env.ARIA_LOGIN_ROLE,
    });
  }

  const runtimeMode = String(process.env.NODE_ENV || "").trim().toLowerCase();
  const demoLoginExplicitlyEnabled =
    String(process.env.ARIA_ENABLE_DEMO_LOGIN || "").trim().toLowerCase() === "true";
  const mayUseDemoLogin =
    runtimeMode === "development" ||
    runtimeMode === "test" ||
    (runtimeMode !== "production" && demoLoginExplicitlyEnabled);

  if (operators.length === 0 && mayUseDemoLogin) {
    addOperator({ username: "operator", password: "aria", role: "owner", user_id: "user-operator" });
  }

  return operators;
}

const OPERATORS = loadOperators();

export function verifyCredentials(username, password) {
  const lookup = String(username || "").trim().toLowerCase();
  const operator = OPERATORS.find((op) => op.username === lookup);
  if (!operator) return null;
  const candidate = hashPassword(password, operator.salt);
  if (candidate.length !== operator.hash.length) return null;
  if (!timingSafeEqual(candidate, operator.hash)) return null;
  return { tenant_id: operator.tenant_id, user_id: operator.user_id, role: operator.role, username: operator.username };
}

export function createSession(identity) {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  const session = {
    tenant_id: identity.tenant_id,
    user_id: identity.user_id,
    role: identity.role,
    username: identity.username,
    issued_at: new Date(now).toISOString(),
    expires_at: new Date(now + SESSION_TTL_MS).toISOString(),
  };
  SESSIONS.set(token, session);
  return { token, session };
}

export function getSession(token) {
  if (!token) return null;
  const session = SESSIONS.get(token);
  if (!session) return null;
  if (Date.parse(session.expires_at) <= Date.now()) {
    SESSIONS.delete(token);
    return null;
  }
  return session;
}

export function destroySession(token) {
  if (!token) return false;
  return SESSIONS.delete(token);
}

// Pull a session token off a request: prefer the dedicated header, fall back to a
// non-JWT Bearer token (JWTs contain dots, opaque session tokens do not).
export function resolveSessionToken(req) {
  const headers = req?.headers || {};
  const explicit = String(headers["x-session-token"] || "").trim();
  if (explicit) return explicit;
  const auth = String(headers["authorization"] || "").trim();
  if (auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token && !token.includes(".")) return token;
  }
  return "";
}

// Identity (tenant/user/role) for a valid session token, or null. Used by authz
// to treat an authenticated operator's token as authoritative.
export function resolveSessionIdentity(req) {
  const session = getSession(resolveSessionToken(req));
  if (!session) return null;
  return { tenant_id: session.tenant_id, user_id: session.user_id, role: session.role };
}
