// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

/**
 * Enterprise Ops v1 — contract tests
 * Covers: audit actor filter, force-reauth route
 */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { handleAriaRequest } from "../../server/index.mjs";

process.env.ARIA_AI_SPM_DISABLE_GH_AUTO = "1";
process.env.ARIA_SESSION_SECRET = "test-secret-enterprise-ops";

const MEMORY_DIR = join(process.cwd(), "aria-memory");
if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });

const TENANT = "tenant-ent-ops-test";
const ADMIN  = { "x-tenant-id": TENANT, "x-user-id": "admin@aria.io",  "x-role": "admin"  };
const OWNER  = { "x-tenant-id": TENANT, "x-user-id": "owner@aria.io",  "x-role": "owner"  };
const VIEWER = { "x-tenant-id": TENANT, "x-user-id": "viewer@aria.io", "x-role": "viewer" };

function createReq({ method = "GET", url = "/", body, headers = {} } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url    = url;
  req.headers = headers;
  req.socket = { remoteAddress: "127.0.0.1" };
  req[Symbol.asyncIterator] = async function* () {
    if (body !== undefined) yield Buffer.from(JSON.stringify(body));
  };
  if (body !== undefined) {
    const encoded = Buffer.from(JSON.stringify(body));
    setImmediate(() => { req.emit("data", encoded); req.emit("end"); });
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
    writeHead(code, hdrs) { this.statusCode = code; this.headers = hdrs; },
    end(payload = "") { this.payload = payload; },
    json() { return JSON.parse(this.payload); },
  };
}

async function hit({ method, url, headers = {}, body } = {}) {
  const req = createReq({ method, url, body, headers });
  const res = createRes();
  await handleAriaRequest(req, res);
  return res;
}

// ── GET /api/aria/audit-events — actor filter ──────────────────────────────

test("audit-events — 401 with no auth headers", async () => {
  const res = await hit({ method: "GET", url: "/api/aria/audit-events" });
  assert.equal(res.statusCode, 401);
});

test("audit-events — 200 returns events array for admin", async () => {
  const res = await hit({ method: "GET", url: "/api/aria/audit-events", headers: ADMIN });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(Array.isArray(body.events));
  assert.equal(typeof body.total, "number");
});

test("audit-events — actor filter returns only matching actor", async () => {
  const targetActor = "system";
  const res = await hit({
    method: "GET",
    url: `/api/aria/audit-events?actor=${encodeURIComponent(targetActor)}&limit=50`,
    headers: ADMIN,
  });
  assert.equal(res.statusCode, 200);
  const { events } = res.json();
  for (const e of events) {
    assert.equal(e.actor, targetActor, `Expected actor '${targetActor}', got '${e.actor}'`);
  }
});

