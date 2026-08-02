// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { handleAriaRequest } from "../../server/index.mjs";

process.env.ARIA_AI_SPM_DISABLE_GH_AUTO = "1";

function createReq({ method = "GET", url = "/", body, headers = {} } = {}) {
  const req = new EventEmitter();
  req.socket = { remoteAddress: "127.0.0.1" };
  req.method = method;
  req.url = url;
  req.headers = headers;
  req[Symbol.asyncIterator] = async function* iterator() {
    if (body !== undefined) yield Buffer.from(JSON.stringify(body));
  };
  return req;
}

function createRes() {
  return {
    statusCode: 0,
    headers: {},
    payload: "",
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    setHeader(name, value) { this.headers[name] = value; },
    getHeader(name) { return this.headers[name]; },
    end(payload = "") {
      this.payload = payload;
    },
    json() {
      return JSON.parse(this.payload);
    },
  };
}

async function request(options) {
  const req = createReq(options);
  const res = createRes();
  await handleAriaRequest(req, res);
  return res;
}

function readJsonFile(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

test("tenant/authz default contract denies missing middleware headers", async () => {
  const noTenant = await request({ method: "POST", url: "/api/ai-spm/scan", body: {} });
  const withTenant = await request({
    method: "POST",
    url: "/api/ai-spm/scan",
    headers: {
      "x-tenant-id": "acme-prod",
      "x-user-id": "u-scan",
      "x-role": "admin",
      authorization: "Bearer test-token",
    },
    body: {},
  });

  assert.equal(noTenant.statusCode, 401);
  assert.equal(withTenant.statusCode, 200);
  assert.ok(Array.isArray(withTenant.json().findings));
});

test("tenant/authz explicit local bypass allows missing headers when enabled", async () => {
  const prev = process.env.ARIA_AUTHZ_ALLOW_LOCAL_BYPASS;
  const prevRole = process.env.ARIA_DEFAULT_ROLE;
  process.env.ARIA_AUTHZ_ALLOW_LOCAL_BYPASS = "true";
  process.env.ARIA_DEFAULT_ROLE = "admin";
  try {
    const res = await request({ method: "POST", url: "/api/ai-spm/scan", body: {} });
    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.json().findings));
  } finally {
    if (prev === undefined) delete process.env.ARIA_AUTHZ_ALLOW_LOCAL_BYPASS;
    else process.env.ARIA_AUTHZ_ALLOW_LOCAL_BYPASS = prev;
    if (prevRole === undefined) delete process.env.ARIA_DEFAULT_ROLE;
    else process.env.ARIA_DEFAULT_ROLE = prevRole;
  }
});

test("audit persistence updates for scan, finding-action, and approval flows", async () => {
  const memoryDir = process.env.ARIA_PERSISTENCE_DIR || join(process.cwd(), "aria-memory");
  const scansPath = join(memoryDir, "ai-spm-scan-history.json");
  const decisionsPath = join(memoryDir, "ai-spm-decisions.json");
  const approvalsPath = join(memoryDir, "tenants", "acme", "approval-queue.json");

  const beforeScans = readJsonFile(scansPath, { scans: [] });
  const beforeDecisions = readJsonFile(decisionsPath, {});

  const scanRes = await request({
    method: "POST",
    url: "/api/ai-spm/scan",
    headers: { "x-tenant-id": "acme", "x-user-id": "u-audit", "x-role": "admin" },
    body: { demo: true },
  });
  assert.equal(scanRes.statusCode, 200);
  const firstFinding = scanRes.json().findings?.[0];
  assert.ok(firstFinding?.id);

  const ignoreRes = await request({
    method: "POST",
    url: "/api/ai-spm/finding-action",
    headers: { "x-tenant-id": "acme", "x-user-id": "u-audit", "x-role": "admin" },
    body: { findingId: firstFinding.id, action: "ignore", note: "audit-gate-test" },
  });
  assert.equal(ignoreRes.statusCode, 200);
  assert.equal(ignoreRes.json().decision?.status, "ignored");

  await request({
    method: "POST",
    url: "/api/aria/autonomy",
    headers: { "x-tenant-id": "acme", "x-user-id": "u-audit", "x-role": "admin" },
    body: { mode: "confirm" },
  });
  const commandRes = await request({
    method: "POST",
    url: "/api/aria/command",
    headers: { "x-tenant-id": "acme", "x-user-id": "u-audit", "x-role": "admin" },
    body: { text: "Run quick scan on local host" },
  });
  assert.equal(commandRes.statusCode, 200);
  assert.equal(commandRes.json().result.status, "approval_required");
  assert.equal(typeof commandRes.json().result.approval?.id, "string");

  const afterScans = readJsonFile(scansPath, { scans: [] });
  const afterDecisions = readJsonFile(decisionsPath, { decisions: [] });

  // Scan history is capped at MAX_SCAN_HISTORY (60). Length may not increase when at cap.
  // Assert the history is non-empty and the last entry has the expected shape.
  const lastScan = (afterScans.scans || []).slice(-1)[0];
  assert.ok(lastScan?.summary, "scan history must contain a valid scan entry after scan");
  assert.ok(existsSync(decisionsPath));
  assert.equal(typeof afterDecisions[firstFinding.id], "object");
  assert.notEqual(afterDecisions[firstFinding.id], beforeDecisions[firstFinding.id]);
  assert.ok(existsSync(approvalsPath));
});

