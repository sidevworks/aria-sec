// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";

const ORIGINAL_CWD = process.cwd();
const TEST_CWD = mkdtempSync(join(tmpdir(), "aria-identity-routes-"));
process.chdir(TEST_CWD);
delete process.env.ARIA_AUTHZ_ALLOW_LOCAL_BYPASS;
delete process.env.ARIA_STRICT_PROD;
delete process.env.NODE_ENV;

const [{ handleAriaRequest }, { getAuditLogPath }] = await Promise.all([
  import("../../server/index.mjs"),
  import("../../server/auditLog.mjs"),
]);

after(() => {
  process.chdir(ORIGINAL_CWD);
  rmSync(TEST_CWD, { recursive: true, force: true });
});

const ADMIN = { "x-tenant-id": "tenant-alpha", "x-user-id": "admin@aria.io", "x-role": "admin" };
const OWNER = { "x-tenant-id": "tenant-alpha", "x-user-id": "owner@aria.io", "x-role": "owner" };
const VIEWER = { "x-tenant-id": "tenant-alpha", "x-user-id": "viewer@aria.io", "x-role": "viewer" };

function readAuditLog() {
  try { return JSON.parse(readFileSync(getAuditLogPath(), "utf8")); } catch { return []; }
}

function createReq({ method = "GET", url = "/", body, headers = {} } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = headers;
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
    getHeader(name) { return this.headers[name]; },
    writeHead(code, hdrs) { this.statusCode = code; this.headers = hdrs; },
    end(payload = "") { this.payload = payload; },
  };
}

async function request({ method, url, headers, body }) {
  const req = createReq({ method, url, headers, body });
  const res = createRes();
  await handleAriaRequest(req, res);
  return { status: res.statusCode, body: JSON.parse(res.payload || "{}") };
}

test("GET /api/identity/entities/:id/inspect requires authenticated identity headers", async () => {
  rmSync(getAuditLogPath(), { force: true });

  const res = await request({
    method: "GET",
    url: "/api/identity/entities/sample%3Auser%3AFinance-1/inspect",
  });

  assert.equal(res.status, 401);
  assert.match(res.body.error, /Missing auth context/i);

  const events = readAuditLog();
  assert.ok(events.some((event) => event.event_type === "authz.missing_context" && event.status === "denied"));
});

