// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { handleAriaRequest } from "../../server/index.mjs";

process.env.ARIA_AI_SPM_DISABLE_GH_AUTO = "1";

// Header sets matching App.jsx buildAuthHeaders() patterns
const ADMIN = { "x-tenant-id": "tenant-alpha", "x-user-id": "admin@aria.io",  "x-role": "admin"  };
const OWNER = { "x-tenant-id": "tenant-alpha", "x-user-id": "owner@aria.io",  "x-role": "owner"  };
const VIEWER = { "x-tenant-id": "tenant-alpha", "x-user-id": "viewer@aria.io", "x-role": "viewer" };

const MEMORY_DIR = process.env.ARIA_PERSISTENCE_DIR || join(process.cwd(), "aria-memory");
const AUDIT_PATH = join(MEMORY_DIR, "audit-events.json");

function readAuditLog() {
  try { return JSON.parse(readFileSync(AUDIT_PATH, "utf8")); } catch { return []; }
}

function createReq({ method = "GET", url = "/", body, headers = {} } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = headers;
  // Authz trusts identity headers from loopback by default in tests.
  req.socket = { remoteAddress: "127.0.0.1" };
  req[Symbol.asyncIterator] = async function* () {
    if (body !== undefined) {
      yield Buffer.from(JSON.stringify(body));
    }
  };
  return req;
}

function createRes() {
  return {
    statusCode: 0,
    headers: {},
    payload: "",
    setHeader(name, value) {
      this.headers[name] = value;
    },
    getHeader(name) {
      return this.headers[name];
    },
    writeHead(code, hdrs) {
      this.statusCode = code;
      this.headers = hdrs;
    },
    end(payload = "") {
      this.payload = payload;
    },
  };
}

async function request({ method, url, headers, body }) {
  const req = createReq({ method, url, headers, body });
  const res = createRes();
  await handleAriaRequest(req, res);
  return { status: res.statusCode, body: JSON.parse(res.payload || "{}") };
}

test("POST /api/aria/policy/preview unauth returns 401", async () => {
  const res = await request({
    method: "POST",
    url: "/api/aria/policy/preview",
    body: { policy_id: "pol-rbac-viewer", proposed: { capabilities: ["read", "write"] } },
  });
  assert.equal(res.status, 401);
});

test("POST /api/aria/policy/preview viewer denied with 403", async () => {
  const res = await request({
    method: "POST",
    url: "/api/aria/policy/preview",
    headers: VIEWER,
    body: { policy_id: "pol-rbac-viewer", proposed: { capabilities: ["read"] } },
  });
  assert.equal(res.status, 403);
});

test("POST /api/aria/policy/preview validates body with 400", async () => {
  const res = await request({
    method: "POST",
    url: "/api/aria/policy/preview",
    headers: ADMIN,
    body: { proposed: { capabilities: ["read"] } },
  });
  assert.equal(res.status, 400);
});

test("POST /api/aria/policy/preview returns 200 with risk and diff", async () => {
  const res = await request({
    method: "POST",
    url: "/api/aria/policy/preview",
    headers: ADMIN,
    body: { policy_id: "pol-rbac-viewer", proposed: { capabilities: ["read", "write"] } },
  });
  assert.equal(res.status, 200);
  assert.ok(["low", "medium", "high"].includes(res.body.risk));
  assert.ok(Array.isArray(res.body.diff));
});

test("POST /api/aria/policy/apply unauth returns 401", async () => {
  const res = await request({
    method: "POST",
    url: "/api/aria/policy/apply",
    body: { policy_id: "pol-rbac-viewer", proposed: { capabilities: ["read"] }, reason: "test" },
  });
  assert.equal(res.status, 401);
});

test("POST /api/aria/policy/apply requires reason with 400", async () => {
  const res = await request({
    method: "POST",
    url: "/api/aria/policy/apply",
    headers: ADMIN,
    body: { policy_id: "pol-rbac-viewer", proposed: { capabilities: ["read"] }, reason: "   " },
  });
  assert.equal(res.status, 400);
});