test("viewer role is denied write on ai-spm scan (POST)", async () => {
  const res = await request({
    method: "POST",
    url: "/api/ai-spm/scan",
    headers: { "x-tenant-id": "acme", "x-user-id": "u1", "x-role": "viewer" },
    body: {},
  });
  assert.equal(res.statusCode, 403);
  assert.ok(res.json().error.toLowerCase().includes("viewer"));
});

test("viewer role is allowed read on ai-spm findings (GET)", async () => {
  const res = await request({
    method: "GET",
    url: "/api/ai-spm/findings",
    headers: { "x-tenant-id": "acme", "x-user-id": "u1", "x-role": "viewer" },
  });
  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.json().findings));
});

test("analyst is denied write on /api/aria/autonomy", async () => {
  const res = await request({
    method: "POST",
    url: "/api/aria/autonomy",
    headers: { "x-tenant-id": "acme", "x-user-id": "u2", "x-role": "analyst" },
    body: { mode: "full_auto" },
  });
  assert.equal(res.statusCode, 403);
  assert.ok(res.json().error.toLowerCase().includes("analyst"));
});

test("unknown/invalid role is denied all access", async () => {
  const res = await request({
    method: "GET",
    url: "/api/ai-spm/findings",
    headers: { "x-tenant-id": "acme", "x-user-id": "u3", "x-role": "superuser" },
  });
  assert.equal(res.statusCode, 403);
});

test("enforce mode returns 401 when required headers are missing", async () => {
  const prev = process.env.ARIA_AUTHZ_ENFORCE;
  process.env.ARIA_AUTHZ_ENFORCE = "true";
  try {
    const res = await request({ method: "GET", url: "/api/ai-spm/findings" });
    assert.equal(res.statusCode, 401);
    assert.ok(res.json().error.toLowerCase().includes("missing"));
  } finally {
    if (prev === undefined) delete process.env.ARIA_AUTHZ_ENFORCE;
    else process.env.ARIA_AUTHZ_ENFORCE = prev;
  }
});

test("enforce mode returns 401 when only some headers are present", async () => {
  const prev = process.env.ARIA_AUTHZ_ENFORCE;
  process.env.ARIA_AUTHZ_ENFORCE = "true";
  try {
    const res = await request({
      method: "GET",
      url: "/api/ai-spm/findings",
      headers: { "x-tenant-id": "acme" },
    });
    assert.equal(res.statusCode, 401);
  } finally {
    if (prev === undefined) delete process.env.ARIA_AUTHZ_ENFORCE;
    else process.env.ARIA_AUTHZ_ENFORCE = prev;
  }
});

