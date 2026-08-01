// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

const tenantId = "tenant-decision-override";
const orchestrator = await import("../../server/ariaOrchestrator.mjs");
const { handleAriaRequest } = await import("../../server/index.mjs");
const { readAuditEvents } = await import("../../server/auditLog.mjs");

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
    setHeader(name, value) { this.headers[name] = value; },
    writeHead(statusCode, headers) { this.statusCode = statusCode; Object.assign(this.headers, headers || {}); },
    end(payload = "") { this.payload = payload; },
    json() { return JSON.parse(this.payload); },
  };
}

async function request(options) {
  const res = createRes();
  await handleAriaRequest(createReq(options), res);
  return res;
}

test("operator override persists the wrong recommendation, evidence rejection, audit, and trust effect", async () => {
  const decision = orchestrator.makeDecision({
    observation: "One endpoint produced an unusual outbound connection.",
    reasoning: "ARIA inferred compromise from an incomplete signal.",
    recommended_action: { verb: "isolate_host", target: { system: "endpoint", resource: "workstation-7" }, reversible: true },
    fallback_action: { verb: "collect_evidence", target: { system: "endpoint", resource: "workstation-7" }, rationale: "Gather process evidence first." },
    requires_human_approval: true,
  });
  orchestrator.logDecision(decision, tenantId);
  const evidence = orchestrator.makeEvidenceRecord({
    decision_id: decision.decision_id,
    requested_by: "aria",
    approval_mode_at_time: "approval",
    system: "endpoint",
    why: decision.reasoning,
  });
  orchestrator.logEvidence(evidence, tenantId);

  const res = await request({
    method: "POST",
    url: `/api/aria/decisions/${encodeURIComponent(decision.decision_id)}/override`,
    headers: { "x-tenant-id": tenantId, "x-user-id": "operator-1", "x-role": "admin" },
    body: {
      reason: "The destination is an approved backup service and isolation would interrupt payroll.",
      alternative_action: decision.fallback_action,
    },
  });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.resolution.status, "overridden");
  assert.equal(body.capability, "containment");
  assert.equal(body.trust.overrides, 1);
  assert.equal(body.decision.resolution.actor, "operator-1");

  const storedEvidence = (await orchestrator.getEvidenceLog(tenantId, 20)).find((item) => item.evidence_id === evidence.evidence_id);
  assert.equal(storedEvidence.status, "rejected");
  assert.equal(storedEvidence.outcome.type, "operator_override");

  const audit = await readAuditEvents({ tenant_id: tenantId, limit: 100 });
  const event = audit.find((item) => item.event_type === "aria.decision.overridden" && item.context?.decision_id === decision.decision_id);
  assert.ok(event);
  assert.equal(event.context.capability, "containment");
});
