// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { collectLiveTelemetrySync } from "./liveTelemetry.mjs";
import { buildHostIsolationPlan, scanLocalArtifacts } from "./localArtifactScanner.mjs";

const now = () => new Date().toISOString();

export const securityState = {
  get incidents() {
    return getMonitoringSnapshot().panels["incident-feed"].items;
  },
  get blockedIps() {
    return getMonitoringSnapshot().panels["blocked-ips"].items;
  },
  get quarantinedFiles() {
    return getMonitoringSnapshot().panels.quarantine.items;
  },
  get services() {
    return getMonitoringSnapshot().summary.sources.map((source) => ({
      name: source.id,
      status: source.status,
    }));
  },
};

export function getMonitoringSnapshot() {
  return collectLiveTelemetrySync();
}

export function getLiveEvents(limit = 6) {
  return getMonitoringSnapshot().feed.slice(0, limit);
}

export function runScan({ depth = "standard", target = "local host" } = {}) {
  const snapshot = getMonitoringSnapshot();
  const reviewItems = snapshot.summary.review_items || [];
  const findings = reviewItems.length
    ? reviewItems.map((summary) => ({ severity: snapshot.summary.severity, summary, source: "live-policy" }))
    : [
        {
          severity: "low",
          summary: "No configured live source exceeded review thresholds during this scan.",
          source: "live-policy",
        },
      ];

  return {
    status: "complete",
    data_mode: "live",
    provenance: "local-telemetry-and-policy",
    action: "run_scan",
    target,
    depth,
    generated_at: now(),
    findings,
    feed: [
      `Live ${depth} scan completed against ${target}`,
      `${findings.length} source-backed finding${findings.length === 1 ? "" : "s"} returned`,
    ],
  };
}

export function isolateThreat({ incident_id = "LIVE-REVIEW", scope = "selected entity" } = {}) {
  return {
    status: "approval_staged",
    data_mode: "live",
    enforcement_mode: "not-enforced",
    action: "isolate_threat",
    incident_id,
    scope,
    feed: [
      `Isolation request staged for ${scope}`,
      "Production mode requires an explicit connector or host action before containment is executed",
    ],
  };
}

export function generateIncidentReport({ incident_id = "LIVE-REVIEW", audience = "executive" } = {}) {
  const snapshot = getMonitoringSnapshot();
  return {
    status: "complete",
    data_mode: "live",
    provenance: "local-telemetry-and-policy",
    action: "generate_incident_report",
    incident_id,
    audience,
    report: {
      title: `ARIA live ${audience} posture report`,
      severity: snapshot.summary.severity,
      summary: snapshot.summary.headline,
      sources: snapshot.summary.sources,
      review_items: snapshot.summary.review_items,
    },
    feed: [
      `${audience} live posture report generated`,
      "Report includes source health, review items, and available approved actions",
    ],
  };
}

export async function scanLocalHostArtifacts({ roots = [], maxDepth = 5, maxEntries = 4000 } = {}) {
  const result = await scanLocalArtifacts({ roots, maxDepth, maxEntries });
  return {
    status: "complete",
    data_mode: "live",
    provenance: "local-filesystem-observation",
    action: "scan_local_host_artifacts",
    generated_at: now(),
    summary: {
      findings: result.findings.length,
      scanned_entries: result.scannedEntries,
      truncated: result.truncated,
      severity_counts: result.severityCounts,
    },
    findings: result.findings,
    feed: [
      `Local artifact scan completed across ${result.roots.length} root path(s)`,
      `${result.findings.length} suspicious item(s) flagged for operator review`,
    ],
  };
}

export function stageHostIsolation({ hostLabel = "local-host", reason = "Operator-requested containment" } = {}) {
  const plan = buildHostIsolationPlan({ hostLabel, reason });
  return {
    status: "approval_staged",
    data_mode: "live",
    enforcement_mode: "not-enforced",
    action: "stage_host_isolation",
    plan,
    feed: [
      `Isolation plan staged for ${plan.hostLabel}`,
      "Plan is local-host-only and does not wipe or reach remote systems",
    ],
  };
}

export function openDestination({ destination = "threat-overview" } = {}) {
  return {
    status: "routing",
    action: "open_destination",
    destination,
    feed: [`Routing operator workspace to ${destination}`],
  };
}

export function executeAriaFunction(name, args = {}) {
  const functions = {
    get_monitoring_snapshot: getMonitoringSnapshot,
    get_live_events: ({ limit } = {}) => ({ events: getLiveEvents(limit) }),
    run_scan: runScan,
    isolate_threat: isolateThreat,
    generate_incident_report: generateIncidentReport,
    open_destination: openDestination,
    scan_local_host_artifacts: scanLocalHostArtifacts,
    stage_host_isolation: stageHostIsolation,
  };

  const fn = functions[name];
  if (!fn) {
    return { status: "unsupported", error: `Unsupported Aria function: ${name}` };
  }

  return fn(args);
}