test("cross-tenant access denied when x-resource-tenant differs from caller tenant", async () => {
  const res = await request({
    method: "GET",
    url: "/api/ai-spm/findings",
    headers: {
      "x-tenant-id": "acme",
      "x-user-id": "u1",
      "x-role": "admin",
      "x-resource-tenant": "rival-corp",
    },
  });
  assert.equal(res.statusCode, 403);
  assert.ok(res.json().error.toLowerCase().includes("cross-tenant"));
});

test("cross-tenant check passes when x-resource-tenant matches caller tenant", async () => {
  const res = await request({
    method: "GET",
    url: "/api/ai-spm/findings",
    headers: {
      "x-tenant-id": "acme",
      "x-user-id": "u1",
      "x-role": "admin",
      "x-resource-tenant": "acme",
    },
  });
  assert.equal(res.statusCode, 200);
});

test("authz denial emits an audit event", async () => {
  const { readAuditEvents } = await import("../../server/auditLog.mjs");
  const before = (await readAuditEvents({ limit: 500 })).length;

  await request({
    method: "POST",
    url: "/api/ai-spm/scan",
    headers: { "x-tenant-id": "acme", "x-user-id": "u-deny", "x-role": "viewer" },
    body: {},
  });

  const after = await readAuditEvents({ limit: 500 });
  const denialEvent = [...after].reverse().find((e) =>
    e.status === "denied" &&
    e.event_type === "authz.role_denied" &&
    e.actor === "u-deny" &&
    e.context?.api_path === "/api/ai-spm/scan"
  );
  assert.ok(denialEvent, "expected a denied audit event for the viewer POST");
  assert.equal(denialEvent.context.role, "viewer");
  assert.ok(after.length > before);
});

test("connectors routes deny unauthenticated access and allow authorized read", async () => {
  const denied = await request({ method: "GET", url: "/api/connectors/github/status" });
  assert.equal(denied.statusCode, 401);

  const allowed = await request({
    method: "GET",
    url: "/api/connectors/github/status",
    headers: { "x-tenant-id": "acme", "x-user-id": "u-connector", "x-role": "viewer" },
  });
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.json().connector?.id, "github");
});

test("aria session route denies unauthenticated and unauthorized role escalation", async () => {
  const unauth = await request({
    method: "POST",
    url: "/api/aria/session",
    body: { tenant_id: "acme", user_id: "u-session", role: "admin" },
  });
  assert.equal(unauth.statusCode, 403);

  const escalated = await request({
    method: "POST",
    url: "/api/aria/session",
    headers: { "x-tenant-id": "acme", "x-user-id": "u-session", "x-role": "viewer" },
    body: { tenant_id: "acme", user_id: "u-session", role: "admin" },
  });
  assert.equal(escalated.statusCode, 403);
});

test("aria session route allows trusted elevated role when authorized", async () => {
  const res = await request({
    method: "POST",
    url: "/api/aria/session",
    headers: {
      "x-tenant-id": "acme",
      "x-user-id": "u-admin",
      "x-role": "admin",
      "x-identity-asserted": "true",
    },
    body: { tenant_id: "acme", user_id: "u-admin", role: "admin" },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.json().tenant_id, "acme");
  assert.equal(res.json().user_id, "u-admin");
  assert.equal(res.json().role, "admin");
});

test("invalid tenant/user context is rejected server-side", async () => {
  const res = await request({
    method: "GET",
    url: "/api/connectors/github/status",
    headers: { "x-tenant-id": "!", "x-user-id": "bad user", "x-role": "viewer" },
  });
  assert.equal(res.statusCode, 400);
});

test("rate-limit/quota contract remains stable under burst and unknown quota endpoint", async () => {
  for (let i = 0; i < 8; i++) {
    const res = await request({
      method: "GET",
      url: "/api/ai-spm/findings",
      headers: { "x-tenant-id": "acme", "x-user-id": "u-rate", "x-role": "admin" },
    });
    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.json().findings));
  }

  const quotaRes = await request({
    method: "GET",
    url: "/api/ai-spm/quota",
    headers: { "x-tenant-id": "acme", "x-user-id": "u-rate", "x-role": "admin" },
  });
  assert.equal(quotaRes.statusCode, 404);
  assert.equal(quotaRes.json().error, "Not found");
});
