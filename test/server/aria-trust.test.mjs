// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

/**
 * Tests for the Trust & Autonomy engine — production rules:
 *   - Promotions are explicit, reason-gated, and audited.
 *   - recordOutcome never auto-promotes (safety: only auto-demotes).
 *   - getTrustSummary returns thresholds + gates + blocking_reason for the UI.
 *   - Backward compat: legacy trust-scores.json without recent[] still loads.
 */

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

process.env.ARIA_AI_SPM_DISABLE_GH_AUTO = "1";
process.env.ARIA_PERSISTENCE_DIR = join(process.cwd(), "aria-memory-test-trust");

const PERSIST_DIR = process.env.ARIA_PERSISTENCE_DIR;
// Matches the default tenant used when callers (including direct trust.* calls
// below, which pass no tenantId) omit one — keeps HTTP-request tests and
// direct-module-call tests reading/writing the same file.
const TENANT = "tenant-local";
// Trust scores are tenant-namespaced under tenants/<tenant_id>/trust-scores.json.
const TRUST_PATH = join(PERSIST_DIR, "tenants", TENANT, "trust-scores.json");
// auditLog.mjs writes to ./aria-memory/audit-events.json (cwd-rooted, not ARIA_PERSISTENCE_DIR).
const AUDIT_PATH = join(process.cwd(), "aria-memory", "audit-events.json");

function resetStore(initial = {}) {
  if (existsSync(PERSIST_DIR)) rmSync(PERSIST_DIR, { recursive: true, force: true });
  mkdirSync(join(PERSIST_DIR, "tenants", TENANT), { recursive: true });
  writeFileSync(TRUST_PATH, JSON.stringify(initial, null, 2));
  // Reset the audit log so per-test event assertions don't see prior runs.
  if (existsSync(AUDIT_PATH)) writeFileSync(AUDIT_PATH, "[]\n");
}

const trust = await import("../../server/ariaTrust.mjs");
const { handleAriaRequest } = await import("../../server/index.mjs");

const ANALYST_HEADERS = { "x-tenant-id": TENANT, "x-user-id": "analyst-1", "x-role": "analyst" };

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
    writeHead(s, h) { this.statusCode = s; if (h) Object.assign(this.headers, h); },
    end(p = "") { this.payload = p; },
    json() { return JSON.parse(this.payload); },
  };
}

async function request(opts) {
  const req = createReq(opts);
  const res = createRes();
  await handleAriaRequest(req, res);
  return res;
}

function auditEvents() {
  try { return JSON.parse(readFileSync(AUDIT_PATH, "utf8")); } catch { return []; }
}

// ── Module-level tests ────────────────────────────────────────────────────────

test("getTrustSummary exposes thresholds, gates, and blocking_reason for a fresh capability", async () => {
  resetStore();
  const summary = await trust.getTrustSummary();
  const ta = summary.find(s => s.capability === "threat_analysis");
  assert.equal(ta.mode, "approval");
  assert.equal(ta.next_mode, "assisted");
  assert.deepEqual(ta.thresholds, { min_trust: 0.80, min_samples: 10, max_overrides: 3 });
  assert.equal(ta.gates.samples_ok, false);
  assert.equal(ta.ready_to_promote, false);
  assert.match(ta.blocking_reason, /Needs 10 more samples/);
  assert.deepEqual(ta.recent, []);
});

test("recordOutcome appends to recent[] capped at 20", async () => {
  resetStore();
  for (let i = 0; i < 25; i++) await trust.recordOutcome("threat_analysis", "success");
  const summary = await trust.getTrustSummary();
  const ta = summary.find(s => s.capability === "threat_analysis");
  assert.equal(ta.recent.length, 20);
  assert.equal(ta.recent[0].outcome, "success");
  assert.equal(ta.successes, 25);
});

test("recordOutcome NEVER auto-promotes even when all gates are met", async () => {
  resetStore();
  for (let i = 0; i < 15; i++) await trust.recordOutcome("threat_analysis", "success");
  const summary = await trust.getTrustSummary();
  const ta = summary.find(s => s.capability === "threat_analysis");
  assert.equal(ta.mode, "approval", "must stay in approval — promotion is operator-elected");
  assert.equal(ta.ready_to_promote, true);
  assert.equal(ta.blocking_reason, null);
});

