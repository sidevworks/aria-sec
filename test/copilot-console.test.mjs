// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import test from "node:test";

import {
  answerCopilotPrompt,
  getCopilotContextCards,
  summarizeDataCaveat,
} from "../src/copilot/copilotContext.js";

const context = {
  route: {
    activePanel: { id: "ai-spm", label: "AI-SPM" },
    activeSector: { id: "command", label: "Command" },
  },
  metrics: {
    threatLevel: "HIGH",
    riskScore: 82,
    activeIncidents: 1,
    reviewItems: ["Public model endpoint needs review"],
  },
  sourceHealth: {
    counts: { live: 2, stale: 1, unavailable: 1, unknown: 0 },
    sources: [
      { id: "github", label: "GitHub", status: "live" },
      { id: "okta", label: "Okta", status: "unavailable" },
    ],
  },
  identity: {
    selected: { email: "analyst@example.com", user_id: "u-1" },
    sessionCount: 3,
  },
  aiSpm: {
    assetCount: 12,
    findingCount: 4,
    criticalFindings: 1,
    latestFinding: { id: "finding-1", title: "Public model endpoint", severity: "critical" },
  },
  governance: {
    autonomyMode: "confirm",
    availableActions: [
      { id: "act-1", label: "Quarantine exposed model route", approvalRequired: true },
    ],
    pendingApprovals: [{ id: "approval-1", label: "Quarantine exposed model route" }],
    approvalRequiredCount: 1,
    decisionHistory: [{ id: "decision-1", summary: "Escalated AI exposure" }],
  },
  evidence: {
    latest: [{ id: "ev-1", source: "ai-spm", summary: "Public model endpoint", severity: "critical" }],
  },
  incidents: [{ id: "inc-1", title: "External exposure detected", severity: "critical", affectedEntities: ["model-api"] }],
  events: {
    recentFeed: ["AI-SPM scan complete"],
    recentToasts: [{ title: "REVIEW", message: "External exposure detected" }],
  },
  flags: {
    demoData: true,
    staleData: true,
    unavailableData: true,
  },
};

test("copilot context cards summarize panel, risk, entity, governance, and evidence", () => {
  const cards = getCopilotContextCards(context);
  assert.equal(cards[0].value, "AI-SPM");
  assert.equal(cards[1].value, "HIGH - 82");
  assert.equal(cards[2].value, "analyst@example.com");
  assert.match(cards[3].value, /1 approvals/);
  assert.equal(cards[4].value, "Public model endpoint");
});

test("copilot caveat is honest about demo, stale, and unavailable data", () => {
  const caveat = summarizeDataCaveat(context);
  assert.match(caveat, /demo data/);
  assert.match(caveat, /stale telemetry/);
  assert.match(caveat, /unavailable sources/);
});

test("copilot answers blast radius and stages safest governed action", () => {
  const blast = answerCopilotPrompt("Show blast radius.", context);
  assert.match(blast, /Blast radius/);
  assert.match(blast, /model-api/);
  assert.match(blast, /12 assets/);

  const staged = answerCopilotPrompt("Stage the safest action.", context);
  assert.match(staged, /Quarantine exposed model route/);
  assert.match(staged, /approval/);
  assert.match(staged, /pending/);
});

test("copilot explains risk and CISO summary from current context", () => {
  const risk = answerCopilotPrompt("Why is this risky?", context);
  assert.match(risk, /Threat level is HIGH/);
  assert.match(risk, /External exposure detected/);

  const ciso = answerCopilotPrompt("Explain this to a CISO.", context);
  assert.match(ciso, /CISO brief/);
  assert.match(ciso, /controlled investigation/);
});
