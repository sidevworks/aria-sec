// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import test from "node:test";
import { buildAuditEvidencePack, verifyAuditEvidencePack } from "../../server/auditExport.mjs";
import { logDecision, makeDecision } from "../../server/ariaOrchestrator.mjs";

test("audit evidence pack is tenant scoped, correlated, and tamper evident", async () => {
  const tenantId = "tenant-audit-export";
  const decision = makeDecision({ observation: "Test signal", reasoning: "Test evidence", recommended_action: { verb: "notify", target: { system: "analyst" } } });
  logDecision(decision, tenantId);
  const pack = await buildAuditEvidencePack({ tenantId, decisionId: decision.decision_id, actor: "audit-admin" });

  assert.equal(pack.scope.decision_id, decision.decision_id);
  assert.equal(pack.records.decisions.length, 1);
  assert.equal(pack.records.decisions[0].decision_id, decision.decision_id);
  assert.equal(verifyAuditEvidencePack(pack).ok, true);

  const tampered = structuredClone(pack);
  tampered.records.decisions[0].reasoning = "Altered after export";
  assert.equal(verifyAuditEvidencePack(tampered).ok, false);
});

test("audit evidence pack supports optional HMAC signing", async () => {
  const previous = process.env.ARIA_AUDIT_EXPORT_SIGNING_KEY;
  const key = "test-audit-export-signing-key-with-32-bytes-minimum";
  process.env.ARIA_AUDIT_EXPORT_SIGNING_KEY = key;
  try {
    const pack = await buildAuditEvidencePack({ tenantId: "tenant-signed-export", actor: "owner" });
    assert.equal(pack.manifest.integrity.signed, true);
    assert.equal(verifyAuditEvidencePack(pack, key).ok, true);
    assert.equal(verifyAuditEvidencePack(pack, `${key}-wrong`).ok, false);
  } finally {
    if (previous === undefined) delete process.env.ARIA_AUDIT_EXPORT_SIGNING_KEY;
    else process.env.ARIA_AUDIT_EXPORT_SIGNING_KEY = previous;
  }
});