test("recordOutcome auto-demotes when a failure occurs at a non-approval stage", async () => {
  resetStore({ threat_analysis: { successes: 100, failures: 0, overrides: 0, mode: "auto", recent: [] } });
  await trust.recordOutcome("threat_analysis", "failure");
  const ta = (await trust.getTrustSummary()).find(s => s.capability === "threat_analysis");
  assert.equal(ta.mode, "assisted", "auto-demote pulls one rung on failure");

  const events = auditEvents();
  const demoted = events.find(e => e.event_type === "aria.trust.demoted");
  assert.ok(demoted, "auto-demote must emit an audit event");
  assert.equal(demoted.context.manual, false);
  assert.equal(demoted.context.from, "auto");
  assert.equal(demoted.context.to, "assisted");
});

test("promoteCapability rejects when gates are not satisfied", async () => {
  resetStore();
  const res = await trust.promoteCapability("threat_analysis", "analyst-1", "trying to skip the line");
  assert.equal(res.ok, false);
  assert.match(res.error, /Needs 10 more samples/);
});

test("promoteCapability rejects a missing or too-short reason", async () => {
  resetStore();
  for (let i = 0; i < 15; i++) await trust.recordOutcome("threat_analysis", "success");
  assert.equal((await trust.promoteCapability("threat_analysis", "analyst-1", "")).ok, false);
  assert.equal((await trust.promoteCapability("threat_analysis", "analyst-1", "ok")).ok, false);
  assert.equal((await trust.promoteCapability("threat_analysis", "analyst-1")).ok, false);
});

test("promoteCapability succeeds when ready, writes audit with reason", async () => {
  resetStore();
  for (let i = 0; i < 15; i++) await trust.recordOutcome("threat_analysis", "success");
  const res = await trust.promoteCapability("threat_analysis", "analyst-1", "Q2 demo readiness review — 15 clean samples");
  assert.equal(res.ok, true);
  assert.equal(res.from, "approval");
  assert.equal(res.to, "assisted");
  assert.equal(res.updated.mode, "assisted");

  const events = auditEvents();
  const promo = events.find(e => e.event_type === "aria.trust.promoted");
  assert.ok(promo);
  assert.equal(promo.context.from, "approval");
  assert.equal(promo.context.to, "assisted");
  assert.match(promo.context.reason, /Q2 demo readiness/);
  assert.equal(promo.actor, "analyst-1");
});

test("promoteCapability rejects when already at full_auto", async () => {
  resetStore({ threat_analysis: { successes: 200, failures: 0, overrides: 0, mode: "full_auto", recent: [] } });
  const res = await trust.promoteCapability("threat_analysis", "analyst-1", "valid reason here");
  assert.equal(res.ok, false);
  assert.match(res.error, /highest stage/);
});

test("demoteCapability rolls back one stage with reason + audit", async () => {
  resetStore({ threat_analysis: { successes: 50, failures: 0, overrides: 0, mode: "auto", recent: [] } });
  const res = await trust.demoteCapability("threat_analysis", "analyst-1", "investor demo — staging safer");
  assert.equal(res.ok, true);
  assert.equal(res.from, "auto");
  assert.equal(res.to, "assisted");

  const demoted = auditEvents().find(e => e.event_type === "aria.trust.demoted" && e.context.manual === true);
  assert.ok(demoted);
  assert.match(demoted.context.reason, /investor demo/);
});

test("demoteCapability rejects at approval (already at floor)", async () => {
  resetStore();
  const res = await trust.demoteCapability("threat_analysis", "analyst-1", "any reason here");
  assert.equal(res.ok, false);
  assert.match(res.error, /most restrictive/);
});

test("backward compat: legacy entry without recent[] loads with empty recent[]", async () => {
  resetStore({ threat_analysis: { successes: 5, failures: 1, overrides: 0, mode: "approval" } });
  const ta = (await trust.getTrustSummary()).find(s => s.capability === "threat_analysis");
  assert.deepEqual(ta.recent, []);
  assert.equal(ta.samples, 6);
});

test("blocking_reason names trust gate when samples met but trust low", async () => {
  // 9 successes + 4 failures = 13 samples, trust = 9/13 ≈ 0.69, below 0.80
  const stored = { threat_analysis: { successes: 9, failures: 4, overrides: 0, mode: "approval", recent: [] } };
  resetStore(stored);
  const ta = (await trust.getTrustSummary()).find(s => s.capability === "threat_analysis");
  assert.equal(ta.gates.samples_ok, true);
  assert.equal(ta.gates.trust_ok, false);
  assert.match(ta.blocking_reason, /below 80% threshold/);
});

