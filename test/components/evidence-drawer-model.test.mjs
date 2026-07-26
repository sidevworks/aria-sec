// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import test from "node:test";

import { EMPTY_TEXT, normalizeEvidenceDrawerData } from "../../src/panels/shared/evidenceDrawerModel.js";

test("normalizes evidence drawer aliases and collection fields", () => {
  const data = normalizeEvidenceDrawerData({
    provider: "CloudTrail",
    detected_at: "2026-06-19T10:15:00Z",
    affected_entities: [{ id: "iam:user/admin", severity: "critical" }],
    findings: ["Privilege escalation", { title: "MFA disabled", detail: "Root account has no hardware key." }],
    sequence: [{ time: "10:11", title: "Console login" }],
    impact: "3 production accounts",
    confidence_score: 0.91,
    controls: [{ name: "Break-glass policy", state: "requires approval" }],
    remediation: "Revoke stale sessions",
    approval: "Pending human approval",
    auditEvents: [{ title: "Decision recorded", timestamp: "10:16" }],
  });

  assert.equal(data.source, "CloudTrail");
  assert.equal(data.timestamp, "2026-06-19T10:15:00Z");
  assert.equal(data.blastRadius, "3 production accounts");
  assert.equal(data.recommendedAction, "Revoke stale sessions");
  assert.equal(data.approvalState, "Pending human approval");
  assert.equal(data.confidence.label, "91%");
  assert.equal(data.confidence.level, "high");
  assert.equal(data.affectedEntities[0].title, "iam:user/admin");
  assert.equal(data.relatedFindings[1].detail, "Root account has no hardware key.");
  assert.equal(data.timeline[0].time, "10:11");
  assert.equal(data.policyControls[0].title, "Break-glass policy");
  assert.equal(data.auditTrail[0].meta, "10:16");
});

test("keeps unavailable evidence states explicit", () => {
  const data = normalizeEvidenceDrawerData();

  assert.equal(data.source, EMPTY_TEXT);
  assert.equal(data.timestamp, EMPTY_TEXT);
  assert.equal(data.blastRadius, EMPTY_TEXT);
  assert.equal(data.recommendedAction, EMPTY_TEXT);
  assert.equal(data.approvalState, EMPTY_TEXT);
  assert.equal(data.confidence.label, EMPTY_TEXT);
  assert.deepEqual(data.affectedEntities, []);
  assert.deepEqual(data.relatedFindings, []);
  assert.deepEqual(data.timeline, []);
  assert.deepEqual(data.policyControls, []);
  assert.deepEqual(data.auditTrail, []);
});
