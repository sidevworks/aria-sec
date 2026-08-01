// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { handleAriaRequest } from "../../server/index.mjs";

process.env.ARIA_AI_SPM_DISABLE_GH_AUTO = "1";

const MEMORY_DIR = join(process.cwd(), "aria-memory");
if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });

const TENANT = "tenant-policy-test";
const ADMIN = { "x-tenant-id": TENANT, "x-user-id": "admin@aria.io", "x-role": "admin" };
const OWNER = { "x-tenant-id": TENANT, "x-user-id": "owner@aria.io", "x-role": "owner" };
const VIEWER = { "x-tenant-id": TENANT, "x-user-id": "viewer@aria.io", "x-role": "viewer" };
const ANALYST = { "x-tenant-id": TENANT, "x-user-id": "analyst@aria.io", "x-role": "analyst" };

const POLICY_ID = "pol-rbac-viewer";

function createReq({ method = "GET", url = "/", body, headers = {} } = {}) {
  const req = new EventEmitter();
  req.socket = { remoteAddress: "127.0.0.1" };
  req.method = method;
  req.url = url;
  req.headers = headers;
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

// ── POST /api/aria/policy/preview ─────────────────────────────────────────────

test("policy preview — 401 when auth headers missing", async () => {
  const res = await hit({
    method: "POST", url: "/api/aria/policy/preview",
    body: { policy_id: POLICY_ID, proposed: { capabilities: ["read", "write"] } },
  });
  assert.equal(res.statusCode, 401);
});

test("policy preview — 400 when policy_id missing", async () => {
  const res = await hit({
    method: "POST", url: "/api/aria/policy/preview",
    headers: ADMIN,
    body: { proposed: { capabilities: ["read"] } },
  });
  assert.equal(res.statusCode, 400);
});

test("policy preview — 400 when proposed missing", async () => {
  const res = await hit({
    method: "POST", url: "/api/aria/policy/preview",
    headers: ADMIN,
    body: { policy_id: POLICY_ID },
  });
  assert.equal(res.statusCode, 400);
});

test("policy preview — 200 with diff, risk, capabilities_touched for admin", async () => {
  const res = await hit({
    method: "POST", url: "/api/aria/policy/preview",
    headers: ADMIN,
    body: { policy_id: POLICY_ID, proposed: { capabilities: ["read", "write"] } },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(Array.isArray(body.diff));
  assert.ok(["low", "medium", "high"].includes(body.risk));
  assert.ok(Array.isArray(body.capabilities_touched.added));
  assert.ok(Array.isArray(body.capabilities_touched.removed));
});

test("policy preview — analyst can preview", async () => {
  const res = await hit({
    method: "POST", url: "/api/aria/policy/preview",
    headers: ANALYST,
    body: { policy_id: POLICY_ID, proposed: { capabilities: ["read"] } },
  });
  assert.equal(res.statusCode, 200);
});

test("policy preview — viewer denied by write guard", async () => {
  const res = await hit({
    method: "POST", url: "/api/aria/policy/preview",
    headers: VIEWER,
    body: { policy_id: POLICY_ID, proposed: { capabilities: ["read"] } },
  });
  assert.equal(res.statusCode, 403);
});

test("policy preview — classifies manage_policies addition as high risk", async () => {
  const res = await hit({
    method: "POST", url: "/api/aria/policy/preview",
    headers: ADMIN,
    body: { policy_id: POLICY_ID, proposed: { capabilities: ["read", "manage_policies"] } },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().risk, "high");
});

test("policy preview — classifies adding write as medium risk", async () => {
  const res = await hit({
    method: "POST", url: "/api/aria/policy/preview",
    headers: ADMIN,
    body: { policy_id: POLICY_ID, proposed: { capabilities: ["read", "write"] } },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().risk, "medium");
});

// ── POST /api/aria/policy/apply ───────────────────────────────────────────────

test("policy apply — 401 when auth headers missing", async () => {
  const res = await hit({
    method: "POST", url: "/api/aria/policy/apply",
    body: { policy_id: POLICY_ID, proposed: { capabilities: ["read"] }, reason: "test" },
  });
  assert.equal(res.statusCode, 401);
});

test("policy apply — 403 for viewer role", async () => {
  const res = await hit({
    method: "POST", url: "/api/aria/policy/apply",
    headers: VIEWER,
    body: { policy_id: POLICY_ID, proposed: { capabilities: ["read"] }, reason: "test" },
  });
  assert.equal(res.statusCode, 403);
});

test("policy apply — 403 for analyst role", async () => {
  const res = await hit({
    method: "POST", url: "/api/aria/policy/apply",
    headers: ANALYST,
    body: { policy_id: POLICY_ID, proposed: { capabilities: ["read"] }, reason: "test" },
  });
  assert.equal(res.statusCode, 403);
});

test("policy apply — 400 when reason is missing", async () => {
  const res = await hit({
    method: "POST", url: "/api/aria/policy/apply",
    headers: ADMIN,
    body: { policy_id: POLICY_ID, proposed: { capabilities: ["read"] } },
  });
  assert.equal(res.statusCode, 400);
  assert.match(res.json().error, /reason/i);
});

test("policy apply — 400 when reason is whitespace only", async () => {
  const res = await hit({
    method: "POST", url: "/api/aria/policy/apply",
    headers: ADMIN,
    body: { policy_id: POLICY_ID, proposed: { capabilities: ["read"] }, reason: "   " },
  });
  assert.equal(res.statusCode, 400);
});

test("policy apply — 400 when policy_id missing", async () => {
  const res = await hit({
    method: "POST", url: "/api/aria/policy/apply",
    headers: ADMIN,
    body: { proposed: { capabilities: ["read"] }, reason: "test" },
  });
  assert.equal(res.statusCode, 400);
});

test("policy apply — 200 for admin with valid payload", async () => {
  const res = await hit({
    method: "POST", url: "/api/aria/policy/apply",
    headers: ADMIN,
    body: { policy_id: POLICY_ID, proposed: { capabilities: ["read"] }, reason: "Restore read-only" },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ok, true);
  assert.ok(body.policy);
  assert.ok(body.history_entry);
  assert.equal(body.history_entry.reason, "Restore read-only");
  assert.ok(["low","medium","high"].includes(body.history_entry.risk));
});

test("policy apply — 200 for owner role", async () => {
  const res = await hit({
    method: "POST", url: "/api/aria/policy/apply",
    headers: OWNER,
    body: { policy_id: POLICY_ID, proposed: { capabilities: ["read"] }, reason: "Owner test" },
  });
  assert.equal(res.statusCode, 200);
});

test("policy apply — history entry contains actor and diff", async () => {
  const res = await hit({
    method: "POST", url: "/api/aria/policy/apply",
    headers: ADMIN,
    body: {
      policy_id: POLICY_ID,
      proposed: { capabilities: ["read", "write"] },
      reason: "Expand viewer for Q3 pilot",
    },
  });
  assert.equal(res.statusCode, 200);
  const { history_entry } = res.json();
  assert.ok(history_entry.actor);
  assert.ok(Array.isArray(history_entry.diff));
  assert.ok(history_entry.timestamp);
});

// ── GET /api/aria/policy/history ──────────────────────────────────────────────

test("policy history — 401 when auth headers missing", async () => {
  const res = await hit({ method: "GET", url: "/api/aria/policy/history" });
  assert.equal(res.statusCode, 401);
});

test("policy history — 403 for viewer role", async () => {
  const res = await hit({ method: "GET", url: "/api/aria/policy/history", headers: VIEWER });
  assert.equal(res.statusCode, 403);
});

test("policy history — 403 for analyst role", async () => {
  const res = await hit({ method: "GET", url: "/api/aria/policy/history", headers: ANALYST });
  assert.equal(res.statusCode, 403);
});

test("policy history — 200 returns history array for admin", async () => {
  const res = await hit({ method: "GET", url: "/api/aria/policy/history", headers: ADMIN });
  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.json().history));
});

test("policy history — entries have required shape after apply", async () => {
  await hit({
    method: "POST", url: "/api/aria/policy/apply",
    headers: ADMIN,
    body: { policy_id: POLICY_ID, proposed: { capabilities: ["read"] }, reason: "Shape test" },
  });
  const res = await hit({ method: "GET", url: "/api/aria/policy/history", headers: ADMIN });
  assert.equal(res.statusCode, 200);
  const { history } = res.json();
  assert.ok(history.length > 0);
  const e = history[0];
  assert.ok(e.policy_id);
  assert.ok(e.timestamp);
  assert.ok(e.actor);
  assert.ok(e.reason);
  assert.ok(["low","medium","high"].includes(e.risk));
  assert.ok(Array.isArray(e.diff));
});

test("policy history — filters by policy_id query param", async () => {
  const res = await hit({
    method: "GET", url: `/api/aria/policy/history?policy_id=${POLICY_ID}`,
    headers: ADMIN,
  });
  assert.equal(res.statusCode, 200);
  const { history } = res.json();
  for (const e of history) assert.equal(e.policy_id, POLICY_ID);
});

// ── Source-contract assertions ────────────────────────────────────────────────

test("policy source contract — policyStore exports are present", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../../server/policyStore.mjs", import.meta.url), "utf8");
  assert.match(src, /export function previewPolicy/);
  assert.match(src, /export function applyPolicy/);
  assert.match(src, /export function getPolicyHistory/);
  assert.match(src, /logAuditEvent/);
  assert.match(src, /policy\.apply/);
});

test("policy source contract — index.mjs routes declared", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../../server/index.mjs", import.meta.url), "utf8");
  assert.match(src, /\/api\/aria\/policy\/preview/);
  assert.match(src, /\/api\/aria\/policy\/apply/);
  assert.match(src, /\/api\/aria\/policy\/history/);
  assert.match(src, /previewPolicy/);
  assert.match(src, /applyPolicy/);
  assert.match(src, /getPolicyHistory/);
});