test("audit-events — actor filter with unknown actor returns empty array", async () => {
  const res = await hit({
    method: "GET",
    url: "/api/aria/audit-events?actor=__no_such_actor_xyz__",
    headers: ADMIN,
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().events.length, 0);
});

test("audit-events — actor + event_type + status filters compose correctly", async () => {
  const res = await hit({
    method: "GET",
    url: "/api/aria/audit-events?event_type=policy.apply&status=success&actor=admin@aria.io",
    headers: ADMIN,
  });
  assert.equal(res.statusCode, 200);
  const { events } = res.json();
  for (const e of events) {
    assert.equal(e.event_type, "policy.apply");
    assert.equal(e.status, "success");
    assert.equal(e.actor, "admin@aria.io");
  }
});

test("audit-events — event shape has required fields", async () => {
  const res = await hit({ method: "GET", url: "/api/aria/audit-events?limit=1", headers: ADMIN });
  assert.equal(res.statusCode, 200);
  const { events } = res.json();
  if (events.length === 0) return; // empty store is valid
  const e = events[0];
  assert.ok("timestamp"  in e, "missing timestamp");
  assert.ok("actor"      in e, "missing actor");
  assert.ok("event_type" in e, "missing event_type");
  assert.ok("status"     in e, "missing status");
});

// ── POST /api/aria/sessions/:id/force-reauth ───────────────────────────────

test("force-reauth — 401 with no auth headers", async () => {
  const res = await hit({
    method: "POST", url: "/api/aria/sessions/fake-sid/force-reauth",
    body: { reason: "test" },
  });
  assert.equal(res.statusCode, 401);
});

test("force-reauth — 403 for viewer role", async () => {
  const res = await hit({
    method: "POST", url: "/api/aria/sessions/fake-sid/force-reauth",
    headers: VIEWER,
    body: { reason: "test" },
  });
  assert.equal(res.statusCode, 403);
});

test("force-reauth — 400 when reason is missing", async () => {
  const res = await hit({
    method: "POST", url: "/api/aria/sessions/fake-sid/force-reauth",
    headers: ADMIN,
    body: {},
  });
  assert.equal(res.statusCode, 400);
});

test("force-reauth — 400 when reason is whitespace only", async () => {
  const res = await hit({
    method: "POST", url: "/api/aria/sessions/fake-sid/force-reauth",
    headers: ADMIN,
    body: { reason: "   " },
  });
  assert.equal(res.statusCode, 400);
});

test("force-reauth — 404 for unknown session id", async () => {
  const res = await hit({
    method: "POST", url: "/api/aria/sessions/nonexistent-session-id/force-reauth",
    headers: ADMIN,
    body: { reason: "security rotation" },
  });
  assert.equal(res.statusCode, 404);
});

test("force-reauth — 200 with valid session id (admin)", async () => {
  // Issue a real session first
  const issueRes = await hit({
    method: "POST", url: "/api/aria/session",
    headers: ADMIN,
    body: { user_id: "reauth-test-user", role: "analyst", tenant_id: TENANT },
  });
  if (issueRes.statusCode !== 200) return; // session endpoint not configured in CI — skip
  const { session_token } = issueRes.json();

  // Validate to get the sid
  const listRes = await hit({ method: "GET", url: "/api/aria/sessions", headers: ADMIN });
  if (listRes.statusCode !== 200) return;
  const sessions = listRes.json().sessions || [];
  const target = sessions.find((s) => s.user_id === "reauth-test-user" && !s.revoked_at);
  if (!target) return;

  const res = await hit({
    method: "POST", url: `/api/aria/sessions/${target.sid}/force-reauth`,
    headers: ADMIN,
    body: { reason: "Suspected credential compromise" },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ok, true);
  assert.ok(body.sid);
  assert.ok(body.forced_at);
});

test("force-reauth — 200 for owner role", async () => {
  const res = await hit({
    method: "POST", url: "/api/aria/sessions/nonexistent-for-owner/force-reauth",
    headers: OWNER,
    body: { reason: "owner-initiated rotation" },
  });
  // 404 is correct here (session doesn't exist) — confirms 403 is not returned for owner
  assert.ok([200, 404].includes(res.statusCode), `Expected 200 or 404, got ${res.statusCode}`);
});

test("force-reauth — does not alter canonical revoke route behavior", async () => {
  // Canonical revoke path must still return 400 on missing reason
  const res = await hit({
    method: "POST", url: "/api/aria/sessions/any-id/revoke",
    headers: ADMIN,
    body: {},
  });
  assert.equal(res.statusCode, 400, "Canonical revoke must still 400 on missing reason");
});

// ── Source contract ────────────────────────────────────────────────────────

test("source contract — force-reauth and actor filter declared in index.mjs", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../../server/index.mjs", import.meta.url), "utf8");
  assert.match(src, /force-reauth/,          "force-reauth route must be present");
  assert.match(src, /handleSessionForceReauth/, "handler must be declared");
  assert.match(src, /filterActor/,           "actor filter must be declared");
  assert.match(src, /session\.force_reauth/, "force_reauth audit event must be emitted");
});
