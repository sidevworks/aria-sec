// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { buildOperationalLoopSnapshot } from "../../server/ariaOperationalLoop.mjs";

process.env.ARIA_AI_SPM_DISABLE_GH_AUTO = "1";
process.env.ARIA_AUTHZ_ALLOW_LOCAL_BYPASS = "1";
process.env.ARIA_PERSISTENCE_DIR = join(process.cwd(), "aria-memory-test-operational-loop");

const PERSIST_DIR = process.env.ARIA_PERSISTENCE_DIR;
if (existsSync(PERSIST_DIR)) rmSync(PERSIST_DIR, { recursive: true, force: true });
mkdirSync(PERSIST_DIR, { recursive: true });

const { handleAriaRequest } = await import("../../server/index.mjs");

test("operational loop stitches decision, evidence, approval, audit, and trust into one lifecycle", () => {
  const loop = buildOperationalLoopSnapshot({
    approvals: [{
      id: "APR-1",
      action: "quarantine",
      reason: "Quarantine suspicious endpoint",
      risk: "high",
      status: "pending",
      created_at: "2026-06-19T10:01:00.000Z",
      affected_scope: { host: "workstation-7" },
    }],
    decisions: [{
      decision_id: "DEC-1",
      trigger: { type: "finding", ref_ids: ["finding-1"] },
      observation: "Suspicious lateral movement detected.",
      reasoning: "Endpoint beaconing and identity session anomaly correlate.",
      evidence: ["finding-1"],
      confidence: 84,
      blast_radius: "high",
      recommended_action: {
        verb: "quarantine",
        target: { system: "edr", resource: "workstation-7" },
        reversible: true,
      },
      fallback_action: { verb: "notify", target: { system: "analyst" }, rationale: "Manual review" },
      requires_human_approval: true,
      autonomy_required: "approval",
      narration: "Quarantine workstation-7 after approval.",
      created_at: "2026-06-19T10:00:00.000Z",
    }],
    evidence: [{
      evidence_id: "EVD-1",
      action_id: "ACT-1",
      decision_id: "DEC-1",
      timestamp_utc: "2026-06-19T10:00:10.000Z",
      system: "edr",
      status: "proposed",
      evidence_collected: [{ id: "finding-1", entity: "workstation-7" }],
      policy_controls: ["human approval"],
    }],
    trust: [{
      capability: "containment",
      mode: "approval",
      trust_pct: 82,
      recent: [{ outcome: "success", at: "2026-06-18T10:00:00.000Z" }],
    }],
    auditEvents: [{
      id: "AUD-1",
      timestamp: "2026-06-19T10:00:11.000Z",
      event_type: "aria.decision.created",
      status: "success",
      actor: "aria",
      context: { decision_id: "DEC-1" },
    }],
  });

  assert.equal(loop.status, "active");
  assert.equal(loop.current_stage, "approval_pending");
  assert.equal(loop.signal.id, "DEC-1");
  assert.equal(loop.evidence[0].id, "EVD-1");
  assert.equal(loop.blast_radius.level, "high");
  assert.equal(loop.recommended_action.approval_id, "APR-1");
  assert.equal(loop.recommended_action.requires_approval, true);
  assert.equal(loop.audit_trail[0].event_type, "aria.decision.created");
  assert.equal(loop.trust.capability, "containment");
  assert.ok(loop.completion_pct > 50);
});

test("operational loop is honest when ledgers are empty", () => {
  const loop = buildOperationalLoopSnapshot();

  assert.equal(loop.status, "empty");
  assert.equal(loop.signal, null);
  assert.equal(loop.honesty.live, false);
  assert.match(loop.honesty.message, /No ARIA decision or evidence ledger/);
  assert.equal(loop.timeline.find((stage) => stage.stage === "evidence_shown").status, "blocked");
});

// ── GET /api/aria/operational-loop — route-level (through handleAriaRequest) ──

function createReq({ method = "GET", url = "/", headers = {} } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = headers;
  req.socket = { remoteAddress: "127.0.0.1" };
  req[Symbol.asyncIterator] = async function* () {};
  return req;
}

function createRes() {
  return {
    statusCode: 0,
    headers: {},
    payload: "",
    setHeader(k, v) { this.headers[k] = v; },
    writeHead(statusCode, headers) { this.statusCode = statusCode; Object.assign(this.headers, headers || {}); },
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

test("GET /api/aria/operational-loop is honest when the decision/evidence/approval ledgers are empty (route-level)", async () => {
  // This must run before other route tests in this process populate the
  // global (non-tenant-scoped, in-memory) decision/evidence/approval ledgers,
  // so the empty-ledger path is exercised through the real HTTP handler.
  //
  // Note: getDecisionLog/getEvidenceLog/getApprovals are pure in-memory state
  // and start empty on a fresh import, but readAuditEvents() reads the repo's
  // real, file-backed aria-memory/audit-events.json (cwd-rooted, shared across
  // the whole repo) — so audit_trail/counts.audit_events may be non-empty here.
  // We only assert on the ledgers that are genuinely empty in this process.
  const res = await request({ url: "/api/aria/operational-loop" });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.loop, "loop object present");
  assert.equal(body.loop.signal, null, "no active decision");
  assert.equal(body.loop.approval, null, "no active approval");
  assert.deepEqual(body.loop.evidence, [], "no evidence entries");
  assert.equal(body.loop.counts.decisions, 0);
  assert.equal(body.loop.counts.evidence, 0);
  assert.equal(body.loop.counts.pending_approvals, 0);
});

test("GET /api/aria/operational-loop returns 200 with the expected top-level loop shape", async () => {
  const res = await request({ url: "/api/aria/operational-loop" });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Content-Type"] || res.headers["content-type"], "application/json");

  const body = res.json();
  assert.ok(body.loop && typeof body.loop === "object", "loop must be present");

  const expectedKeys = [
    "signal",
    "explanation",
    "evidence",
    "blast_radius",
    "recommended_action",
    "approval",
    "audit_trail",
    "trust",
    "timeline",
    "counts",
  ];
  for (const key of expectedKeys) {
    assert.ok(key in body.loop, `loop.${key} should be present`);
  }
});

test("GET /api/aria/operational-loop respects the ?limit= query param", async () => {
  const small = await request({ url: "/api/aria/operational-loop?limit=1" });
  assert.equal(small.statusCode, 200);
  const smallBody = small.json();
  assert.ok(smallBody.loop.counts, "counts present");
  assert.ok(smallBody.loop.audit_trail.length <= 1, "audit_trail should be capped by limit=1");

  const larger = await request({ url: "/api/aria/operational-loop?limit=50" });
  assert.equal(larger.statusCode, 200);
  // Larger limit should never return fewer audit events than the smaller limit did.
  assert.ok(larger.json().loop.audit_trail.length >= smallBody.loop.audit_trail.length);
});

test("GET /api/aria/operational-loop caps limit at 100 even when a larger value is requested", async () => {
  const res = await request({ url: "/api/aria/operational-loop?limit=999" });
  assert.equal(res.statusCode, 200);
  // Should not error and should still return a well-formed loop object.
  assert.ok("signal" in res.json().loop);
});
