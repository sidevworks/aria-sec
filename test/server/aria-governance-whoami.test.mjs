// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import { writeFileSync, readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import test from "node:test";
import { logAuditEvent, pruneAuditEvents, redactAuditEvent, readAuditEvents, getAuditLogPath } from "../../server/auditLog.mjs";
import { handleAriaRequest } from "../../server/index.mjs";
import { issueSessionToken } from "../../server/ariaSession.mjs";

process.env.ARIA_AI_SPM_DISABLE_GH_AUTO = "1";

// ── HTTP request helpers ───────────────────────────────────────────────────

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

const TENANT_A = "tenant-alpha-gov";
const AUTHED_ADMIN_A = { "x-tenant-id": TENANT_A, "x-user-id": "admin-gov", "x-role": "admin" };

// ── audit governance: retention fields ────────────────────────────────────

test("logAuditEvent adds retention metadata with ttl_days and retain_until", () => {
  const event = logAuditEvent({ event_type: "test.retention.fields", actor: "test-actor", context: {} });
  assert.ok(event, "event returned");
  assert.ok("retention" in event, "retention field present");
  assert.ok(
    event.retention.ttl_days === null || typeof event.retention.ttl_days === "number",
    "ttl_days is null or number",
  );
  assert.ok(
    event.retention.retain_until === null || typeof event.retention.retain_until === "string",
    "retain_until is null or ISO string",
  );
  assert.equal(event.retention.redacted_at, null, "redacted_at starts as null");
});

test("logAuditEvent retain_until is in the future when TTL is positive", () => {
  const before = Date.now();
  const event = logAuditEvent({ event_type: "test.retention.ttl", actor: "sys", context: {} });
  if (event.retention.retain_until !== null) {
    const retainMs = new Date(event.retention.retain_until).getTime();
    assert.ok(retainMs > before, "retain_until is in the future");
  }
});

test("pruneAuditEvents removes expired events and keeps active and no-TTL events", async () => {
  const logPath = getAuditLogPath();
  const existing = JSON.parse(readFileSync(logPath, "utf8"));
  const past   = new Date(Date.now() - 1000).toISOString();
  const future = new Date(Date.now() + 86_400_000).toISOString();

  const expiredEvent = {
    id: "AUD-test-expired",
    timestamp: past,
    event_type: "test.prune",
    status: "success",
    actor: "x",
    context: {},
    retention: { ttl_days: 1, retain_until: past, redacted_at: null },
  };
  const activeEvent = {
    id: "AUD-test-active",
    timestamp: past,
    event_type: "test.prune",
    status: "success",
    actor: "x",
    context: {},
    retention: { ttl_days: 1, retain_until: future, redacted_at: null },
  };
  const noTtlEvent = {
    id: "AUD-test-no-ttl",
    timestamp: past,
    event_type: "test.prune",
    status: "success",
    actor: "x",
    context: {},
    retention: { ttl_days: null, retain_until: null, redacted_at: null },
  };

  writeFileSync(logPath, JSON.stringify([...existing, expiredEvent, activeEvent, noTtlEvent], null, 2));

  const pruned = await pruneAuditEvents();
  assert.ok(pruned >= 1, `expected at least 1 pruned, got ${pruned}`);

  const remaining = await readAuditEvents({ limit: 500 });
  const ids = remaining.map((e) => e.id);
  assert.ok(!ids.includes("AUD-test-expired"), "expired event must be removed");
  assert.ok(ids.includes("AUD-test-active"),   "active event must be kept");
  assert.ok(ids.includes("AUD-test-no-ttl"),   "no-TTL event must be kept");
});

test("redactAuditEvent clears actor and context and sets redacted_at", async () => {
  const event = logAuditEvent({ event_type: "test.redact", actor: "sensitive-user", context: { secret: "data" } });
  const ok = await redactAuditEvent(event.id);
  assert.equal(ok, true);

  const events = await readAuditEvents({ limit: 500 });
  const found = events.find((e) => e.id === event.id);
  assert.ok(found, "event still present after redaction");
  assert.equal(found.actor, "[redacted]");
  assert.deepEqual(found.context, {});
  assert.ok(typeof found.retention.redacted_at === "string", "redacted_at is set");
});

test("redactAuditEvent returns false for unknown id", async () => {
  assert.equal(await redactAuditEvent("AUD-nonexistent-xyz"), false);
});

test("legacy events without retention field are tolerated by pruneAuditEvents", async () => {
  const logPath = getAuditLogPath();
  const existing = JSON.parse(readFileSync(logPath, "utf8"));
  const legacyEvent = {
    id: "AUD-legacy-no-retention",
    timestamp: new Date().toISOString(),
    event_type: "legacy.event",
    status: "success",
    actor: "old-actor",
    context: {},
    // deliberately no `retention` field
  };
  writeFileSync(logPath, JSON.stringify([...existing, legacyEvent], null, 2));

  // Should not throw; legacy event has no retain_until so it is kept
  const pruned = await pruneAuditEvents();
  assert.ok(typeof pruned === "number");
  const remaining = await readAuditEvents({ limit: 500 });
  assert.ok(remaining.some((e) => e.id === "AUD-legacy-no-retention"), "legacy event kept");
});

