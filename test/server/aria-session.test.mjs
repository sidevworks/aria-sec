// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { EventEmitter } from "node:events";
import test from "node:test";
import { issueSessionToken, validateSessionToken, sessionEndpointEnabled } from "../../server/ariaSession.mjs";
import { handleAriaRequest } from "../../server/index.mjs";

process.env.ARIA_AI_SPM_DISABLE_GH_AUTO = "1";
process.env.ARIA_SESSION_SECRET = "test-secret-aria-session-2026";

// ── HTTP helpers ────────────────────────────────────────────────────────────

function createReq({ method = "POST", url = "/", body, headers = {} } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = { "content-type": "application/json", ...headers };
  req.socket = { remoteAddress: "127.0.0.1" };
  req[Symbol.asyncIterator] = async function* () {
    if (body !== undefined) yield Buffer.from(JSON.stringify(body));
  };
  return req;
}

function createRes() {
  return {
    statusCode: 0,
    headers: {},
    payload: "",
    setHeader(name, value) { this.headers[name] = value; },
    writeHead(statusCode, headers) { this.statusCode = statusCode; if (headers) Object.assign(this.headers, headers); },
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

// ── ariaSession module unit tests ───────────────────────────────────────────

test("sessionEndpointEnabled returns true when ARIA_SESSION_SECRET is set", () => {
  assert.equal(sessionEndpointEnabled(), true);
});

test("issueSessionToken returns a valid token with expected fields", async () => {
  const result = await issueSessionToken({ tenant_id: "t-1", user_id: "u-1", role: "admin" });
  assert.ok(result.session_token, "session_token present");
  assert.equal(result.tenant_id, "t-1");
  assert.equal(result.user_id,   "u-1");
  assert.equal(result.role,      "admin");
  assert.ok(typeof result.expires_at === "string", "expires_at is ISO string");
  assert.ok(new Date(result.expires_at) > new Date(), "expires_at is in the future");
});

test("issueSessionToken normalizes unknown role to viewer", async () => {
  const result = await issueSessionToken({ tenant_id: "t", user_id: "u", role: "superadmin" });
  assert.equal(result.role, "viewer");
});

test("validateSessionToken accepts a freshly issued token", async () => {
  const { session_token } = await issueSessionToken({ tenant_id: "t-2", user_id: "u-2", role: "analyst" });
  const validation = await validateSessionToken(session_token);
  assert.equal(validation.ok, true);
  assert.equal(validation.identity.tenant_id, "t-2");
  assert.equal(validation.identity.role, "analyst");
});

test("validateSessionToken rejects a tampered token", async () => {
  const { session_token } = await issueSessionToken({ tenant_id: "t", user_id: "u", role: "admin" });
  const tampered = session_token.slice(0, -4) + "xxxx";
  const result = await validateSessionToken(tampered);
  assert.equal(result.ok, false);
  assert.ok(result.error, "error message present");
});

test("validateSessionToken rejects a missing/null token", async () => {
  assert.equal((await validateSessionToken(null)).ok, false);
  assert.equal((await validateSessionToken("")).ok, false);
  assert.equal((await validateSessionToken(undefined)).ok, false);
});

test("validateSessionToken rejects a malformed token", async () => {
  assert.equal((await validateSessionToken("notavalidtoken")).ok, false);
});

// ── POST /api/aria/session HTTP tests ──────────────────────────────────────

test("session endpoint returns 503 when ARIA_SESSION_SECRET is not set", async () => {
  const prev = process.env.ARIA_SESSION_SECRET;
  delete process.env.ARIA_SESSION_SECRET;
  try {
    const res = await request({ url: "/api/aria/session", body: { tenant_id: "t", user_id: "u", role: "admin" } });
    assert.equal(res.statusCode, 503);
  } finally {
    process.env.ARIA_SESSION_SECRET = prev;
  }
});

test("session endpoint issues a token from tenant/user/role fields (unauthenticated, analyst max)", async () => {
  // Without auth headers, bypass off: max issuable role is 'analyst'
  const res = await request({
    url: "/api/aria/session",
    body: { tenant_id: "acme-corp", user_id: "alice", role: "analyst" },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.session_token, "session_token returned");
  assert.equal(body.tenant_id, "acme-corp");
  assert.equal(body.role, "analyst");
  assert.ok(body.expires_at, "expires_at returned");
});

test("session endpoint blocks unauthenticated issuance of owner/admin role", async () => {
  // Without auth headers, bypass off: elevated roles must be denied.
  for (const role of ["admin", "owner"]) {
    const res = await request({
      url: "/api/aria/session",
      body: { tenant_id: "acme-corp", user_id: "alice", role },
    });
    assert.equal(res.statusCode, 403, `expected 403 for unauthenticated ${role} issuance`);
  }
});

test("session endpoint allows owner to issue owner token when auth headers present", async () => {
  const prev = process.env.ARIA_AUTHZ_ALLOW_LOCAL_BYPASS;
  delete process.env.ARIA_AUTHZ_ALLOW_LOCAL_BYPASS;
  try {
    const res = await request({
      url: "/api/aria/session",
      body: { tenant_id: "t", user_id: "u", role: "owner" },
      headers: {
        "x-tenant-id": "t",
        "x-user-id":   "u",
        "x-role":      "owner",
      },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().role, "owner");
  } finally {
    if (prev !== undefined) process.env.ARIA_AUTHZ_ALLOW_LOCAL_BYPASS = prev;
  }
});

test("session endpoint prevents role escalation when auth headers present", async () => {
  // Caller is analyst; requesting admin should be denied.
  const res = await request({
    url: "/api/aria/session",
    body: { tenant_id: "t", user_id: "u", role: "admin" },
    headers: {
      "x-tenant-id": "t",
      "x-user-id":   "u",
      "x-role":      "analyst",
    },
  });
  assert.equal(res.statusCode, 403);
});

test("session endpoint allows bypass mode to issue any role (local dev)", async () => {
  process.env.ARIA_AUTHZ_ALLOW_LOCAL_BYPASS = "true";
  try {
    const res = await request({
      url: "/api/aria/session",
      body: { tenant_id: "t", user_id: "u", role: "owner" },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().role, "owner");
  } finally {
    delete process.env.ARIA_AUTHZ_ALLOW_LOCAL_BYPASS;
  }
});

test("session endpoint exchanges a valid token for identity", async () => {
  const { session_token } = await issueSessionToken({ tenant_id: "t-exchange", user_id: "u-x", role: "viewer" });
  const res = await request({
    url: "/api/aria/session",
    body: { token: session_token },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.tenant_id, "t-exchange");
  assert.equal(body.role, "viewer");
});

test("session endpoint returns 401 for invalid token", async () => {
  const res = await request({
    url: "/api/aria/session",
    body: { token: "invalid.token.here" },
  });
  assert.equal(res.statusCode, 401);
});

test("session endpoint returns 400 when required issue fields are missing", async () => {
  const res = await request({
    url: "/api/aria/session",
    body: { tenant_id: "t" },  // missing user_id and role
  });
  assert.equal(res.statusCode, 400);
});

test("session endpoint is not gated by authz middleware (viewer role works unauthenticated)", async () => {
  // The session endpoint is exempt from the authz middleware gate.
  // A request for a low role (viewer) should return 200 without auth headers.
  const res = await request({
    url: "/api/aria/session",
    body: { tenant_id: "t", user_id: "u", role: "viewer" },
  });
  assert.equal(res.statusCode, 200, "viewer token issuable without auth headers");
  assert.notEqual(res.statusCode, 401, "session must not be authz-gated");
});

test("sessions endpoint lists active tenant sessions for authorized caller", async () => {
  const issuedA = await request({
    url: "/api/aria/session",
    body: { tenant_id: "tenant-list", user_id: "alice", role: "analyst" },
    headers: { "x-tenant-id": "tenant-list", "x-user-id": "owner-a", "x-role": "owner" },
  });
  assert.equal(issuedA.statusCode, 200);

  const issuedB = await request({
    url: "/api/aria/session",
    body: { tenant_id: "tenant-other", user_id: "bob", role: "viewer" },
    headers: { "x-tenant-id": "tenant-other", "x-user-id": "owner-b", "x-role": "owner" },
  });
  assert.equal(issuedB.statusCode, 200);

  const listed = await request({
    method: "GET",
    url: "/api/aria/sessions",
    headers: { "x-tenant-id": "tenant-list", "x-user-id": "admin-list", "x-role": "admin" },
  });
  assert.equal(listed.statusCode, 200);
  const body = listed.json();
  assert.ok(Array.isArray(body.sessions));
  assert.ok(body.sessions.some((s) => s.user === "alice"), "same-tenant session is visible");
  assert.ok(!body.sessions.some((s) => s.user === "bob"), "cross-tenant session is not visible");
  const sample = body.sessions.find((s) => s.user === "alice");
  assert.ok(sample.id);
  assert.ok(sample.issued_at);
  assert.ok(sample.expires_at);
  assert.ok(sample.last_seen);
});

test("session revoke endpoint revokes token and blocks exchange", async () => {
  const issued = await request({
    url: "/api/aria/session",
    body: { tenant_id: "tenant-revoke", user_id: "rev-user", role: "viewer" },
    headers: { "x-tenant-id": "tenant-revoke", "x-user-id": "owner-revoke", "x-role": "owner" },
  });
  assert.equal(issued.statusCode, 200);
  const token = issued.json().session_token;

  const list = await request({
    method: "GET",
    url: "/api/aria/sessions",
    headers: { "x-tenant-id": "tenant-revoke", "x-user-id": "admin-revoke", "x-role": "admin" },
  });
  assert.equal(list.statusCode, 200);
  const target = list.json().sessions.find((s) => s.user === "rev-user");
  assert.ok(target?.id, "session id is present for revoke");

  const revoke = await request({
    url: `/api/aria/sessions/${encodeURIComponent(target.id)}/revoke`,
    body: { reason: "security incident response" },
    headers: { "x-tenant-id": "tenant-revoke", "x-user-id": "admin-revoke", "x-role": "admin" },
  });
  assert.equal(revoke.statusCode, 200);
  assert.equal(revoke.json().ok, true);

  const exchange = await request({
    url: "/api/aria/session",
    body: { token },
  });
  assert.equal(exchange.statusCode, 401);
  assert.match(exchange.json().error, /revoked/i);
});

test("session revoke endpoint requires auth context (401 when unauthenticated)", async () => {
  const res = await request({
    url: "/api/aria/sessions/sid-unknown/revoke",
    body: { reason: "test revoke" },
  });
  assert.equal(res.statusCode, 401);
});

test("session revoke endpoint denies non-admin roles (403)", async () => {
  const issued = await request({
    url: "/api/aria/session",
    body: { tenant_id: "tenant-role", user_id: "role-user", role: "viewer" },
    headers: { "x-tenant-id": "tenant-role", "x-user-id": "owner-role", "x-role": "owner" },
  });
  assert.equal(issued.statusCode, 200);

  const listed = await request({
    method: "GET",
    url: "/api/aria/sessions",
    headers: { "x-tenant-id": "tenant-role", "x-user-id": "owner-role", "x-role": "owner" },
  });
  const sid = listed.json().sessions.find((s) => s.user === "role-user")?.id;
  assert.ok(sid);

  const res = await request({
    url: `/api/aria/sessions/${encodeURIComponent(sid)}/revoke`,
    body: { reason: "viewer not allowed" },
    headers: { "x-tenant-id": "tenant-role", "x-user-id": "viewer-role", "x-role": "viewer" },
  });
  assert.equal(res.statusCode, 403);
});

test("session revoke endpoint returns 404 for unknown session id", async () => {
  const res = await request({
    url: "/api/aria/sessions/sid-does-not-exist/revoke",
    body: { reason: "cleanup" },
    headers: { "x-tenant-id": "tenant-role", "x-user-id": "admin-role", "x-role": "admin" },
  });
  assert.equal(res.statusCode, 404);
});

test("session revoke endpoint requires reason", async () => {
  const issued = await request({
    url: "/api/aria/session",
    body: { tenant_id: "tenant-reason", user_id: "reason-user", role: "viewer" },
    headers: { "x-tenant-id": "tenant-reason", "x-user-id": "owner-reason", "x-role": "owner" },
  });
  assert.equal(issued.statusCode, 200);

  const listed = await request({
    method: "GET",
    url: "/api/aria/sessions",
    headers: { "x-tenant-id": "tenant-reason", "x-user-id": "admin-reason", "x-role": "admin" },
  });
  const sid = listed.json().sessions.find((s) => s.user === "reason-user")?.id;
  assert.ok(sid);

  const res = await request({
    url: `/api/aria/sessions/${encodeURIComponent(sid)}/revoke`,
    body: {},
    headers: { "x-tenant-id": "tenant-reason", "x-user-id": "admin-reason", "x-role": "admin" },
  });
  assert.equal(res.statusCode, 400);
});

// ── Agent 1A: new unit tests ────────────────────────────────────────────────

test("valid token accepted — issue then validate returns ok=true", async () => {
  const { session_token } = await issueSessionToken({ tenant_id: "t-valid", user_id: "u-valid", role: "admin" });
  const result = await validateSessionToken(session_token);
  assert.equal(result.ok, true);
  assert.equal(result.identity.tenant_id, "t-valid");
  assert.equal(result.identity.user_id,   "u-valid");
  assert.equal(result.identity.role,      "admin");
});

test("expired token rejected — manually crafted past-exp token fails with 'expired'", async () => {
  // Craft a valid-signature token whose exp is already in the past.
  const secret = process.env.ARIA_SESSION_SECRET;
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({ sid: "test-expired-sid", tenant_id: "t-exp", user_id: "u-exp", role: "viewer", iat: nowSec - 7200, exp: nowSec - 3600 });
  const payloadB64 = Buffer.from(payload).toString("base64url");
  const sig = Buffer.from(createHmac("sha256", secret).update(payloadB64).digest()).toString("base64url");
  const expiredToken = `${payloadB64}.${sig}`;
  const result = await validateSessionToken(expiredToken);
  assert.equal(result.ok, false);
  assert.match(result.error, /expired/i);
});

test("tampered token rejected — flipping a byte in the signature fails", async () => {
  const { session_token } = await issueSessionToken({ tenant_id: "t-tamp", user_id: "u-tamp", role: "analyst" });
  const dot = session_token.lastIndexOf(".");
  const sig = session_token.slice(dot + 1);
  // Flip the first char of the signature to a different base64url char.
  const tamperedSig = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
  const tampered = session_token.slice(0, dot + 1) + tamperedSig;
  const result = await validateSessionToken(tampered);
  assert.equal(result.ok, false);
  assert.ok(result.error, "error message present");
});

test("header fallback works — auth headers accepted with local bypass enabled", async () => {
  // Verifies the header-based identity path: with ARIA_AUTHZ_ALLOW_LOCAL_BYPASS=1
  // the server trusts x-tenant-id / x-user-id / x-role headers and issues a session token.
  // Uses a distinct x-forwarded-for IP to avoid the shared rate-limit bucket.
  const prevBypass = process.env.ARIA_AUTHZ_ALLOW_LOCAL_BYPASS;
  process.env.ARIA_AUTHZ_ALLOW_LOCAL_BYPASS = "1";
  try {
    const res = await request({
      url: "/api/aria/session",
      body: { tenant_id: "t-fallback", user_id: "u-fallback", role: "admin" },
      headers: {
        "x-tenant-id": "t-fallback",
        "x-user-id": "u-fallback",
        "x-role": "admin",
        "x-forwarded-for": "10.0.0.1",
      },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(body.session_token, "session_token returned via header fallback");
    assert.equal(body.tenant_id, "t-fallback");
    assert.equal(body.role, "admin");
  } finally {
    if (prevBypass !== undefined) process.env.ARIA_AUTHZ_ALLOW_LOCAL_BYPASS = prevBypass;
    else delete process.env.ARIA_AUTHZ_ALLOW_LOCAL_BYPASS;
  }
});
