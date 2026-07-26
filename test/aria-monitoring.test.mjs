// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import test from "node:test";
import {
  createMonitoringAlertBuffer,
  detectMonitoringAlerts,
} from "../src/ariaMonitoring.js";

const baseSnapshot = {
  generated_at: "2026-06-03T00:00:00.000Z",
  threat_level: "LOW",
  summary: {
    sources: [
      { id: "network-sockets", label: "Network sockets", status: "live", last_seen: "2026-06-03T00:00:00.000Z" },
    ],
  },
  panels: {
    "threat-overview": { risk_score: 42 },
    "incident-feed": { items: [{ id: "INC-1", severity: "medium", title: "Existing review item" }] },
  },
};

test("detectMonitoringAlerts emits only newly observed high or critical incidents", () => {
  const current = {
    ...baseSnapshot,
    generated_at: "2026-06-03T00:00:30.000Z",
    panels: {
      ...baseSnapshot.panels,
      "incident-feed": {
        items: [
          ...baseSnapshot.panels["incident-feed"].items,
          { id: "INC-2", severity: "critical", title: "Privileged token exposed", source: "ai-spm" },
        ],
      },
    },
  };

  const alerts = detectMonitoringAlerts({ previous: baseSnapshot, current, now: 1_000 });

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].key, "incident:critical:INC-2");
  assert.equal(alerts[0].severity, "critical");
  assert.match(alerts[0].spokenLine, /critical incident/i);
  assert.equal(alerts[0].sourcePanel, "incident-feed");
});

test("detectMonitoringAlerts reports risk-score jumps without firing on minor drift", () => {
  const current = {
    ...baseSnapshot,
    panels: {
      ...baseSnapshot.panels,
      "threat-overview": { risk_score: 70 },
    },
  };

  const alerts = detectMonitoringAlerts({ previous: baseSnapshot, current, now: 2_000 });

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].key, "threat-risk:jump");
  assert.equal(alerts[0].severity, "high");
  assert.match(alerts[0].detail, /42 to 70/);
});

test("detectMonitoringAlerts flags impossible travel and policy denial spikes from context", () => {
  const previousContext = {
    identity: { galaxies: [{ id: "dept-a", name: "Finance", signals: { anomalyCount: 1, policyViolations24h: 1 } }] },
    audit: { deniedEvents: [{ id: "deny-1" }] },
  };
  const currentContext = {
    identity: {
      galaxies: [{
        id: "dept-a",
        name: "Finance",
        signals: { anomalyCount: 6, policyViolations24h: 7 },
        users: [{ id: "u-1", name: "Sam Lee", anomalies: ["impossible travel from Manama to Tokyo"] }],
      }],
    },
    audit: { deniedEvents: [{ id: "deny-1" }, { id: "deny-2" }, { id: "deny-3" }, { id: "deny-4" }, { id: "deny-5" }] },
  };

  const alerts = detectMonitoringAlerts({ previous: baseSnapshot, current: baseSnapshot, previousContext, currentContext, now: 3_000 });

  assert.ok(alerts.some((alert) => alert.key === "identity:impossible-travel:u-1"));
  assert.ok(alerts.some((alert) => alert.key === "identity:policy-denial-spike:dept-a"));
  assert.ok(alerts.some((alert) => alert.key === "audit:policy-denial-spike"));
});

test("createMonitoringAlertBuffer dedupes stable keys until cooldown expires", () => {
  const buffer = createMonitoringAlertBuffer({ cooldownMs: 60_000 });
  const alert = {
    key: "incident:critical:INC-7",
    severity: "critical",
    spokenLine: "Critical incident detected.",
    detail: "A critical incident was detected.",
    sourcePanel: "incident-feed",
    entity: "INC-7",
    timestamp: "2026-06-03T00:00:00.000Z",
    recommendedAction: "Open incident feed.",
  };

  assert.equal(buffer.accept([alert], 10_000).length, 1);
  assert.equal(buffer.accept([alert], 40_000).length, 0);
  assert.equal(buffer.accept([alert], 75_000).length, 1);
});

test("detectMonitoringAlerts marks missing live sources unavailable instead of inventing data", () => {
  const current = {
    ...baseSnapshot,
    summary: {
      sources: [{ id: "network-sockets", label: "Network sockets", status: "error", detail: "netstat failed" }],
    },
  };

  const alerts = detectMonitoringAlerts({ previous: baseSnapshot, current, now: 4_000 });

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].key, "source:network-sockets:error");
  assert.match(alerts[0].detail, /unavailable/i);
});
