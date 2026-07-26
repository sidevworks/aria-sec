// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

/**
 * Connector AuthZ Tests
 * Verifies that /api/connectors/* routes are now protected by the authz middleware.
 * - GET (status) routes require any authenticated role (viewer+)
 * - POST (connect/disconnect/token) routes require admin or owner
 */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { handleAriaRequest } from "../../server/index.mjs";

process.env.ARIA_AI_SPM_DISABLE_GH_AUTO = "1";
// Ensure bypass is OFF so authz is enforced.
delete process.env.ARIA_AUTHZ_ALLOW_LOCAL_BYPASS;

// ── HTTP helpers ─────────────────────────────────────────────────────────────

function createReq({ method = "GET", url = "/", body, headers = {} } = {}) {
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
    writeHead(statusCode, headers) { this.statusCode = statusCode; if (headers) Object.assign(this.headers, headers); },
    setHeader(name, value) { this.headers[name] = value; },
    getHeader(name) { return this.headers[name]; },
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

const OWNER_HEADERS  = { "x-tenant-id": "t1", "x-user-id": "u1", "x-role": "owner"   };
const ADMIN_HEADERS  = { "x-tenant-id": "t1", "x-user-id": "u1", "x-role": "admin"   };
const ANALYST_HEADERS = { "x-tenant-id": "t1", "x-user-id": "u1", "x-role": "analyst" };
const VIEWER_HEADERS = { "x-tenant-id": "t1", "x-user-id": "u1", "x-role": "viewer"  };

// ── Unauthenticated access must be denied ────────────────────────────────────

test("GET /api/connectors/aws/status returns 401 without auth headers", async () => {
  const res = await request({ method: "GET", url: "/api/connectors/aws/status" });
  assert.equal(res.statusCode, 401);
});

test("GET /api/connectors/github/status returns 401 without auth headers", async () => {
  const res = await request({ method: "GET", url: "/api/connectors/github/status" });
  assert.equal(res.statusCode, 401);
});

test("POST /api/connectors/aws/connect returns 401 without auth headers", async () => {
  const res = await request({
    method: "POST",
    url: "/api/connectors/aws/connect",
    body: { accessKeyId: "AKIA123", secretAccessKey: "secret", region: "us-east-1" },
  });
  assert.equal(res.statusCode, 401);
});

test("POST /api/connectors/aws/disconnect returns 401 without auth headers", async () => {
  const res = await request({ method: "POST", url: "/api/connectors/aws/disconnect" });
  assert.equal(res.statusCode, 401);
});

test("POST /api/connectors/github/token returns 401 without auth headers", async () => {
  const res = await request({
    method: "POST",
    url: "/api/connectors/github/token",
    body: { token: "github_pat_test", repositories: [] },
  });
  assert.equal(res.statusCode, 401);
});

test("POST /api/connectors/github/disconnect returns 401 without auth headers", async () => {
  const res = await request({ method: "POST", url: "/api/connectors/github/disconnect" });
  assert.equal(res.statusCode, 401);
});

// ── Viewer can read status, not write ────────────────────────────────────────

test("GET /api/connectors/aws/status succeeds for viewer role", async () => {
  const res = await request({
    method: "GET",
    url: "/api/connectors/aws/status",
    headers: VIEWER_HEADERS,
  });
  // 200 or 404 (not configured) are both acceptable; 401/403 are not.
  assert.ok(res.statusCode < 400, `Expected <400 but got ${res.statusCode}`);
});

test("GET /api/connectors/github/status succeeds for analyst role", async () => {
  const res = await request({
    method: "GET",
    url: "/api/connectors/github/status",
    headers: ANALYST_HEADERS,
  });
  assert.ok(res.statusCode < 400, `Expected <400 but got ${res.statusCode}`);
});

test("POST /api/connectors/aws/connect returns 403 for analyst role (write denied)", async () => {
  const res = await request({
    method: "POST",
    url: "/api/connectors/aws/connect",
    body: { accessKeyId: "AKIA123", secretAccessKey: "secret", region: "us-east-1" },
    headers: ANALYST_HEADERS,
  });
  assert.equal(res.statusCode, 403);
});

test("POST /api/connectors/aws/connect returns 403 for viewer role (write denied)", async () => {
  const res = await request({
    method: "POST",
    url: "/api/connectors/aws/connect",
    body: { accessKeyId: "AKIA123", secretAccessKey: "secret", region: "us-east-1" },
    headers: VIEWER_HEADERS,
  });
  assert.equal(res.statusCode, 403);
});

test("POST /api/connectors/github/token returns 403 for viewer role (write denied)", async () => {
  const res = await request({
    method: "POST",
    url: "/api/connectors/github/token",
    body: { token: "github_pat_test", repositories: [] },
    headers: VIEWER_HEADERS,
  });
  assert.equal(res.statusCode, 403);
});

// ── Admin/owner can write connectors ─────────────────────────────────────────

test("POST /api/connectors/aws/disconnect succeeds for admin role", async () => {
  const res = await request({
    method: "POST",
    url: "/api/connectors/aws/disconnect",
    headers: ADMIN_HEADERS,
  });
  // 200 (disconnected or already disconnected) is the expected success response.
  assert.ok(res.statusCode < 400, `Expected <400 but got ${res.statusCode}`);
});

test("POST /api/connectors/github/disconnect succeeds for owner role", async () => {
  const res = await request({
    method: "POST",
    url: "/api/connectors/github/disconnect",
    headers: OWNER_HEADERS,
  });
  assert.ok(res.statusCode < 400, `Expected <400 but got ${res.statusCode}`);
});

test("privileged connector revoke action requires auth and emits denial feed reason", async () => {
  const unauth = await request({
    method: "POST",
    url: "/api/connectors/github/disconnect",
  });
  assert.equal(unauth.statusCode, 401);
  assert.match(String(unauth.json().error || ""), /Missing auth context/i);

  const viewerDenied = await request({
    method: "POST",
    url: "/api/connectors/github/disconnect",
    headers: { "x-tenant-id": "t1", "x-user-id": "viewer-revoke", "x-role": "viewer" },
  });
  assert.equal(viewerDenied.statusCode, 403);
  assert.match(String(viewerDenied.json().error || ""), /not permitted/i);

  const feed = await request({
    method: "GET",
    url: "/api/aria/audit-events?status=denied&event_type=authz.role_denied",
    headers: ADMIN_HEADERS,
  });
  assert.equal(feed.statusCode, 200);
  const events = feed.json().events || [];
  const revokeDenial = events.find((event) =>
    event.actor === "viewer-revoke" &&
    event.api_path === "/api/connectors/github/disconnect" &&
    /denied write on connectors/i.test(String(event.reason || ""))
  );
  assert.ok(revokeDenial, "expected revoke denial event with reason in filtered audit feed");
});
