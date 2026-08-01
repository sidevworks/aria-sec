// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { handleAriaRequest } from "../../server/index.mjs";

process.env.ARIA_AI_SPM_DISABLE_GH_AUTO = "1";

// Seed audit store with known events before tests run.
const MEMORY_DIR = process.env.ARIA_PERSISTENCE_DIR || join(process.cwd(), "aria-memory");
const AUDIT_LOG_PATH = join(MEMORY_DIR, "audit-events.json");

const TENANT_A = "tenant-alpha";
const TENANT_B = "tenant-beta";

const SEED_EVENTS = [
  {
    id: "AUD-1",
    timestamp: "2026-05-28T10:00:00.000Z",
    event_type: "authz.role_denied",
    status: "denied",
    actor: "user-a1",
    context: { tenant_id: TENANT_A, role: "viewer", api_path: "/api/aria/command", reason: "Role viewer denied write" },
  },
  {
    id: "AUD-2",
    timestamp: "2026-05-28T10:01:00.000Z",
    event_type: "authz.missing_context",
    status: "denied",
    actor: "unknown",
    context: { tenant_id: TENANT_A, role: null, api_path: "/api/aria/suggestions", reason: "Missing headers" },
  },
  {
    id: "AUD-3",
    timestamp: "2026-05-28T10:02:00.000Z",
    event_type: "authz.role_denied",
    status: "denied",
    actor: "user-b1",
    context: { tenant_id: TENANT_B, role: "viewer", api_path: "/api/aria/autonomy", reason: "Role viewer denied write" },
  },
];

if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });
writeFileSync(AUDIT_LOG_PATH, JSON.stringify(SEED_EVENTS, null, 2), "utf8");

function createReq({ method = "GET", url = "/", body, headers = {} } = {}) {
  const req = new EventEmitter();
  req.socket = { remoteAddress: "127.0.0.1" };
  req.method = method;
  req.url = url;
  req.headers = headers;
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
    writeHead(statusCode, headers) { this.statusCode = statusCode; this.headers = headers; },
    setHeader(name, value) { this.headers[name] = value; },
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

const AUTHED_ADMIN_A = {
  "x-tenant-id": TENANT_A,
  "x-user-id": "admin-a",
  "x-role": "admin",
};

const AUTHED_VIEWER_A = {
  "x-tenant-id": TENANT_A,
  "x-user-id": "viewer-a",
  "x-role": "viewer",
};

const AUTHED_ADMIN_B = {
  "x-tenant-id": TENANT_B,
  "x-user-id": "admin-b",
  "x-role": "admin",
};

test("authorized read role (admin) can access audit-events", async () => {
  const res = await request({ url: "/api/aria/audit-events", headers: AUTHED_ADMIN_A });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(Array.isArray(body.events), "events must be an array");
});

test("authorized viewer role can read audit-events (read-only path)", async () => {
  const res = await request({ url: "/api/aria/audit-events", headers: AUTHED_VIEWER_A });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(Array.isArray(body.events));
});

test("missing auth headers are denied (401)", async () => {
  const res = await request({ url: "/api/aria/audit-events" });
  assert.equal(res.statusCode, 401);
});

test("cross-tenant isolation: tenant-A only sees its own events", async () => {
  const res = await request({ url: "/api/aria/audit-events", headers: AUTHED_ADMIN_A });
  assert.equal(res.statusCode, 200);
  const { events } = res.json();
  for (const e of events) {
    if (e.api_path !== null) {
      // Events with a context.tenant_id must match TENANT_A or have no tenant
      // (we seeded AUD-1 and AUD-2 for TENANT_A, AUD-3 for TENANT_B)
    }
  }
  const ids = events.map((e) => e.actor);
  assert.ok(!ids.includes("user-b1"), "Tenant B actor must not appear in Tenant A results");
});

test("cross-tenant isolation: tenant-B only sees its own events", async () => {
  const res = await request({ url: "/api/aria/audit-events", headers: AUTHED_ADMIN_B });
  assert.equal(res.statusCode, 200);
  const { events } = res.json();
  const ids = events.map((e) => e.actor);
  assert.ok(!ids.includes("user-a1"), "Tenant A actor must not appear in Tenant B results");
  assert.ok(ids.includes("user-b1"), "Tenant B actor must appear");
});

test("limit param caps returned events", async () => {
  const res = await request({ url: "/api/aria/audit-events?limit=1", headers: AUTHED_ADMIN_A });
  assert.equal(res.statusCode, 200);
  const { events } = res.json();
  assert.ok(events.length <= 1, "limit=1 must return at most 1 event");
});

test("event_type filter works", async () => {
  const res = await request({
    url: "/api/aria/audit-events?event_type=authz.missing_context",
    headers: AUTHED_ADMIN_A,
  });
  assert.equal(res.statusCode, 200);
  const { events } = res.json();
  for (const e of events) {
    assert.equal(e.event_type, "authz.missing_context");
  }
});

test("status filter works", async () => {
  const res = await request({
    url: "/api/aria/audit-events?status=denied",
    headers: AUTHED_ADMIN_A,
  });
  assert.equal(res.statusCode, 200);
  const { events } = res.json();
  for (const e of events) {
    assert.equal(e.status, "denied");
  }
});

test("empty state: unknown filter returns empty events array gracefully", async () => {
  const res = await request({
    url: "/api/aria/audit-events?event_type=nonexistent.type",
    headers: AUTHED_ADMIN_A,
  });
  assert.equal(res.statusCode, 200);
  const { events } = res.json();
  assert.ok(Array.isArray(events));
  assert.equal(events.length, 0);
});

test("invalid limit param returns 400", async () => {
  const res = await request({ url: "/api/aria/audit-events?limit=abc", headers: AUTHED_ADMIN_A });
  assert.equal(res.statusCode, 400);
});

test("response shape has required fields on each event", async () => {
  const res = await request({ url: "/api/aria/audit-events", headers: AUTHED_ADMIN_A });
  assert.equal(res.statusCode, 200);
  const { events } = res.json();
  assert.ok(events.length > 0, "should have seeded events for tenant-A");
  for (const e of events) {
    assert.ok("timestamp" in e, "missing timestamp");
    assert.ok("actor" in e, "missing actor");
    assert.ok("event_type" in e, "missing event_type");
    assert.ok("api_path" in e, "missing api_path");
    assert.ok("reason" in e, "missing reason");
    assert.ok("status" in e, "missing status");
  }
});

// ── quota-status endpoint tests ────────────────────────────────────────────

test("quota-status returns bucket snapshot for authorized caller", async () => {
  const res = await request({
    url: "/api/aria/quota-status",
    headers: AUTHED_ADMIN_A,
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(Array.isArray(body.buckets), "buckets must be array");
  assert.ok(typeof body.snapshot_at === "string", "snapshot_at must be string");
  for (const b of body.buckets) {
    assert.ok("name" in b, "bucket missing name");
    assert.ok("status" in b, "bucket missing status");
    assert.ok(["ok", "warn", "limited"].includes(b.status), `unexpected status: ${b.status}`);
  }
});

test("quota-status is denied for missing auth headers", async () => {
  const res = await request({ url: "/api/aria/quota-status" });
  assert.equal(res.statusCode, 401);
});