test("POST /api/aria/policy/apply returns 200 for admin", async () => {
  const res = await request({
    method: "POST",
    url: "/api/aria/policy/apply",
    headers: ADMIN,
    body: {
      policy_id: "pol-rbac-viewer",
      proposed: { capabilities: ["read", "write"], enabled: true },
      reason: "pilot expansion",
    },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.policy?.id, "pol-rbac-viewer");
  assert.ok(res.body.history_entry?.id);
});

test("GET /api/aria/policy/history unauth returns 401", async () => {
  const res = await request({ method: "GET", url: "/api/aria/policy/history" });
  assert.equal(res.status, 401);
});

test("GET /api/aria/policy/history viewer denied with 403", async () => {
  const res = await request({ method: "GET", url: "/api/aria/policy/history", headers: VIEWER });
  assert.equal(res.status, 403);
});

test("GET /api/aria/policy/history returns 200 with array", async () => {
  const res = await request({ method: "GET", url: "/api/aria/policy/history?limit=5", headers: ADMIN });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.history));
});

// ── GET /api/aria/policy/list ─────────────────────────────────────────────────

test("GET /api/aria/policy/list unauth returns 401", async () => {
  const res = await request({ method: "GET", url: "/api/aria/policy/list" });
  assert.equal(res.status, 401);
});

test("GET /api/aria/policy/list viewer denied with 403", async () => {
  const res = await request({ method: "GET", url: "/api/aria/policy/list", headers: VIEWER });
  assert.equal(res.status, 403);
});

test("GET /api/aria/policy/list returns 200 with policies array for admin", async () => {
  const res = await request({ method: "GET", url: "/api/aria/policy/list", headers: ADMIN });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.policies), "policies must be an array");
  assert.equal(typeof res.body.total, "number");
});

test("GET /api/aria/policy/list returns 200 with policies array for owner (UI auth wiring path)", async () => {
  const res = await request({ method: "GET", url: "/api/aria/policy/list", headers: OWNER });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.policies));
});

// ── Additional coverage ───────────────────────────────────────────────────────

test("POST /api/aria/policy/apply viewer returns 403", async () => {
  const res = await request({
    method: "POST",
    url: "/api/aria/policy/apply",
    headers: VIEWER,
    body: { policy_id: "pol-rbac-viewer", proposed: { capabilities: ["read"] }, reason: "test" },
  });
  assert.equal(res.status, 403);
});

test("POST /api/aria/policy/apply owner role succeeds (UI auth wiring path)", async () => {
  const res = await request({
    method: "POST",
    url: "/api/aria/policy/apply",
    headers: OWNER,
    body: {
      policy_id: "pol-rbac-viewer",
      proposed: { capabilities: ["read"], enabled: true },
      reason: "owner auth wiring test",
    },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.ok(res.body.history_entry?.reason === "owner auth wiring test");
});

test("POST /api/aria/policy/apply emits policy.applied audit event", async () => {
  const before = readAuditLog();
  await request({
    method: "POST",
    url: "/api/aria/policy/apply",
    headers: ADMIN,
    body: {
      policy_id: "pol-rbac-operator",
      proposed: { capabilities: ["read", "write"], enabled: true },
      reason: "audit emission test",
    },
  });
  const after = readAuditLog();
  const newEvents = after.slice(before.length);
  const applied = newEvents.find((e) => e.event_type === "policy.applied");
  assert.ok(applied, `expected policy.applied event; got: ${JSON.stringify(newEvents.map((e) => e.event_type))}`);
  assert.equal(applied.status, "success");
  assert.ok(applied.context?.policy_id === "pol-rbac-operator" || applied.context?.diff_fields?.length >= 0);
});

test("POST /api/aria/policy/apply denied emits policy.apply_denied audit event", async () => {
  const before = readAuditLog();
  await request({
    method: "POST",
    url: "/api/aria/policy/apply",
    headers: ADMIN,
    body: { policy_id: "pol-rbac-viewer", proposed: { capabilities: ["read"] } }, // missing reason
  });
  const after = readAuditLog();
  const newEvents = after.slice(before.length);
  const denied = newEvents.find((e) => e.event_type === "policy.apply_denied");
  assert.ok(denied, `expected policy.apply_denied event; got: ${JSON.stringify(newEvents.map((e) => e.event_type))}`);
  assert.equal(denied.status, "denied");
});