test("GET /api/identity/entities/:id/inspect returns enterprise inspection evidence", async () => {
  const entityId = "sample:user:Finance-1";
  const res = await request({
    method: "GET",
    url: `/api/identity/entities/${encodeURIComponent(entityId)}/inspect`,
    headers: VIEWER,
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.status, "completed");
  assert.equal(res.body.enforcement_mode, "executed");
  assert.equal(res.body.requires_approval, false);
  assert.equal(res.body.rollback_available, false);
  assert.ok(res.body.action_id);
  assert.equal(res.body.evidence.entity.id, entityId);
  assert.ok(Array.isArray(res.body.evidence.recommended_actions));
});

test("POST /api/identity/entities/:id/action denies viewer write/action attempts", async () => {
  rmSync(getAuditLogPath(), { force: true });

  const res = await request({
    method: "POST",
    url: "/api/identity/entities/sample%3Auser%3AFinance-1/action",
    headers: VIEWER,
    body: { action: "block_proposal", reason: "viewer cannot request identity response" },
  });

  assert.equal(res.status, 403);
  assert.match(res.body.error, /not permitted/i);

  const events = readAuditLog();
  assert.ok(events.some((event) =>
    event.event_type === "authz.role_denied" &&
    event.status === "denied" &&
    event.actor === "viewer@aria.io" &&
    event.context?.api_path === "/api/identity/entities/sample%3Auser%3AFinance-1/action"
  ));
});

test("POST /api/identity/entities/:id/action creates approval-gated proposal when no enforcement connector exists", async () => {
  rmSync(getAuditLogPath(), { force: true });
  delete process.env.ARIA_IDENTITY_ENFORCEMENT_CONNECTOR;

  const res = await request({
    method: "POST",
    url: "/api/identity/entities/sample%3Auser%3AFinance-1/action",
    headers: ADMIN,
    body: { action: "block_proposal", reason: "impossible travel and payroll export", evidence: { alert_id: "alert-1" } },
  });

  assert.equal(res.status, 202);
  assert.equal(res.body.status, "proposal_created");
  assert.equal(res.body.enforcement_mode, "proposal_only");
  assert.equal(res.body.requires_approval, true);
  assert.equal(res.body.rollback_available, false);
  assert.equal(res.body.evidence.proposal.action, "block_proposal");
  assert.equal(res.body.evidence.proposal.approval_status, "pending");

  const events = readAuditLog();
  assert.ok(events.some((event) => event.event_type === "identity.action_requested"));
  assert.ok(events.some((event) => event.event_type === "identity.proposal_created"));
  assert.ok(events.some((event) => event.event_type === "identity.action_completed"));
});

test("POST /api/identity/entities/:id/action allows owner to create proposal-only response", async () => {
  delete process.env.ARIA_IDENTITY_ENFORCEMENT_CONNECTOR;

  const res = await request({
    method: "POST",
    url: "/api/identity/entities/sample%3Auser%3AIT%20Operations-3/action",
    headers: OWNER,
    body: { action: "create_case_note", reason: "owner records investigation note" },
  });

  assert.equal(res.status, 202);
  assert.equal(res.body.status, "proposal_created");
  assert.equal(res.body.enforcement_mode, "proposal_only");
  assert.equal(res.body.requires_approval, true);
  assert.equal(res.body.evidence.proposal.approval_status, "pending");
});

test("POST /api/identity/entities/:id/action denies unsupported actions and audits denial", async () => {
  rmSync(getAuditLogPath(), { force: true });

  const res = await request({
    method: "POST",
    url: "/api/identity/entities/sample%3Auser%3AFinance-1/action",
    headers: ADMIN,
    body: { action: "disable_user", reason: "not supported" },
  });

  assert.equal(res.status, 400);
  assert.equal(res.body.status, "denied");
  assert.equal(res.body.enforcement_mode, "proposal_only");
  assert.equal(res.body.requires_approval, false);
  assert.ok(res.body.action_id);
  assert.match(res.body.evidence.reason, /Unsupported identity action/);

  const events = readAuditLog();
  assert.ok(events.some((event) => event.event_type === "identity.action_denied" && event.status === "denied"));
});

test("GET /api/identity/entities/:id/timeline returns normalized timeline evidence", async () => {
  const res = await request({
    method: "GET",
    url: "/api/identity/entities/sample%3Auser%3AFinance-1/timeline",
    headers: VIEWER,
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.status, "completed");
  assert.equal(res.body.enforcement_mode, "executed");
  assert.equal(res.body.requires_approval, false);
  assert.ok(Array.isArray(res.body.evidence.timeline));
  assert.ok(res.body.evidence.timeline.length > 0);
});

test("GET /api/identity/galaxies blocks sample data in production unless sample mode is explicitly non-production", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousStrictProd = process.env.ARIA_STRICT_PROD;
  process.env.NODE_ENV = "production";
  process.env.ARIA_STRICT_PROD = "1";

  try {
    const res = await request({
      method: "GET",
      url: "/api/identity/galaxies",
      headers: VIEWER,
    });

    assert.equal(res.status, 503);
    assert.equal(res.body.error, "IDENTITY_SOURCE_UNAVAILABLE");
    assert.match(res.body.message, /requires live identity source data/i);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousStrictProd === undefined) delete process.env.ARIA_STRICT_PROD;
    else process.env.ARIA_STRICT_PROD = previousStrictProd;
  }
});

// ─── Network device Inspect Deep tests ────────────────────────────────────────

