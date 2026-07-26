// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { handleAriaRequest } from "../../server/index.mjs";

process.env.ARIA_AI_SPM_DISABLE_GH_AUTO = "1";

const MEMORY_DIR = join(process.cwd(), "aria-memory");
const AUDIT_LOG_PATH = join(MEMORY_DIR, "audit-events.json");
const SESSIONS_PATH = join(MEMORY_DIR, "sessions.json");

if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });

const TENANT = "tenant-sessions-test";
const OWNER_HEADERS = {
  "x-tenant-id": TENANT,
  "x-user-id": "owner-user",
  "x-role": "owner",
};
const VIEWER_HEADERS = {
  "x-tenant-id": TENANT,
  "x-user-id": "viewer-user",
  "x-role": "viewer",
};

// createReq supports both Symbol.asyncIterator (used by some handlers) and
// EventEmitter "data"/"end" events (used by the revoke body-parsing handler).
function createReq({ method = "GET", url = "/", body, headers = {} } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = headers;
  req[Symbol.asyncIterator] = async function* () {
    if (body !== undefined) yield Buffer.from(JSON.stringify(body));
  };
  // Schedule event-emitter style body delivery on next tick so handlers that
  // attach listeners synchronously will receive the data.
  if (body !== undefined) {
    const encoded = Buffer.from(JSON.stringify(body));
    setImmediate(() => {
      req.emit("data", encoded);
      req.emit("end");
    });
  } else {
    setImmediate(() => req.emit("end"));
  }
  return req;
}

function createRes() {
  return {
    statusCode: 0,
    headers: {},
    payload: "",
    writeHead(statusCode, headers) { this.statusCode = statusCode; this.headers = headers; },
    end(payload = "") { this.payload = payload; },
    json() { return JSON.parse(this.payload); },
  };
}

async function request(options) {
  const req = createReq(options);
  const res = createRes();
  await handleAriaRequest(req, res);
  return res;
}

function readAuditLog() {
  try {
    const raw = readFileSync(AUDIT_LOG_PATH, "utf8");
    return JSON.parse(raw);
  } catch { return []; }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test("authorized session list returns expected shape", async () => {
  const res = await request({
    url: "/api/aria/sessions",
    headers: OWNER_HEADERS,
  });
  assert.equal(res.statusCode, 200, `expected 200, got ${res.statusCode}: ${res.payload}`);
  const body = res.json();
  assert.ok(Array.isArray(body.sessions), "sessions must be an Array");
  assert.equal(typeof body.total, "number", "total must be a Number");
  assert.equal(typeof body.identity, "object", "identity must be an Object");
  assert.ok(body.identity !== null, "identity must not be null");
});

test("unauthorized session list returns 401 or 403 when ARIA_AUTHZ_ENFORCE=1", async () => {
  const prev = process.env.ARIA_AUTHZ_ENFORCE;
  process.env.ARIA_AUTHZ_ENFORCE = "1";
  try {
    const res = await request({
      url: "/api/aria/sessions",
      headers: { "x-tenant-id": TENANT, "x-user-id": "hacker", "x-role": "hacker" },
    });
    assert.ok(
      res.statusCode === 401 || res.statusCode === 403,
      `expected 401 or 403, got ${res.statusCode}`,
    );
  } finally {
    if (prev === undefined) delete process.env.ARIA_AUTHZ_ENFORCE;
    else process.env.ARIA_AUTHZ_ENFORCE = prev;
  }
});

test("revoke success emits audit event", async () => {
  // First get a real session ID by listing sessions (synthesizes one).
  const listRes = await request({
    url: "/api/aria/sessions",
    headers: OWNER_HEADERS,
  });
  assert.equal(listRes.statusCode, 200, "list must succeed");
  const { sessions } = listRes.json();
  assert.ok(sessions.length > 0, "at least one session must exist after list");
  const sessionId = sessions[0].session_id;

  const auditBefore = readAuditLog();

  const revokeRes = await request({
    method: "POST",
    url: `/api/aria/sessions/${sessionId}/revoke`,
    body: { reason: "test revoke" },
    headers: OWNER_HEADERS,
  });
  assert.equal(revokeRes.statusCode, 200, `expected 200, got ${revokeRes.statusCode}: ${revokeRes.payload}`);
  const revokeBody = revokeRes.json();
  assert.equal(revokeBody.revoked, true);
  assert.ok(revokeBody.session, "session object must be present");

  const auditAfter = readAuditLog();
  const newEvents = auditAfter.slice(auditBefore.length);
  const revokedEvent = newEvents.find(e => e.event_type === "session.revoked");
  assert.ok(revokedEvent, `expected session.revoked audit event; new events: ${JSON.stringify(newEvents)}`);
});

test("revoke unauthorized denied when viewer role and ARIA_AUTHZ_ENFORCE=1", async () => {
  // Seed a session for viewer tenant to attempt revocation.
  const listRes = await request({
    url: "/api/aria/sessions",
    headers: OWNER_HEADERS,
  });
  assert.equal(listRes.statusCode, 200);
  const { sessions } = listRes.json();
  const sessionId = sessions[0]?.session_id || "sess-placeholder";

  const auditBefore = readAuditLog();

  const prev = process.env.ARIA_AUTHZ_ENFORCE;
  process.env.ARIA_AUTHZ_ENFORCE = "1";
  try {
    const res = await request({
      method: "POST",
      url: `/api/aria/sessions/${sessionId}/revoke`,
      body: { reason: "viewer attempting revoke" },
      headers: VIEWER_HEADERS,
    });
    assert.ok(
      res.statusCode === 401 || res.statusCode === 403,
      `expected 401 or 403, got ${res.statusCode}`,
    );
  } finally {
    if (prev === undefined) delete process.env.ARIA_AUTHZ_ENFORCE;
    else process.env.ARIA_AUTHZ_ENFORCE = prev;
  }

  const auditAfter = readAuditLog();
  const newEvents = auditAfter.slice(auditBefore.length);
  const deniedEvent = newEvents.find(
    e => e.event_type === "authz.role_denied" || e.event_type === "session.revoke.denied",
  );
  assert.ok(
    deniedEvent,
    `expected a denial audit event; new events: ${JSON.stringify(newEvents)}`,
  );
});

test("revoke unknown session returns 404 with SESSION_NOT_FOUND", async () => {
  const res = await request({
    method: "POST",
    url: "/api/aria/sessions/nonexistent-id-xyz/revoke",
    body: { reason: "looking for ghost session" },
    headers: OWNER_HEADERS,
  });
  assert.equal(res.statusCode, 404, `expected 404, got ${res.statusCode}: ${res.payload}`);
  const body = res.json();
  assert.equal(body.code, "SESSION_NOT_FOUND");
});

test("revoke missing reason returns 400", async () => {
  // Get a real session ID first.
  const listRes = await request({
    url: "/api/aria/sessions",
    headers: OWNER_HEADERS,
  });
  assert.equal(listRes.statusCode, 200);
  const { sessions } = listRes.json();
  const sessionId = sessions[0]?.session_id || "sess-placeholder";

  const res = await request({
    method: "POST",
    url: `/api/aria/sessions/${sessionId}/revoke`,
    body: { reason: "" },
    headers: OWNER_HEADERS,
  });
  assert.equal(res.statusCode, 400, `expected 400, got ${res.statusCode}: ${res.payload}`);
  const body = res.json();
  assert.ok(
    body.error || body.code,
    "response must include an error or code field about reason",
  );
  // Verify the code explicitly if present
  if (body.code) {
    assert.equal(body.code, "REVOKE_REASON_REQUIRED");
  }
});
