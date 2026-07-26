// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

/**
 * correlation-rules.mjs — starter rule set for the ARIA reasoning engine.
 *
 * Each rule is DATA not code. The reasoningEngine evaluates them against
 * the rolling signal buffer without modifying this file.
 *
 * Signal metric keys available:
 *   memory.pressure   0.0–1.0  (freemem/totalmem inverse)
 *   process.cpu       0.0–N    (CPU % of top process / 100)
 *   network.newOutbound        exists | count of new outbound sockets in window
 *   auth.failures     count    auth failures in window
 *   process.newHigh   exists   new process with high CPU appeared in window
 *   scan.finding      exists   any new AI-SPM or network scan finding
 *   incident.open     count    currently open incidents
 */

export const CORRELATION_RULES = [
  {
    id: "mem-cpu-egress",
    name: "Resource exhaustion with new egress",
    signals: [
      { metric: "memory.pressure", op: ">", value: 0.85, window: "5m" },
      { metric: "process.cpu",     op: ">", value: 1.5,  window: "5m" },
      { metric: "network.newOutbound", op: "exists", window: "5m" },
    ],
    combine: "ALL",
    hypothesis: "Possible resource hijack or data staging by {process} to {remoteIp}",
    severity: "high",
    proposedActions: ["isolate-process", "block-ip", "deep-scan"],
    mappedControls: ["ECC-2-3-1", "ECC-2-3-4"],
  },
  {
    id: "auth-flood-new-process",
    name: "Auth failure flood with new high-CPU process",
    signals: [
      { metric: "auth.failures",   op: ">", value: 5,  window: "2m" },
      { metric: "process.newHigh", op: "exists", window: "2m" },
    ],
    combine: "ALL",
    hypothesis: "Credential stuffing attempt may have succeeded — new high-CPU process {process} appeared after {authFailures} auth failures",
    severity: "critical",
    proposedActions: ["kill-process", "block-ip", "collect-evidence"],
    mappedControls: ["ECC-1-2-3", "ECC-2-3-1"],
  },
  {
    id: "cpu-spike-egress",
    name: "Sudden CPU spike with new outbound connection",
    signals: [
      { metric: "process.cpu",         op: ">", value: 2.0, window: "3m" },
      { metric: "network.newOutbound", op: "exists",        window: "3m" },
    ],
    combine: "ALL",
    hypothesis: "Process {process} is consuming high CPU and opened a new outbound connection to {remoteIp} — possible exfiltration or C2 beaconing",
    severity: "high",
    proposedActions: ["isolate-process", "block-ip"],
    mappedControls: ["ECC-2-3-4"],
  },
  {
    id: "memory-pressure-scan-finding",
    name: "High memory pressure coinciding with new scan finding",
    signals: [
      { metric: "memory.pressure", op: ">", value: 0.9, window: "5m" },
      { metric: "scan.finding",    op: "exists",        window: "5m" },
    ],
    combine: "ALL",
    hypothesis: "High memory pressure coincides with a new scan finding — possible exploitation of a known vulnerability under active load",
    severity: "medium",
    proposedActions: ["collect-evidence", "deep-scan"],
    mappedControls: ["ECC-2-3-1"],
  },
  {
    id: "multi-open-incidents",
    name: "Multiple simultaneous open incidents",
    signals: [
      { metric: "incident.open", op: ">", value: 3, window: "10m" },
    ],
    combine: "ALL",
    hypothesis: "More than 3 concurrent open incidents — possible coordinated attack or cascading failure",
    severity: "critical",
    proposedActions: ["collect-evidence", "geo-lookup"],
    mappedControls: ["ECC-1-2-3", "ECC-2-3-4"],
  },
];
