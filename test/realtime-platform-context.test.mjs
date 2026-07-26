// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import test from "node:test";

import { buildRealtimePlatformContext } from "../src/realtimePlatformContext.js";

const panels = [
  { id: "overview", label: "Overview" },
  { id: "threat-overview", label: "Threat Overview" },
  { id: "identity-sessions", label: "Identity & Sessions" },
  { id: "ai-spm", label: "AI-SPM" },
];

const sectors = [
  { id: "threat", label: "Threat Sector", panels: ["threat-overview"] },
  { id: "identity", label: "Identity Sector", panels: ["identity-sessions"] },
  { id: "ai", label: "AI Sector", panels: ["ai-spm"] },
];

test("context snapshot includes route, source health, risk, scan, panel and recent events", () => {
  const snapshot = buildRealtimePlatformContext({
    activeDashPanel: "threat-overview",
    activeSector: "threat",
    dashVisible: true,
    ariaState: "arrived",
    agentStatus: "scanning",
    threatLevel: "HIGH",
    incidentCount24h: 3,
    telemetryOnline: true,
    modelMode: "local",
    fetchError: null,
    panelCatalog: panels,
    sectorCatalog: sectors,
    livePanelData: {
      simulated: false,
      updated_at: "2026-06-03T08:00:00.000Z",
      summary: {
        review_items: ["Investigate east-west spike"],
        source_fabric: [
          { id: "siem", label: "SIEM", status: "live" },
          { id: "edr", label: "EDR", status: "stale" },
        ],
      },
      panels: {
        "threat-overview": { risk_score: 82, threat_level: "HIGH", summary: "Elevated perimeter risk" },
        "incident-feed": { items: [{ id: "inc-1", severity: "critical", title: "Impossible travel" }] },
        network: { connections: [{ id: "conn-1", remote: "10.0.0.5" }] },
      },
      feed: ["Telemetry refresh complete"],
    },
    aiSpmState: {
      loading: false,
      demoMode: false,
      summary: { asset_count: 4, critical_count: 1 },
      findings: [{ id: "f-1", severity: "critical", title: "Public model endpoint" }],
      githubConnector: { connected: true, status: "live" },
      oktaScanResult: { findings: [{ id: "okta-1" }] },
      oktaMessage: "Okta scan complete",
    },
    securityAdminState: {
      tenantContext: { tenant_id: "tenant-1", user_id: "u-1", role: "security_admin" },
      authDenials: [{ id: "deny-1", action: "session.revoke" }],
      dataUnavailable: false,
    },
    identitySessionsState: {
      identityCard: { user_id: "u-1", email: "analyst@example.com", role: "security_admin" },
      sessions: [{ id: "s-1", user: "analyst@example.com", source: "okta", risk: "medium" }],
      loading: false,
    },
    policyChangeState: { policies: [{ id: "p-1" }], history: [{ id: "h-1", action: "update" }] },
    approvalQueue: [{ id: "approval-1", label: "Block suspicious IP", risk: "high" }],
    autonomyMode: "confirm",
    overviewReport: { headline: "Posture elevated", actions: ["Review impossible travel"] },
    operationalLoop: {
      status: "active",
      current_stage: "approval_pending",
      signal: { id: "dec-1", observation: "Impossible travel requires session revocation" },
      recommended_action: { verb: "revoke_session", approval_state: "pending" },
    },
    liveFeed: ["AI-SPM scan complete", "Okta connected"],
    toasts: [{ title: "REVIEW", message: "Impossible travel", type: "warning" }],
  });

  assert.equal(snapshot.route.activePanel.id, "threat-overview");
  assert.equal(snapshot.route.activePanel.label, "Threat Overview");
  assert.equal(snapshot.route.activeSector.id, "threat");
  assert.equal(snapshot.metrics.riskScore, 82);
  assert.equal(snapshot.metrics.criticalIncidents, 1);
  assert.equal(snapshot.sourceHealth.counts.live, 2);
  assert.equal(snapshot.sourceHealth.counts.stale, 1);
  assert.equal(snapshot.scan.state, "scanning");
  assert.equal(snapshot.scan.recentResult.source, "okta");
  assert.equal(snapshot.panelSummary.id, "threat-overview");
  assert.equal(snapshot.identity.selected.email, "analyst@example.com");
  assert.equal(snapshot.aiSpm.findingCount, 1);
  assert.equal(snapshot.securityAdmin.denialCount, 1);
  assert.equal(snapshot.governance.autonomyMode, "confirm");
  assert.equal(snapshot.governance.approvalRequiredCount, 1);
  assert.equal(snapshot.governance.pendingApprovals.length, 1);
  assert.equal(snapshot.evidence.latest.length > 0, true);
  assert.equal(snapshot.operationalLoop.current_stage, "approval_pending");
  assert.equal(snapshot.events.recentToasts[0].title, "REVIEW");
  assert.equal(snapshot.flags.demoData, false);
  assert.equal(snapshot.flags.staleData, true);
  assert.equal(snapshot.flags.unavailableData, false);
});

test("context snapshot marks unavailable telemetry and demo AI-SPM clearly", () => {
  const snapshot = buildRealtimePlatformContext({
    activeDashPanel: null,
    activeSector: null,
    dashVisible: false,
    ariaState: "idle",
    agentStatus: "monitoring",
    threatLevel: "UNKNOWN",
    incidentCount24h: 0,
    telemetryOnline: false,
    fetchError: "NETWORK_ERROR",
    panelCatalog: panels,
    sectorCatalog: sectors,
    livePanelData: null,
    aiSpmState: { demoMode: true, loading: true, findings: [] },
    securityAdminState: { dataUnavailable: true, authDenials: [] },
    identitySessionsState: { sessions: [], error: "Sessions endpoint unavailable" },
    liveFeed: [],
    toasts: [],
  });

  assert.equal(snapshot.route.activePanel.id, "none");
  assert.equal(snapshot.sourceHealth.telemetryOnline, false);
  assert.equal(snapshot.flags.demoData, true);
  assert.equal(snapshot.flags.unavailableData, true);
  assert.equal(snapshot.flags.staleData, true);
  assert.equal(snapshot.scan.state, "ai_spm_loading");
});

test("context snapshot includes enriched monitoring context for identity, network, and audit", () => {
  const snapshot = buildRealtimePlatformContext({
    activeDashPanel: "identity-galaxy",
    activeSector: "identity",
    panelCatalog: panels,
    sectorCatalog: sectors,
    monitoringContext: {
      identity: {
        galaxies: [{ id: "dept-fin", name: "Finance", signals: { anomalyCount: 5 } }],
        dataMode: "live",
      },
      network: {
        activeScan: { id: "scan-1", status: "timeout", message: "active scan timed out" },
        authStatus: "authorized",
      },
      audit: {
        deniedEvents: [{ id: "deny-1", event_type: "authz.role_denied" }],
        totalDenied: 1,
      },
    },
    operationalLoop: {
      status: "active",
      current_stage: "approval_pending",
    },
  });

  assert.equal(snapshot.identity.galaxies.length, 1);
  assert.equal(snapshot.identity.galaxies[0].name, "Finance");
  assert.equal(snapshot.network.activeScan.status, "timeout");
  assert.equal(snapshot.audit.deniedEvents.length, 1);
});
