// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { persistencePath } from "./persistenceConfig.mjs";

function storePath() {
  return persistencePath(["sessions.json"], { purpose: "session store" });
}

function ensureStore() {
  const p = storePath();
  const dir = dirname(p);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(p)) writeFileSync(p, "[]\n", "utf8");
}

function readSessions() {
  ensureStore();
  try {
    const data = JSON.parse(readFileSync(storePath(), "utf8"));
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

function writeSessions(sessions) {
  ensureStore();
  writeFileSync(storePath(), `${JSON.stringify(sessions, null, 2)}\n`, "utf8");
}

export function listSessions({ tenant_id } = {}) {
  const all = readSessions();
  return tenant_id ? all.filter(s => s.tenant_id === tenant_id) : all;
}

export function getSession(session_id) {
  return readSessions().find(s => s.session_id === session_id) || null;
}

export function upsertSession(session) {
  const sessions = readSessions();
  const idx = sessions.findIndex(s => s.session_id === session.session_id);
  if (idx >= 0) sessions[idx] = { ...sessions[idx], ...session };
  else sessions.push(session);
  writeSessions(sessions);
  return sessions.find(s => s.session_id === session.session_id);
}

export function revokeSession(session_id) {
  const sessions = readSessions();
  const idx = sessions.findIndex(s => s.session_id === session_id);
  if (idx < 0) return null;
  sessions[idx] = { ...sessions[idx], status: "revoked", revoked_at: new Date().toISOString() };
  writeSessions(sessions);
  return sessions[idx];
}

export function synthesizeCurrentSession(tenantCtx) {
  // Build a live session record from the current request's auth context
  return {
    session_id: `sess-${tenantCtx.tenant_id}-${tenantCtx.user_id}`,
    tenant_id: tenantCtx.tenant_id,
    user_id: tenantCtx.user_id,
    role: tenantCtx.role,
    issued_at: new Date().toISOString(),
    expires_at: null,
    last_seen: new Date().toISOString(),
    source: tenantCtx._has_tenant_header ? "header" : "default",
    status: "active",
  };
}