// ── Route tests ───────────────────────────────────────────────────────────────

test("GET /api/aria/trust returns the new summary shape", async () => {
  resetStore();
  const res = await request({ url: "/api/aria/trust", headers: ANALYST_HEADERS });
  assert.equal(res.statusCode, 200);
  const { trust: rows } = res.json();
  assert.equal(rows.length, 4);
  assert.ok("next_mode" in rows[0]);
  assert.ok("thresholds" in rows[0]);
  assert.ok("gates" in rows[0]);
  assert.ok("blocking_reason" in rows[0]);
  assert.ok(Array.isArray(rows[0].recent));
});

test("POST /api/aria/trust/:cap/promote — 400 with blocking_reason when not ready", async () => {
  resetStore();
  const res = await request({
    method: "POST",
    url: "/api/aria/trust/threat_analysis/promote",
    headers: ANALYST_HEADERS,
    body: { reason: "Trying to elevate prematurely" },
  });
  assert.equal(res.statusCode, 400);
  const body = res.json();
  assert.equal(body.ok, false);
  assert.match(body.error, /Needs 10 more samples/);
});

test("POST /api/aria/trust/:cap/promote — 200 when ready, audit written with reason", async () => {
  resetStore({ threat_analysis: { successes: 15, failures: 0, overrides: 0, mode: "approval", recent: [] } });
  const res = await request({
    method: "POST",
    url: "/api/aria/trust/threat_analysis/promote",
    headers: ANALYST_HEADERS,
    body: { reason: "Q2 demo readiness — 15 clean samples observed" },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ok, true);
  assert.equal(body.from, "approval");
  assert.equal(body.to, "assisted");

  const promo = auditEvents().find(e => e.event_type === "aria.trust.promoted");
  assert.ok(promo);
  assert.match(promo.context.reason, /Q2 demo readiness/);

  const auditRes = await request({
    url: "/api/aria/audit-events?event_type=aria.trust.promoted&limit=10",
    headers: ANALYST_HEADERS,
  });
  assert.equal(auditRes.statusCode, 200);
  const auditBody = auditRes.json();
  const promotedEvent = auditBody.events.find(e => e.context?.capability === "threat_analysis");
  assert.ok(promotedEvent, "trust control centre needs capability context in audit history");
  assert.equal(promotedEvent.context.from, "approval");
  assert.equal(promotedEvent.context.to, "assisted");
  assert.match(promotedEvent.context.reason, /Q2 demo readiness/);
});

test("POST /api/aria/trust/:cap/demote — 200 with reason and audit", async () => {
  resetStore({ remediation: { successes: 80, failures: 0, overrides: 0, mode: "assisted", recent: [] } });
  const res = await request({
    method: "POST",
    url: "/api/aria/trust/remediation/demote",
    headers: ANALYST_HEADERS,
    body: { reason: "Staging back for change-control window" },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ok, true);
  assert.equal(body.from, "assisted");
  assert.equal(body.to, "approval");
});

test("POST /api/aria/trust/:cap/promote — 400 on missing reason", async () => {
  resetStore({ threat_analysis: { successes: 15, failures: 0, overrides: 0, mode: "approval", recent: [] } });
  const res = await request({
    method: "POST",
    url: "/api/aria/trust/threat_analysis/promote",
    headers: ANALYST_HEADERS,
    body: {},
  });
  assert.equal(res.statusCode, 400);
  assert.match(res.json().error, /reason/i);
});

test("POST /api/aria/trust/:cap/promote — 400 on unknown capability", async () => {
  resetStore();
  const res = await request({
    method: "POST",
    url: "/api/aria/trust/not_a_capability/promote",
    headers: ANALYST_HEADERS,
    body: { reason: "valid reason here" },
  });
  assert.equal(res.statusCode, 400);
  assert.match(res.json().error, /Unknown capability/);
});

// ── Cleanup ───────────────────────────────────────────────────────────────────

test.after(() => {
  if (existsSync(PERSIST_DIR)) rmSync(PERSIST_DIR, { recursive: true, force: true });
});