// ── /api/aria/whoami ───────────────────────────────────────────────────────

test("whoami returns resolved identity for caller with full headers", async () => {
  const res = await request({ url: "/api/aria/whoami", headers: AUTHED_ADMIN_A });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.tenant_id, TENANT_A);
  assert.equal(body.role, "admin");
  assert.ok("authz_mode" in body, "authz_mode present");
  assert.ok("header_sources" in body, "header_sources present");
  assert.equal(body.header_sources.tenant, "header");
  assert.equal(body.header_sources.user,   "header");
  assert.equal(body.header_sources.role,   "header");
});

test("whoami is accessible without auth headers (diagnostic, not gated)", async () => {
  const res = await request({ url: "/api/aria/whoami" });
  assert.equal(res.statusCode, 200, "whoami must not return 401/403 without headers");
  const body = res.json();
  assert.ok("tenant_id" in body, "tenant_id present");
  assert.ok("role" in body, "role present");
  assert.equal(body.header_sources.tenant, "default");
  assert.equal(body.header_sources.role,   "default");
});

test("whoami header_sources reflects partial header presence", async () => {
  const res = await request({
    url: "/api/aria/whoami",
    headers: { "x-tenant-id": "partial-tenant" },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.header_sources.tenant, "header");
  assert.equal(body.header_sources.user,   "default");
  assert.equal(body.header_sources.role,   "default");
});

test("whoami response shape is stable and frontend-compatible", async () => {
  const res = await request({ url: "/api/aria/whoami", headers: AUTHED_ADMIN_A });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  for (const field of ["tenant_id", "user_id", "role", "authz_mode", "header_sources"]) {
    assert.ok(field in body, `missing field: ${field}`);
  }
  for (const src of ["tenant", "user", "role"]) {
    assert.ok(src in body.header_sources, `missing header_sources.${src}`);
    assert.ok(["header", "default"].includes(body.header_sources[src]), `invalid source value for ${src}`);
  }
});

test("whoami visibility aligns with session-issued identity when headers are applied", async () => {
  const sessionRes = await request({
    method: "POST",
    url: "/api/aria/session",
    body: { tenant_id: TENANT_A, user_id: "session-analyst", role: "analyst" },
  });
  assert.equal(sessionRes.statusCode, 200);
  const issued = sessionRes.json();
  assert.equal(issued.tenant_id, TENANT_A);
  assert.equal(issued.role, "analyst");

  const exchangeRes = await request({
    method: "POST",
    url: "/api/aria/session",
    body: { token: issued.session_token },
  });
  assert.equal(exchangeRes.statusCode, 200);
  const identity = exchangeRes.json();
  assert.equal(identity.tenant_id, TENANT_A);
  assert.equal(identity.user_id, "session-analyst");
  assert.equal(identity.role, "analyst");

  const whoamiRes = await request({
    url: "/api/aria/whoami",
    headers: {
      "x-tenant-id": identity.tenant_id,
      "x-user-id": identity.user_id,
      "x-role": identity.role,
    },
  });
  assert.equal(whoamiRes.statusCode, 200);
  const whoami = whoamiRes.json();
  assert.equal(whoami.tenant_id, TENANT_A);
  assert.equal(whoami.user_id, "session-analyst");
  assert.equal(whoami.role, "analyst");
  assert.equal(whoami.header_sources.tenant, "header");
  assert.equal(whoami.header_sources.user, "header");
  assert.equal(whoami.header_sources.role, "header");
});

test("whoami prefers backend session-token identity when provided", async () => {
  const previousSecret = process.env.ARIA_SESSION_SECRET;
  process.env.ARIA_SESSION_SECRET = process.env.ARIA_SESSION_SECRET || "whoami-session-test-secret";
  try {
    const issued = await issueSessionToken({ tenant_id: "tenant-session", user_id: "session-user", role: "analyst" });
    const res = await request({
      url: "/api/aria/whoami",
      headers: {
        authorization: `Bearer ${issued.session_token}`,
        "x-tenant-id": TENANT_A,
        "x-user-id": "header-user",
        "x-role": "admin",
      },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.tenant_id, "tenant-session");
    assert.equal(body.user_id, "session-user");
    assert.equal(body.role, "analyst");
    assert.equal(body.header_sources.tenant, "session_token");
    assert.equal(body.header_sources.user, "session_token");
    assert.equal(body.header_sources.role, "session_token");
  } finally {
    if (previousSecret === undefined) delete process.env.ARIA_SESSION_SECRET;
    else process.env.ARIA_SESSION_SECRET = previousSecret;
  }
});