test("GET /api/identity/entities/:id/inspect returns device data for network device IDs (sample mode)", async () => {
  const prevNetSample = process.env.ARIA_NETWORK_SAMPLE_MODE;
  process.env.ARIA_NETWORK_SAMPLE_MODE = "1";

  try {
    const entityId = "device:192.168.10.10";
    const res = await request({
      method: "GET",
      url: `/api/identity/entities/${encodeURIComponent(entityId)}/inspect`,
      headers: VIEWER,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.status, "completed");
    assert.equal(res.body.evidence.entity_type, "network_device");
    assert.ok(res.body.evidence.entity.ip, "entity should have an ip field");
    assert.equal(res.body.evidence.entity.id, entityId);
    assert.equal(res.body.evidence.entity.source, "network");
    assert.ok(Array.isArray(res.body.evidence.recommended_actions));
    assert.equal(res.body.evidence.behaviour, null);
    assert.deepEqual(res.body.evidence.privilege_timeline, []);
  } finally {
    if (prevNetSample === undefined) delete process.env.ARIA_NETWORK_SAMPLE_MODE;
    else process.env.ARIA_NETWORK_SAMPLE_MODE = prevNetSample;
  }
});

test("GET /api/identity/entities/:id/inspect returns riskReasons for network devices", async () => {
  const prevNetSample = process.env.ARIA_NETWORK_SAMPLE_MODE;
  process.env.ARIA_NETWORK_SAMPLE_MODE = "1";

  try {
    const entityId = "device:192.168.10.16";
    const res = await request({
      method: "GET",
      url: `/api/identity/entities/${encodeURIComponent(entityId)}/inspect`,
      headers: VIEWER,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.evidence.entity_type, "network_device");
    assert.ok(Array.isArray(res.body.evidence.riskReasons), "should include riskReasons array");
    assert.ok(res.body.evidence.riskReasons.length > 0, "unknown device should have at least one risk reason");

    for (const reason of res.body.evidence.riskReasons) {
      assert.ok(reason.severity, "each reason must have a severity");
      assert.ok(reason.text, "each reason must have text");
    }
  } finally {
    if (prevNetSample === undefined) delete process.env.ARIA_NETWORK_SAMPLE_MODE;
    else process.env.ARIA_NETWORK_SAMPLE_MODE = prevNetSample;
  }
});

test("GET /api/identity/entities/:id/inspect still works for Azure AD sample users (regression)", async () => {
  const entityId = "sample:user:Engineering-0";
  const res = await request({
    method: "GET",
    url: `/api/identity/entities/${encodeURIComponent(entityId)}/inspect`,
    headers: VIEWER,
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.status, "completed");
  assert.equal(res.body.evidence.entity_type, "user");
  assert.equal(res.body.evidence.entity.id, entityId);
  assert.ok(res.body.evidence.behaviour, "user inspection should include behaviour baseline");
  assert.ok(Array.isArray(res.body.evidence.privilege_timeline), "user inspection should include privilege_timeline");
});

// ─── Network device behaviour/timeline tests ─────────────────────────────────

test("GET /api/identity/behaviour/:userId returns not_applicable for network device IDs", async () => {
  const res = await request({
    method: "GET",
    url: `/api/identity/behaviour/${encodeURIComponent("device:192.168.1.1")}`,
    headers: VIEWER,
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.status, "not_applicable");
  assert.equal(res.body.anomalyScore, 0);
  assert.deepEqual(res.body.recentDeviations, []);
  assert.ok(res.body.message.includes("network devices"));
});

test("GET /api/identity/entities/:id/timeline returns device discovered event for network device IDs", async () => {
  const res = await request({
    method: "GET",
    url: `/api/identity/entities/${encodeURIComponent("device:192.168.1.1")}/timeline`,
    headers: VIEWER,
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.status, "completed");
  assert.ok(Array.isArray(res.body.evidence.timeline));
  assert.equal(res.body.evidence.timeline.length, 1);
  assert.equal(res.body.evidence.timeline[0].type, "device.discovered");
});
