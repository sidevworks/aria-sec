// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { evaluateAiSpmRisks } from "../../server/aiRiskEngine.mjs";
import { generateAttackNarrative } from "../../server/attackNarrative.mjs";

const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/ai-spm-mixed-signals.fixture.json", import.meta.url), "utf8"),
);

test("AI-SPM mixed GitHub+AWS fixture yields stable risk findings", () => {
  const inventory = fixture.inventory;
  const findings = evaluateAiSpmRisks(inventory);
  const findingCodes = new Set(findings.map((item) => item.code));

  assert.ok(findingCodes.has("ai-secret-in-source"));
  assert.ok(findingCodes.has("ai-system-near-secret"));
  assert.ok(findingCodes.has("agent-broad-tool-surface"));
  assert.ok(findingCodes.has("sensitive-rag-data-plane"));
  assert.ok(findingCodes.has("rag-application-detected"));

  assert.ok(findings.length >= 5);
  assert.equal(findings[0].severity, "critical");
  assert.ok(findings.every((item) => item.repo === "acme/support-assistant"));
});

test("AI-SPM mixed-signal narrative keeps evidence coherent and secret-safe", () => {
  const inventory = fixture.inventory;
  const findings = evaluateAiSpmRisks(inventory);
  const primary = findings.find((item) => item.code === "ai-system-near-secret") || findings[0];
  const narrative = generateAttackNarrative({
    inventory,
    findings,
    findingId: primary?.id,
  });

  assert.equal(narrative.status, "ready");
  assert.equal(narrative.finding?.id, primary?.id);
  assert.match(narrative.likely_attack_path, /credential|abuse|retrieval/i);
  assert.ok(Array.isArray(narrative.related_findings));
  assert.ok(narrative.related_findings.length > 0);
  assert.ok(Array.isArray(narrative.recommended_actions));
  assert.ok(narrative.recommended_actions.length > 2);

  const serialized = JSON.stringify(narrative);
  assert.doesNotMatch(serialized, /sk-[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(serialized, /AKIA[0-9A-Z]{16}/);
});
