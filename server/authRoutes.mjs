// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// authRoutes.mjs — /api/auth/{login,logout,session}
//
// Entry-point auth routes (not behind the authz gate). Login validates operator
// credentials and returns an opaque session token; logout revokes it; session
// echoes the identity bound to the presented token.

import { logAuditEvent } from "./auditLog.mjs";
import {
  createSession,
  destroySession,
  getSession,
  resolveSessionToken,
  verifyCredentials,
} from "./authSessions.mjs";

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function clientIp(req) {
  return String(req?.socket?.remoteAddress || req?.headers?.["x-forwarded-for"] || "unknown")
    .split(",")[0]
    .trim();
}

export async function handleAuthRoutes(req, res, apiPath, body) {
  if (apiPath === "/api/auth/login") {
    if (req.method !== "POST") { sendJson(res, 405, { error: "Method not allowed" }); return true; }
    const username = String(body?.username || "").trim();
    const password = String(body?.password || "");
    if (!username || !password) {
      sendJson(res, 400, { error: "Username and password are required." });
      return true;
    }

    const identity = verifyCredentials(username, password);
    if (!identity) {
      logAuditEvent({
        event_type: "auth.login_failed",
        status: "denied",
        actor: username,
        context: { source_ip: clientIp(req), reason: "invalid_credentials" },
      });
      // Constant 401 — never reveal whether the username exists.
      sendJson(res, 401, { error: "Invalid credentials." });
      return true;
    }

    const { token, session } = createSession(identity);
    logAuditEvent({
      event_type: "auth.login_success",
      status: "allowed",
      actor: identity.user_id,
      context: { tenant_id: identity.tenant_id, role: identity.role, source_ip: clientIp(req) },
    });
    sendJson(res, 200, {
      token,
      identity: {
        tenant_id: session.tenant_id,
        user_id: session.user_id,
        role: session.role,
        username: session.username,
      },
      expires_at: session.expires_at,
    });
    return true;
  }

  if (apiPath === "/api/auth/logout") {
    if (req.method !== "POST") { sendJson(res, 405, { error: "Method not allowed" }); return true; }
    const token = resolveSessionToken(req);
    const session = getSession(token);
    destroySession(token);
    if (session) {
      logAuditEvent({
        event_type: "auth.logout",
        status: "allowed",
        actor: session.user_id,
        context: { tenant_id: session.tenant_id, source_ip: clientIp(req) },
      });
    }
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (apiPath === "/api/auth/session") {
    const session = getSession(resolveSessionToken(req));
    if (!session) { sendJson(res, 401, { error: "No active session." }); return true; }
    sendJson(res, 200, {
      identity: {
        tenant_id: session.tenant_id,
        user_id: session.user_id,
        role: session.role,
        username: session.username,
      },
      expires_at: session.expires_at,
    });
    return true;
  }

  return false;
}
